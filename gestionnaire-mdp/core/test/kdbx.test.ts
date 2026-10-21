import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as kdbxweb from 'kdbxweb';
import { describe, expect, it } from 'vitest';
import { KDF_MIN, Vault, VaultError } from '../src/index';
import { readKdf } from '../src/argon2';
import { FIXTURES, hasKeepassxc, keepassxc, MDP_FIXTURE, readArrayBuffer, readFixture, writeTemp } from './helpers';

const MDP = 'Correct-Cheval-Pile-Agrafe-2026';

/** Accès à l'objet kdbxweb sous-jacent, réservé aux tests. */
function raw(vault: Vault): kdbxweb.Kdbx {
  return (vault as unknown as { db: kdbxweb.Kdbx }).db;
}

async function expectCode(p: Promise<unknown>, code: VaultError['code']): Promise<void> {
  await expect(p).rejects.toBeInstanceOf(VaultError);
  await expect(p).rejects.toMatchObject({ code });
}

describe('Vault.create / save / open', () => {
  it('crée un coffre KDBX 4.0, AES-256, Argon2id au plancher de sécurité', async () => {
    const vault = await Vault.create('Mon coffre', MDP);
    expect(vault.name).toBe('Mon coffre');
    expect(vault.formatVersion).toBe('4.0');
    const db = raw(vault);
    expect(db.header.dataCipherUuid?.toString()).toBe(kdbxweb.Consts.CipherId.Aes);
    expect(readKdf(db)).toEqual({ type: 'argon2id', ...KDF_MIN });
    expect(db.meta.recycleBinEnabled).toBe(true);
  });

  it('rouvre ce qu’il a enregistré, avec une signature KDBX 4.0', async () => {
    const vault = await Vault.create('Aller-retour', MDP);
    const file = await vault.save();
    const head = new DataView(file);
    expect(head.getUint32(0, true)).toBe(0x9aa2d903); // signature KeePass
    expect(head.getUint32(4, true)).toBe(0xb54bfb67); // KDBX 2.x+
    expect(head.getUint16(8, true)).toBe(0); // version mineure
    expect(head.getUint16(10, true)).toBe(4); // version majeure
    const reopened = await Vault.open(file, MDP);
    expect(reopened.name).toBe('Aller-retour');
    expect(reopened.formatVersion).toBe('4.0');
  });

  it('tire un nouveau sel à chaque enregistrement', async () => {
    const vault = await Vault.create('Sel', MDP);
    const a = new Uint8Array(await vault.save());
    const b = new Uint8Array(await vault.save());
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('refuse un mauvais mot de passe', async () => {
    const file = await (await Vault.create('Refus', MDP)).save();
    await expectCode(Vault.open(file, 'pas-le-bon'), 'mauvais-mot-de-passe');
  });

  it('refuse un fichier qui n’est pas un coffre', async () => {
    const junk = new TextEncoder().encode('ceci n’est pas un coffre KeePass').buffer as ArrayBuffer;
    await expectCode(Vault.open(junk, MDP), 'format-non-supporte');
    await expectCode(Vault.open(new ArrayBuffer(4), MDP), 'fichier-corrompu');
  });

  it('détecte un fichier altéré', async () => {
    const file = new Uint8Array(await (await Vault.create('Altéré', MDP)).save());
    file[file.length - 40]! ^= 0xff;
    await expect(Vault.open(file.buffer as ArrayBuffer, MDP)).rejects.toBeInstanceOf(VaultError);
  });

  it('refuse un réglage Argon2 sous le plancher', async () => {
    await expect(Vault.create('Faible', MDP, undefined, { memoryKiB: 1024, iterations: 1, parallelism: 1 })).rejects.toThrow(RangeError);
  });

  it('refuse d’ouvrir un en-tête Argon2 piégé (mémoire démesurée)', async () => {
    const vault = await Vault.create('Piégé', MDP);
    raw(vault).header.kdfParameters!.set('M', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(16 * 1024 ** 3));
    const file = await vault.save().catch((e: unknown) => e);
    expect(file).toBeInstanceOf(VaultError); // même à l'enregistrement, la limite s'applique
  });

  it('change le mot de passe maître', async () => {
    const vault = await Vault.create('Clé', MDP);
    await vault.changeMasterKey('Nouveau-Mot-De-Passe-Long-2026');
    const file = await vault.save();
    await expectCode(Vault.open(file, MDP), 'mauvais-mot-de-passe');
    expect((await Vault.open(file, 'Nouveau-Mot-De-Passe-Long-2026')).name).toBe('Clé');
  });

  it('close() rend le coffre inutilisable', async () => {
    const vault = await Vault.create('Fermé', MDP);
    vault.close();
    expect(() => vault.name).toThrow('Coffre fermé.');
    await expect(vault.save()).rejects.toThrow('Coffre fermé.');
  });
});

describe('Interopérabilité KeePassXC → Cadenas (fixtures créées par keepassxc-cli)', () => {
  it('ouvre un coffre KeePassXC', async () => {
    const vault = await Vault.open(readFixture('keepassxc.kdbx'), MDP_FIXTURE);
    const titles = [...raw(vault).groups[0]!.allEntries()].map((e) => e.fields.get('Title'));
    expect(titles).toEqual(expect.arrayContaining(['Exemple', 'Ma banque']));
    await expectCode(Vault.open(readFixture('keepassxc.kdbx'), 'faux'), 'mauvais-mot-de-passe');
  });

  it('ouvre un coffre KeePassXC protégé par fichier clé XML v2', async () => {
    const key = new Uint8Array(readFileSync(join(FIXTURES, 'keepassxc-clefichier.keyx')));
    const vault = await Vault.open(readFixture('keepassxc-clefichier.kdbx'), MDP_FIXTURE, key);
    expect([...raw(vault).groups[0]!.allEntries()].map((e) => e.fields.get('UserName'))).toContain('cle');
    await expectCode(Vault.open(readFixture('keepassxc-clefichier.kdbx'), MDP_FIXTURE), 'mauvais-mot-de-passe');
  });
});

describe.skipIf(!hasKeepassxc)('Interopérabilité Cadenas → KeePassXC (keepassxc-cli)', () => {
  it('keepassxc-cli ouvre un coffre créé et enregistré par Cadenas', async () => {
    const vault = await Vault.create('Coffre Cadenas', MDP);
    const db = raw(vault);
    const entry = db.createEntry(db.getDefaultGroup());
    entry.fields.set('Title', 'Exemple');
    entry.fields.set('UserName', 'demo@exemple.fr');
    entry.fields.set('Password', kdbxweb.ProtectedValue.fromString('Mdp-Démo-42!'));
    const path = writeTemp(await vault.save());

    const info = keepassxc(['db-info', path], MDP);
    expect(info).toContain('Cipher: AES 256-bit');
    expect(info).toMatch(/KDF: Argon2id/);
    const shown = keepassxc(['show', '-s', '-a', 'Password', path, 'Exemple'], MDP);
    expect(shown.trim()).toBe('Mdp-Démo-42!');
  });

  it('Cadenas relit un coffre modifié ensuite par keepassxc-cli', async () => {
    const path = writeTemp(await (await Vault.create('Aller-retour', MDP)).save());
    keepassxc(['add', '-q', '-u', 'ajout@exemple.fr', path, 'Ajout KeePassXC'], MDP);
    const vault = await Vault.open(readArrayBuffer(path), MDP);
    const users = [...raw(vault).groups[0]!.allEntries()].map((e) => e.fields.get('UserName'));
    expect(users).toContain('ajout@exemple.fr');
  });
});
