import * as kdbxweb from 'kdbxweb';
import { describe, expect, it } from 'vitest';
import { Vault, type EntryInput } from '../src/index';

const raw = (v: Vault) => (v as unknown as { db: kdbxweb.Kdbx }).db;
const DAY = 24 * 60 * 60 * 1000;

describe('health', () => {
  it('signale faibles, réutilisés, anciens et sans mot de passe', async () => {
    const vault = await Vault.create('Santé', 'Correct-Cheval-Pile-Agrafe-2026');
    const root = vault.listGroups().find((g) => g.parentId === null)!.id;
    const add = (title: string, password: string) =>
      vault.addEntry({ groupId: root, title, username: '', password, url: '', notes: '', tags: [], fields: [] } satisfies EntryInput);

    const fort = add('Fort', 'q7#Lp!x92Vz@eR4mW');
    const faible = add('Faible', 'azerty');
    const r1 = add('Réutilisé 1', 'Bt8$kz-Pw2!nQr9X');
    const r2 = add('Réutilisé 2', 'Bt8$kz-Pw2!nQr9X');
    const vide = add('Vide', '');
    const ancien = add('Ancien', 'Hz4!mQ9#rT2$wX7p');
    const corbeille = add('Corbeille', '123456');
    vault.deleteEntry(corbeille);

    const now = Date.now() + 400 * DAY; // tout a plus d'un an
    const entry = [...raw(vault).groups[0]!.allEntries()].find((e) => e.uuid.id === ancien)!;
    // le mot de passe de « Ancien » n'a pas changé lors de la dernière modification :
    entry.pushHistory();
    entry.times.lastModTime = new Date(now - 10 * DAY);

    const r = vault.health(now);
    expect(r.weak).toEqual([faible]);
    expect(r.reused).toEqual([[r1, r2]]);
    expect(r.withoutPassword).toEqual([vide]);
    expect(r.old).toEqual(expect.arrayContaining([fort, faible, r1, r2, ancien]));
    expect(r.score).toBe(0);

    const recent = vault.health(Date.now());
    expect(recent.old).toEqual([]);
    expect(recent.score).toBe(Math.round((100 * 2) / 6)); // « Fort » et « Ancien » sans problème
  });

  it('coffre vide : 100', async () => {
    const vault = await Vault.create('Vide', 'Correct-Cheval-Pile-Agrafe-2026');
    expect(vault.health()).toEqual({ weak: [], reused: [], old: [], withoutPassword: [], score: 100 });
  });
});
