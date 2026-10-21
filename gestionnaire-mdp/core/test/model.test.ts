import * as kdbxweb from 'kdbxweb';
import { beforeEach, describe, expect, it } from 'vitest';
import { Vault, VaultError, type EntryInput } from '../src/index';
import { base32Encode } from '../src/totp';
import { hasKeepassxc, keepassxc, MDP_FIXTURE, readFixture, writeTemp } from './helpers';

const MDP = 'Correct-Cheval-Pile-Agrafe-2026';
const raw = (v: Vault) => (v as unknown as { db: kdbxweb.Kdbx }).db;
const SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'));

let vault: Vault;
let rootId: string;
let binId: string;

function input(over: Partial<EntryInput> = {}): EntryInput {
  return {
    groupId: rootId,
    title: 'Exemple',
    username: 'demo@exemple.fr',
    password: 'Mdp-Exemple-42!',
    url: 'https://exemple.fr/connexion',
    notes: '',
    tags: [],
    fields: [],
    ...over,
  };
}

beforeEach(async () => {
  vault = await Vault.create('Test', MDP);
  const groups = vault.listGroups();
  rootId = groups.find((g) => g.parentId === null)!.id;
  binId = groups.find((g) => g.isRecycleBin)!.id;
});

describe('groupes', () => {
  it('liste la racine et la corbeille, ajoute, renomme, supprime', () => {
    expect(vault.listGroups()).toHaveLength(2);
    const banque = vault.addGroup('Banque', null);
    const sous = vault.addGroup('Comptes pro', banque);
    expect(vault.listGroups().find((g) => g.id === sous)).toMatchObject({ name: 'Comptes pro', parentId: banque, isRecycleBin: false });
    vault.renameGroup(banque, '  Banques  ');
    expect(vault.listGroups().find((g) => g.id === banque)!.name).toBe('Banques');
    vault.deleteGroup(banque);
    expect(vault.listGroups().find((g) => g.id === banque)!.parentId).toBe(binId);
    vault.deleteGroup(banque); // déjà dans la corbeille : définitif, avec ses sous-groupes
    expect(vault.listGroups().map((g) => g.id)).not.toContain(sous);
  });

  it('protège la racine, la corbeille et les noms vides', () => {
    expect(() => vault.deleteGroup(rootId)).toThrow(RangeError);
    expect(() => vault.deleteGroup(binId)).toThrow(RangeError);
    expect(() => vault.addGroup('   ', null)).toThrow(RangeError);
    expect(() => vault.renameGroup('inexistant', 'x')).toThrow(VaultError);
  });
});

