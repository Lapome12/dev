import { describe, expect, it } from 'vitest';
import { generateKeyFile, Vault } from '../src/index';
import { hasKeepassxc, keepassxc, writeTemp } from './helpers';

const MDP = 'Correct-Cheval-Pile-Agrafe-2026';

describe('fichier clé', () => {
  it('génère un fichier KeePass XML v2 unique', async () => {
    const a = new TextDecoder().decode(await generateKeyFile());
    const b = new TextDecoder().decode(await generateKeyFile());
    expect(a).toMatch(/<KeyFile>[\s\S]*<Version>2\.0<\/Version>[\s\S]*<Data Hash="[0-9A-F]{8}">/);
    expect(a).not.toBe(b);
  });

  it('protège le coffre : mot de passe ET fichier clé exigés', async () => {
    const key = await generateKeyFile();
    const file = await (await Vault.create('Clé', MDP, key)).save();
    expect((await Vault.open(file, MDP, key)).name).toBe('Clé');
    await expect(Vault.open(file, MDP)).rejects.toMatchObject({ code: 'mauvais-mot-de-passe' });
    await expect(Vault.open(file, MDP, await generateKeyFile())).rejects.toMatchObject({ code: 'mauvais-mot-de-passe' });
  });

  it('ajoute puis retire un fichier clé avec changeMasterKey', async () => {
    const key = await generateKeyFile();
    const vault = await Vault.create('Bascule', MDP);
    await vault.changeMasterKey(MDP, key);
    const withKey = await vault.save();
    await expect(Vault.open(withKey, MDP)).rejects.toMatchObject({ code: 'mauvais-mot-de-passe' });
    const reopened = await Vault.open(withKey, MDP, key);
    await reopened.changeMasterKey(MDP);
    expect((await Vault.open(await reopened.save(), MDP)).name).toBe('Bascule');
  });

  it.skipIf(!hasKeepassxc && !process.env.CI)('KeePassXC ouvre un coffre protégé par un fichier clé Cadenas', async () => {
    const key = await generateKeyFile();
    const path = writeTemp(await (await Vault.create('Clé XC', MDP, key)).save());
    const keyPath = writeTemp(key.buffer as ArrayBuffer, 'cle.keyx');
    expect(keepassxc(['db-info', '-k', keyPath, path], MDP)).toContain('Argon2id');
  });
});
