import { describe, expect, it } from 'vitest';
import { VaultError } from '@cadenas/core';
import { DemoBackend } from '../src/backend-demo';
import { ENTREES_DEMO, GROUPES_DEMO } from '../src/demo-data';
import type { EntryInput } from '../src/backend';

const saisie = (groupId: string, titre: string, mdp = 'x7!Kq2@pL9#vW4zr'): EntryInput => ({
  groupId, title: titre, username: 'demo@exemple.fr', password: mdp, url: 'https://exemple.fr', notes: '', tags: [], fields: [],
});

describe('données de démo', () => {
  it('contient 25 entrées fictives réparties dans des groupes existants', () => {
    expect(ENTREES_DEMO).toHaveLength(25);
    const groupes = new Set(GROUPES_DEMO.map(g => g.id));
    for (const e of ENTREES_DEMO) expect(groupes.has(e.groupe)).toBe(true);
    expect(new Set(ENTREES_DEMO.map(e => e.id)).size).toBe(25);
  });

  it('n\'utilise que des domaines d\'exemple ou une adresse locale', () => {
    for (const e of ENTREES_DEMO) {
      if (!e.url) continue;
      const hote = new URL(e.url).hostname;
      expect(hote.endsWith('exemple.fr') || hote.endsWith('exemple.com') || hote.endsWith('.exemple') || hote === '192.168.1.1').toBe(true);
    }
  });
});

describe('DemoBackend', () => {
  it('démarre verrouillé et refuse un mauvais mot de passe', async () => {
    const b = new DemoBackend();
    expect((await b.status()).state).toBe('verrouille');
    await expect(b.unlock('faux')).rejects.toBeInstanceOf(VaultError);
    await expect(b.listEntries()).rejects.toBeInstanceOf(VaultError);
    await b.unlock('demo');
    expect((await b.status()).state).toBe('deverrouille');
  });

  it('liste, cherche sans accents et masque les champs protégés', async () => {
    const b = new DemoBackend({ deverrouille: true });
    expect(await b.listEntries()).toHaveLength(25);
    expect((await b.listEntries('g-banque')).map(e => e.title)).toContain('Banque Démo');
    expect((await b.search('energie')).map(e => e.title)).toEqual(['Énergie (démo)']);
    expect((await b.search('popote agenda')).map(e => e.title)).toEqual(['Agenda Popote']);
    const d = await b.getEntry('e16');
    expect(d).not.toHaveProperty('password');
    expect(d.fields[0]?.value).toBe('');
    expect(await b.getSecret('e16', { field: 'Clé API' })).toMatch(/^demo_/);
    expect(await b.getSecret('e01', 'password')).toBe('Vq7#tL2!mR9pZx4&');
    expect(await b.getSecret('e01', 'totp')).toMatch(/^\d{6}$/);
    expect(await b.getSecret('e01', { field: 'otp' })).toMatch(/^otpauth:\/\/totp\//);
    const t = await b.getTotp('e01');
    expect(t.period).toBe(30);
    expect(t.remaining).toBeGreaterThan(0);
  });

  it('ajoute, modifie, met à la corbeille puis supprime définitivement', async () => {
    const b = new DemoBackend({ deverrouille: true, vide: true });
    const groupes = await b.listGroups();
    const racine = groupes.find(g => g.parentId === null)!;
    const corbeille = groupes.find(g => g.isRecycleBin)!;
    const g = await b.addGroup('Voyages', racine.id);
    const id = await b.addEntry(saisie(g, 'Train'));
    expect((await b.status())).toMatchObject({ state: 'deverrouille', dirty: true });
    await b.updateEntry(id, { ...saisie(g, 'Train (modifié)'), totpUri: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP', fields: [{ key: 'PIN', value: '1234', protected: true }] });
    expect((await b.getEntry(id)).historyCount).toBe(1);
    // Conventions de core : totpUri absent = inchangé, champ protégé vide = conservé, '' = 2FA supprimée.
    await b.updateEntry(id, { ...saisie(g, 'Train'), fields: [{ key: 'PIN', value: '', protected: true }] });
    expect((await b.getEntry(id)).hasTotp).toBe(true);
    expect(await b.getSecret(id, { field: 'PIN' })).toBe('1234');
    await b.updateEntry(id, { ...saisie(g, 'Train'), totpUri: '' });
    expect((await b.getEntry(id)).hasTotp).toBe(false);
    await b.deleteEntry(id);
    expect(await b.listEntries()).toHaveLength(0);
    expect(await b.listEntries(corbeille.id)).toHaveLength(1);
    await b.deleteEntry(id);
    expect(await b.listEntries(corbeille.id)).toHaveLength(0);
    await b.save();
    expect(await b.status()).toMatchObject({ dirty: false });
  });

  it('calcule la santé : faibles, réutilisés, anciens, sans mot de passe', async () => {
    const b = new DemoBackend({ deverrouille: true });
    const r = await b.health();
    expect(r.weak).toEqual(expect.arrayContaining(['e12', 'e15']));
    expect(r.reused.some(ids => ['e07', 'e09', 'e10'].every(id => ids.includes(id)))).toBe(true);
    expect(r.old).toEqual(expect.arrayContaining(['e07', 'e12']));
    expect(r.withoutPassword).toEqual(['e21']);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(100);
  });

  it('prévient les abonnés au verrouillage', async () => {
    const b = new DemoBackend({ deverrouille: true });
    const vus: string[] = [];
    const stop = b.onChange(s => vus.push(s.state));
    await b.lock();
    stop();
    await b.unlock('demo');
    expect(vus).toEqual(['verrouille']);
  });
});

describe('changement de la clé maître (4.4e)', () => {
  it('refuse sans le mot de passe actuel correct et ne change rien', async () => {
    const b = new DemoBackend();
    await b.unlock('demo');
    await expect(b.changeMasterKey('nouveau mot de passe tres long', undefined, { password: 'faux' }))
      .rejects.toMatchObject({ code: 'mauvais-mot-de-passe' });
    await expect(b.changeMasterKey('nouveau mot de passe tres long')).rejects.toBeInstanceOf(VaultError);
    await b.lock();
    await b.unlock('demo'); // l'ancien mot de passe ouvre toujours le coffre
  });

  it('change la clé quand le mot de passe actuel est correct', async () => {
    const b = new DemoBackend();
    await b.unlock('demo');
    await b.changeMasterKey('nouveau mot de passe tres long', undefined, { password: 'demo' });
    await b.lock();
    await expect(b.unlock('demo')).rejects.toMatchObject({ code: 'mauvais-mot-de-passe' });
    await b.unlock('nouveau mot de passe tres long');
  });
});