describe('entrées', () => {
  it('ajoute et relit une entrée sans exposer le mot de passe', () => {
    const id = vault.addEntry(input({ tags: ['perso', 'web;mail', 'perso'], notes: 'Note' }));
    const d = vault.getEntry(id);
    expect(d).toMatchObject({ id, groupId: rootId, title: 'Exemple', username: 'demo@exemple.fr', url: 'https://exemple.fr/connexion', notes: 'Note', hasTotp: false, historyCount: 0 });
    expect(d.tags).toEqual(['perso', 'web mail']);
    expect(JSON.stringify(d)).not.toContain('Mdp-Exemple-42!');
    expect(d.passwordStrength).toBeGreaterThanOrEqual(2);
    expect(vault.getSecret(id, 'password')).toBe('Mdp-Exemple-42!');
    expect(d.created).toBeGreaterThan(0);
    expect(d.modified).toBeGreaterThan(0);
  });

  it('stocke le mot de passe comme valeur protégée KDBX', () => {
    const id = vault.addEntry(input());
    const entry = [...raw(vault).groups[0]!.allEntries()].find((e) => e.uuid.id === id)!;
    expect(entry.fields.get('Password')).toBeInstanceOf(kdbxweb.ProtectedValue);
  });

  it('champs personnalisés : protégés masqués, lisibles par getSecret, conservés si renvoyés vides', () => {
    const id = vault.addEntry(input({ fields: [{ key: 'PIN', value: '1234', protected: true }, { key: 'Client', value: 'C-42', protected: false }] }));
    expect(vault.getEntry(id).fields).toEqual([{ key: 'PIN', value: '', protected: true }, { key: 'Client', value: 'C-42', protected: false }]);
    expect(vault.getSecret(id, { field: 'PIN' })).toBe('1234');
    vault.updateEntry(id, input({ fields: vault.getEntry(id).fields }));
    expect(vault.getSecret(id, { field: 'PIN' })).toBe('1234');
    vault.updateEntry(id, input({ fields: [] }));
    expect(() => vault.getSecret(id, { field: 'PIN' })).toThrow(VaultError);
    expect(() => vault.addEntry(input({ fields: [{ key: 'Password', value: 'x', protected: true }] }))).toThrow(RangeError);
    expect(() => vault.addEntry(input({ fields: [{ key: 'a', value: '1', protected: false }, { key: 'a', value: '2', protected: false }] }))).toThrow(RangeError);
  });

  it('garde l’historique à chaque modification, dans la limite du coffre', () => {
    const id = vault.addEntry(input());
    vault.updateEntry(id, input({ password: 'Deuxieme-Mdp-77?' }));
    expect(vault.getEntry(id).historyCount).toBe(1);
    const entry = [...raw(vault).groups[0]!.allEntries()].find((e) => e.uuid.id === id)!;
    expect((entry.history[0]!.fields.get('Password') as kdbxweb.ProtectedValue).getText()).toBe('Mdp-Exemple-42!');
    raw(vault).meta.historyMaxItems = 3;
    for (let i = 0; i < 5; i++) vault.updateEntry(id, input({ title: `v${i}` }));
    expect(vault.getEntry(id).historyCount).toBe(3);
  });

  it('déplace une entrée en changeant son groupe', () => {
    const g = vault.addGroup('Travail', null);
    const id = vault.addEntry(input());
    vault.updateEntry(id, input({ groupId: g }));
    expect(vault.listEntries(g).map((e) => e.id)).toEqual([id]);
    expect(vault.listEntries(rootId)).toHaveLength(0);
  });

  it('corbeille puis suppression définitive', () => {
    const id = vault.addEntry(input());
    vault.deleteEntry(id);
    expect(vault.getEntry(id).groupId).toBe(binId);
    expect(vault.listEntries()).toHaveLength(0); // hors corbeille
    expect(vault.listEntries(binId)).toHaveLength(1);
    vault.deleteEntry(id);
    expect(() => vault.getEntry(id)).toThrow(VaultError);
  });

  it('entrée ou groupe introuvable', () => {
    expect(() => vault.getEntry('nope')).toThrow(VaultError);
    expect(() => vault.addEntry(input({ groupId: 'nope' }))).toThrow(VaultError);
    try {
      vault.getEntry('nope');
    } catch (e) {
      expect((e as VaultError).code).toBe('introuvable');
    }
  });

  it('recherche sans accents ni casse, sur titre, identifiant, URL et tags', () => {
    const a = vault.addEntry(input({ title: 'Société Générale', username: 'eliott', url: 'https://particuliers.sg.fr', tags: ['Banque'] }));
    const b = vault.addEntry(input({ title: 'Météo', username: 'meteo@exemple.fr', url: 'https://meteo.exemple.fr', tags: ['Perso'] }));
    const ids = (q: string) => vault.search(q).map((e) => e.id).sort();
    expect(ids('societe')).toEqual([a]);
    expect(ids('GÉNÉRALE')).toEqual([a]);
    expect(ids('meteo')).toEqual([b]);
    expect(ids('banque eliott')).toEqual([a]);
    expect(ids('perso')).toEqual([b]);
    expect(ids('exemple.fr')).toEqual([b]);
    expect(ids('')).toEqual([a, b].sort());
    vault.deleteEntry(b);
    expect(ids('meteo')).toEqual([]);
  });
});

