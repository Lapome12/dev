import { describe, expect, it } from 'vitest';
import { importCsv, Vault } from '../src/index';
import { parseCsv } from '../src/import-csv';
import { base32Encode } from '../src/totp';
import { hasKeepassxc, keepassxc, MDP_FIXTURE } from './helpers';
import { join } from 'node:path';
import { FIXTURES } from './helpers';

const SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'));

describe('parseCsv', () => {
  it('gère guillemets, virgules, retours à la ligne, BOM et CRLF', () => {
    expect(parseCsv('﻿a,b,c\r\n"1,5","dit ""oui""","ligne1\nligne2"\r\n\r\n')).toEqual([
      ['a', 'b', 'c'],
      ['1,5', 'dit "oui"', 'ligne1\nligne2'],
    ]);
    expect(parseCsv('a,b\nx,')).toEqual([['a', 'b'], ['x', '']]);
    expect(() => parseCsv('a\n"non fermé')).toThrow(SyntaxError);
  });
});

describe('importCsv', () => {
  it('Chrome / Opera', () => {
    const csv = 'name,url,username,password,note\nexemple.fr,https://exemple.fr/,demo@exemple.fr,Mdp-1!,\n,https://autre.exemple.fr/login,jean,Mdp-2!,une note\n';
    const r = importCsv(csv, 'chrome');
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ title: 'exemple.fr', url: 'https://exemple.fr/', username: 'demo@exemple.fr', password: 'Mdp-1!', groupPath: '' });
    expect(r[1]).toMatchObject({ title: 'autre.exemple.fr', notes: 'une note' });
  });

  it('Bitwarden : dossier, champs, URL multiples, TOTP brut ou URI, favori', () => {
    const csv = [
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp',
      `Banque,1,login,Ma banque,"note",,0,"https://banque.exemple.fr,https://app.banque.exemple.fr",jean,Mdp-3!,${SECRET}`,
      `,,login,Mail,,"PIN: 1234\nQuestion: chat",0,https://mail.exemple.fr,moi,Mdp-4!,otpauth://totp/Mail:moi?secret=${SECRET}`,
      ',,note,Note seule,"texte",,0,,,,',
    ].join('\n');
    const [a, b, c] = importCsv(csv, 'bitwarden');
    expect(a).toMatchObject({ groupPath: 'Banque', title: 'Ma banque', url: 'https://banque.exemple.fr', tags: ['favori'] });
    expect(a!.fields).toEqual([{ key: 'KP2A_URL', value: 'https://app.banque.exemple.fr', protected: false }]);
    expect(a!.totpUri).toMatch(/^otpauth:\/\/totp\/.*secret=/);
    expect(b!.fields).toEqual([{ key: 'PIN', value: '1234', protected: false }, { key: 'Question', value: 'chat', protected: false }]);
    expect(b!.totpUri).toBe(`otpauth://totp/Mail:moi?secret=${SECRET}`);
    expect(c).toMatchObject({ title: 'Note seule', notes: 'texte', password: '' });
  });

  it('refuse un fichier qui n’a pas les bonnes colonnes', () => {
    expect(() => importCsv('a,b\n1,2', 'chrome')).toThrow(SyntaxError);
    expect(() => importCsv('name,url,username,password\n', 'bitwarden')).toThrow(SyntaxError);
  });

  it('renomme les champs qui portent un nom réservé', () => {
    const csv = 'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n,,login,X,,"Password: a\notp: b",0,,,,';
    expect(importCsv(csv, 'bitwarden')[0]!.fields.map((f) => f.key)).toEqual(['Password (importé)', 'otp (importé)']);
  });

  it('les entrées importées s’ajoutent au coffre', async () => {
    const vault = await Vault.create('Import', 'Correct-Cheval-Pile-Agrafe-2026');
    const root = vault.listGroups().find((g) => g.parentId === null)!.id;
    const csv = 'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\nBanque,,login,B,,"PIN: 1",0,https://b.fr,u,p,' + SECRET;
    for (const e of importCsv(csv, 'bitwarden')) vault.addEntry({ ...e, groupId: root });
    const [s] = vault.listEntries();
    expect(s).toMatchObject({ title: 'B', hasTotp: true });
  });

  it.skipIf(!hasKeepassxc && !process.env.CI)('KeePassXC : relit son propre export CSV', () => {
    const csv = keepassxc(['export', '-f', 'csv', join(FIXTURES, 'keepassxc.kdbx')], MDP_FIXTURE);
    const r = importCsv(csv, 'keepassxc');
    expect(r).toHaveLength(2);
    expect(r.find((e) => e.title === 'Exemple')).toMatchObject({ groupPath: '', username: 'demo@exemple.fr', password: 'Mdp-Exemple-42!', url: 'https://exemple.fr', notes: 'Entrée créée par keepassxc-cli' });
    expect(r.find((e) => e.title === 'Ma banque')).toMatchObject({ groupPath: 'Banque', password: 'Autre-Mdp-7?' });
  });
});
