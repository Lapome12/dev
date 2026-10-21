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
    expect(await b.getSecret('e01', 'totp')).toMatch(/^otpauth:\/\/totp\//);
  });

  it('ajoute, modifie, met à la corbeille puis supprime définitivement', async () => {
    const b = new DemoBackend({ deverrouille: true, vide: true });
    const groupes = await b.listGroups();
    const racine = groupes.find(g => g.parentId === null)!;
    const corbeille = groupes.find(g => g.isRecycleBin)!;
    const g = await b.addGroup('Voyages', racine.id);
    const id = await b.addEntry(saisie(g, 'Train'));
    expect((await b.status())).toMatchObject({ state: 'deverrouille', dirty: true });
    await b.updateEntry(id, saisie(g, 'Train (modifié)'));
    expect((await b.getEntry(id)).historyCount).toBe(1);
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