describe('TOTP dans le coffre', () => {
  const uri = `otpauth://totp/Exemple:demo?secret=${SECRET}&digits=8`;

  it('calcule le code sans exposer la graine', async () => {
    const id = vault.addEntry(input({ totpUri: uri }));
    expect(vault.getEntry(id).hasTotp).toBe(true);
    expect(await vault.getTotp(id, 59_000)).toEqual({ code: '94287082', period: 30, remaining: 1 });
    expect(() => vault.getSecret(id, 'totp')).toThrow(TypeError);
    expect(vault.getSecret(id, { field: 'otp' })).toBe(uri);
    expect(vault.getEntry(id).fields).toEqual([]); // le champ technique « otp » n'apparaît pas
  });

  it('totpUri : undefined conserve, vide supprime', async () => {
    const id = vault.addEntry(input({ totpUri: uri }));
    vault.updateEntry(id, input());
    expect(vault.getEntry(id).hasTotp).toBe(true);
    vault.updateEntry(id, input({ totpUri: '' }));
    expect(vault.getEntry(id).hasTotp).toBe(false);
    await expect(vault.getTotp(id)).rejects.toBeInstanceOf(VaultError);
  });

  it('lit le format TOTP natif de KeePass 2 (TimeOtp-*)', async () => {
    const id = vault.addEntry(input());
    const entry = [...raw(vault).groups[0]!.allEntries()].find((e) => e.uuid.id === id)!;
    entry.fields.set('TimeOtp-Secret-Base32', kdbxweb.ProtectedValue.fromString(SECRET));
    entry.fields.set('TimeOtp-Length', '8');
    expect(vault.getEntry(id).hasTotp).toBe(true);
    expect((await vault.getTotp(id, 59_000)).code).toBe('94287082');
    expect(vault.getSecret(id, { field: 'otp' })).toMatch(/^otpauth:\/\/totp\//);
  });

  it('lit une graine Base32 brute dans « otp » (accepté par KeePassXC)', async () => {
    const id = vault.addEntry(input());
    const entry = [...raw(vault).groups[0]!.allEntries()].find((e) => e.uuid.id === id)!;
    entry.fields.set('otp', kdbxweb.ProtectedValue.fromString(SECRET));
    expect((await vault.getTotp(id, 59_000)).code).toBe('287082');
  });
});

describe('findForUrl', () => {
  it('origine exacte, URL supplémentaires KP2A_URL, corbeille exclue', () => {
    const a = vault.addEntry(input({ url: 'https://exemple.fr/connexion' }));
    const b = vault.addEntry(input({ url: 'exemple.fr' })); // sans schéma : https
    const c = vault.addEntry(input({ url: 'https://autre.fr', fields: [{ key: 'KP2A_URL_1', value: 'https://exemple.fr', protected: false }] }));
    const d = vault.addEntry(input({ url: 'https://exemple.fr' }));
    vault.deleteEntry(d);
    vault.addEntry(input({ url: 'http://exemple.fr' }));
    vault.addEntry(input({ url: 'https://compte.exemple.fr' }));
    const ids = vault.findForUrl('https://exemple.fr/login?x=1').map((e) => e.id).sort();
    // l'entrée en http est acceptée sur la page https (plus sûre)
    expect(ids).toHaveLength(4);
    expect(ids).toEqual(expect.arrayContaining([a, b, c]));
    expect(vault.findForUrl('http://exemple.fr/')).toHaveLength(1);
    expect(vault.findForUrl('https://exemple.fr.attaquant.com/')).toHaveLength(0);
  });
});

describe('aller-retour et compatibilité', () => {
  it('tout survit à save() puis open()', async () => {
    const g = vault.addGroup('Banque', null);
    const id = vault.addEntry(input({ groupId: g, tags: ['a', 'b'], totpUri: `otpauth://totp/x?secret=${SECRET}`, fields: [{ key: 'PIN', value: '0000', protected: true }] }));
    vault.updateEntry(id, input({ groupId: g, tags: ['a', 'b'], password: 'Nouveau-Mdp-2026!', fields: [{ key: 'PIN', value: '', protected: true }] }));
    const re = await Vault.open(await vault.save(), MDP);
    expect(re.getEntry(id)).toMatchObject({ groupId: g, tags: ['a', 'b'], hasTotp: true, historyCount: 1 });
    expect(re.getSecret(id, 'password')).toBe('Nouveau-Mdp-2026!');
    expect(re.getSecret(id, { field: 'PIN' })).toBe('0000');
  });

  it('lit les entrées d’un coffre KeePassXC', async () => {
    const v = await Vault.open(readFixture('keepassxc.kdbx'), MDP_FIXTURE);
    const banque = v.listGroups().find((g) => g.name === 'Banque')!;
    const [e] = v.listEntries(banque.id);
    expect(e).toMatchObject({ title: 'Ma banque', username: 'jean', url: 'https://banque.exemple.fr' });
    expect(v.getSecret(e!.id, 'password')).toBe('Autre-Mdp-7?');
    expect(v.findForUrl('https://banque.exemple.fr/espace')).toHaveLength(1);
  });
});

describe.skipIf(!hasKeepassxc && !process.env.CI)('KeePassXC lit le modèle de Cadenas', () => {
  it('groupes, entrées, tags, champs et TOTP', async () => {
    const g = vault.addGroup('Banque', null);
    vault.addEntry(input({ groupId: g, title: 'Compte', tags: ['banque'], notes: 'Notes ici', totpUri: `otpauth://totp/x?secret=${SECRET}`, fields: [{ key: 'PIN', value: '9876', protected: true }] }));
    const path = writeTemp(await vault.save());
    expect(keepassxc(['ls', '-R', path], MDP)).toMatch(/Banque\/\s+Compte/);
    const shown = keepassxc(['show', '-s', '-a', 'UserName', '-a', 'Password', '-a', 'Notes', '-a', 'PIN', '-a', 'Tags', path, 'Banque/Compte'], MDP);
    expect(shown).toContain('demo@exemple.fr');
    expect(shown).toContain('Mdp-Exemple-42!');
    expect(shown).toContain('9876');
    expect(shown).toContain('banque');
    for (let attempt = 0; attempt < 2; attempt++) {
      const fromCli = keepassxc(['show', '-t', path, 'Banque/Compte'], MDP).trim().split('\n').pop()!;
      const ours = (await vault.getTotp(vault.search('Compte')[0]!.id)).code;
      if (fromCli === ours) return;
    }
    throw new Error('Le code TOTP diffère de celui de KeePassXC.');
  });
});
