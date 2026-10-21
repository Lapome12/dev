import { KDF_MIN, Vault, type EntryInput } from '@cadenas/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Gardien, type DependancesGardien, type EtatCoffre } from '../src/gardien';
import type { MessageGardien, PageExtension } from '../src/messages';
import type { CoffreStocke, Stockage } from '../src/storage';

const ENTREE: EntryInput = {
  groupId: 'g',
  title: 'Exemple',
  username: 'demo@exemple.fr',
  password: 'motdepasse-fictif',
  url: 'https://exemple.fr',
  notes: '',
  totpUri: 'otpauth://totp/Exemple?secret=JBSWY3DPEHPK3PXP',
  tags: [],
  fields: [],
};

function preparer() {
  let maintenant = 1_000_000;
  let stocke: CoffreStocke | null = null;
  const minuteries = new Map<number, { fn: () => void; a: number }>();
  let suivante = 1;
  const copies: string[] = [];
  const etats: EtatCoffre[] = [];
  let fichierEcrit = 0;
  const stockage: Stockage = {
    lire: async () => stocke,
    ecrire: async (octets, nom) => {
      stocke = { ...(stocke ?? {}), octets, nom, enregistre: maintenant };
    },
    ecrireDansFichier: async () => {
      fichierEcrit++;
      return false;
    },
  };
  const d: DependancesGardien = {
    // Le vrai core, avec le KDF minimal pour que les tests restent rapides.
    coeur: {
      create: (n, p, c, kdf) => Vault.create(n, p, c, kdf),
      open: (o, p, c) => Vault.open(o, p, c),
      calibrateKdf: async () => ({ ...KDF_MIN }),
    },
    stockage,
    copier: (t) => copies.push(t),
    diffuser: (e) => etats.push(e),
    maintenant: () => maintenant,
    programmer: (fn, ms) => {
      const id = suivante++;
      minuteries.set(id, { fn, a: maintenant + ms });
      return id;
    },
    annuler: (id) => minuteries.delete(id as number),
  };
  const avancer = async (ms: number) => {
    maintenant += ms;
    for (const [id, m] of [...minuteries]) {
      if (m.a <= maintenant) {
        minuteries.delete(id);
        m.fn();
      }
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  return {
    gardien: new Gardien(d),
    copies,
    etats,
    avancer,
    stocke: () => stocke,
    fichierEcrit: () => fichierEcrit,
  };
}

const msg = (type: MessageGardien['type'], args: unknown[] = [], page: PageExtension | null = 'vault'): MessageGardien => ({
  cible: 'gardien',
  type,
  args,
  ...(page ? { page } : {}),
});

/** Ajoute ENTREE dans le groupe racine du coffre ouvert. */
async function ajouter(g: Gardien, modif: Partial<EntryInput> = {}): Promise<string> {
  const groupes = (await g.traiter(msg('vault/listGroups'))) as { id: string; parentId: string | null }[];
  const racine = groupes.find((x) => x.parentId === null);
  return (await g.traiter(msg('vault/addEntry', [{ ...ENTREE, groupId: racine?.id, ...modif }]))) as string;
}

describe('Gardien', { timeout: 30_000 }, () => {
  let t: ReturnType<typeof preparer>;
  beforeEach(() => {
    t = preparer();
  });

  it('crée un coffre, l’enregistre chiffré puis le verrouille et le rouvre', async () => {
    expect(await t.gardien.traiter(msg('vault/status'))).toEqual({ state: 'aucun-coffre' });
    await t.gardien.traiter(msg('vault/create', ['Perso', 'phrase de passe fictive']));
    expect(t.stocke()?.nom).toBe('Perso');
    expect(t.fichierEcrit()).toBe(1);
    expect(await t.gardien.traiter(msg('vault/status'))).toMatchObject({ state: 'deverrouille', name: 'Perso', dirty: false });

    await t.gardien.traiter(msg('vault/lock'));
    expect(await t.gardien.traiter(msg('vault/status'))).toEqual({ state: 'verrouille', name: 'Perso' });
    await expect(t.gardien.traiter(msg('vault/listEntries'))).rejects.toMatchObject({ code: 'verrouille' });
    await expect(t.gardien.traiter(msg('vault/unlock', ['mauvais']))).rejects.toMatchObject({ code: 'mauvais-mot-de-passe' });
    await t.gardien.traiter(msg('vault/unlock', ['phrase de passe fictive']));
    expect(t.etats.at(-1)).toMatchObject({ state: 'deverrouille' });
  });

  it('enregistre peu après une modification et avant de verrouiller', async () => {
    await t.gardien.traiter(msg('vault/create', ['Perso', 'pw']));
    const e1 = await ajouter(t.gardien);
    expect(await t.gardien.traiter(msg('vault/status'))).toMatchObject({ dirty: true });
    await t.avancer(1000);
    await vi.waitFor(() => expect(t.gardien.etat()).toMatchObject({ dirty: false }), { timeout: 10_000 });

    const e2 = await ajouter(t.gardien, { title: 'Deuxième' });
    await t.gardien.traiter(msg('vault/lock')); // sans attendre la minuterie
    await t.gardien.traiter(msg('vault/unlock', ['pw']));
    const ids = ((await t.gardien.traiter(msg('vault/listEntries'))) as { id: string }[]).map((e) => e.id);
    expect(ids.sort()).toEqual([e1, e2].sort());
  });

  it('se verrouille seul après l’inactivité réglée', async () => {
    await t.gardien.traiter(msg('vault/create', ['Perso', 'pw']));
    t.gardien.definirReglages({ autoLockMinutes: 2 });
    await t.avancer(60_000);
    await t.gardien.traiter(msg('interne/tic', [], null)); // le tic ne compte pas comme une activité
    expect(t.gardien.etat().state).toBe('deverrouille');
    await t.avancer(60_000);
    await t.gardien.traiter(msg('interne/tic', [], null));
    expect(t.gardien.etat().state).toBe('verrouille');
  });

  it('copie puis efface le presse-papiers ; le code TOTP, jamais la graine', async () => {
    await t.gardien.traiter(msg('vault/create', ['Perso', 'pw']));
    const id = await ajouter(t.gardien);
    t.gardien.definirReglages({ clipboardSeconds: 30 });
    await t.gardien.traiter(msg('vault/copySecret', [id, 'password'], 'popup'));
    expect(t.copies).toEqual(['motdepasse-fictif']);
    await t.avancer(29_000);
    expect(t.copies).toHaveLength(1);
    await t.avancer(1_000);
    expect(t.copies).toEqual(['motdepasse-fictif', '']);

    const { code } = (await t.gardien.traiter(msg('vault/getTotp', [id], 'popup'))) as { code: string };
    expect(code).toMatch(/^\d{6}$/);
    await t.gardien.traiter(msg('vault/copySecret', [id, 'totp'], 'popup'));
    expect(t.copies.at(-1)).toMatch(/^\d{6}$/);
    expect(t.copies.join()).not.toContain('otpauth');
    expect(await t.gardien.traiter(msg('vault/getSecret', [id, 'totp'], 'popup'))).toMatch(/^\d{6}$/);
  });

  it('ne donne la graine 2FA qu’à vault.html', async () => {
    await t.gardien.traiter(msg('vault/create', ['Perso', 'pw']));
    const id = await ajouter(t.gardien);
    await expect(t.gardien.traiter(msg('vault/getSecret', [id, { field: 'otp' }], 'popup'))).rejects.toMatchObject({ code: 'refuse' });
    await expect(t.gardien.traiter(msg('vault/copySecret', [id, { field: 'OTP' }], 'popup'))).rejects.toMatchObject({ code: 'refuse' });
    expect(await t.gardien.traiter(msg('vault/getSecret', [id, { field: 'otp' }], 'vault'))).toContain('otpauth://');
    // Format KeePass 2 : refusé au popup avant même de chercher le champ.
    for (const field of ['TimeOtp-Secret-Base32', 'HmacOtp-Secret']) {
      await expect(t.gardien.traiter(msg('vault/getSecret', [id, { field }], 'popup'))).rejects.toMatchObject({ code: 'refuse' });
    }
  });

  it('exige la clé actuelle pour changer de mot de passe maître', async () => {
    await t.gardien.traiter(msg('vault/create', ['Perso', 'ancienne phrase fictive']));
    await expect(t.gardien.traiter(msg('vault/changeMasterKey', ['nouvelle phrase fictive']))).rejects.toMatchObject({
      code: 'mauvais-mot-de-passe',
    });
    await expect(
      t.gardien.traiter(msg('vault/changeMasterKey', ['nouvelle phrase fictive', undefined, { password: 'pas la bonne' }])),
    ).rejects.toMatchObject({ code: 'mauvais-mot-de-passe' });
    // La clé n'a pas changé : l'ancienne rouvre toujours le coffre.
    await t.gardien.traiter(msg('vault/lock'));
    await t.gardien.traiter(msg('vault/unlock', ['ancienne phrase fictive']));

    await t.gardien.traiter(msg('vault/changeMasterKey', ['nouvelle phrase fictive', undefined, { password: 'ancienne phrase fictive' }]));
    await t.gardien.traiter(msg('vault/lock'));
    await expect(t.gardien.traiter(msg('vault/unlock', ['ancienne phrase fictive']))).rejects.toMatchObject({ code: 'mauvais-mot-de-passe' });
    await t.gardien.traiter(msg('vault/unlock', ['nouvelle phrase fictive']));
    expect(t.gardien.etat().state).toBe('deverrouille');
  });

  it('refuse une méthode du coffre sans page d’origine', async () => {
    await expect(t.gardien.traiter(msg('vault/status', [], null))).rejects.toMatchObject({ code: 'refuse' });
  });

  it('refuse une demande interne qui porte une page', async () => {
    await expect(t.gardien.traiter(msg('interne/identifiants', ['e1'], 'vault'))).rejects.toMatchObject({ code: 'refuse' });
  });

  it('remet les identifiants au service worker pour remplir', async () => {
    await t.gardien.traiter(msg('vault/create', ['Perso', 'pw']));
    const id = await ajouter(t.gardien);
    const cadres = ['https://exemple.fr/connexion', 'https://pub.autre-site.fr/cadre', 'http://exemple.fr/'];
    expect(await t.gardien.traiter(msg('interne/identifiants', [id, cadres, 'https://exemple.fr/'], null))).toEqual({
      urls: ['https://exemple.fr/connexion'],
      username: 'demo@exemple.fr',
      password: 'motdepasse-fictif',
    });
    await expect(
      t.gardien.traiter(
        msg('interne/identifiants', [id, ['https://exemple.fr.attaquant.com/', 'https://paypa1.com/'], 'https://paypa1.com/'], null),
      ),
    ).rejects.toMatchObject({ code: 'refuse' });
  });

  it('refuse une iframe légitime posée dans une page hostile', async () => {
    await t.gardien.traiter(msg('vault/create', ['Perso', 'pw']));
    const id = await ajouter(t.gardien);
    await expect(
      t.gardien.traiter(msg('interne/identifiants', [id, ['https://exemple.fr/connexion'], 'https://piege.example/'], null)),
    ).rejects.toMatchObject({ code: 'refuse' });
    await expect(t.gardien.traiter(msg('interne/identifiants', [id, ['https://exemple.fr/connexion']], null))).rejects.toMatchObject({
      code: 'refuse',
    });
  });
});
