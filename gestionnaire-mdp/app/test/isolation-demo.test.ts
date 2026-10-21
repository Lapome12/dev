// Garantit que les données et l'indice de démo ne sont accessibles que depuis demo.ts :
// ni la version web (main.ts), ni mountApp (utilisé par l'extension) ne doivent les importer.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

function graphe(depart: string): Set<string> {
  const vus = new Set<string>();
  const pile = [resolve(SRC, depart)];
  while (pile.length) {
    const f = pile.pop()!;
    if (vus.has(f)) continue;
    vus.add(f);
    const code = readFileSync(f, 'utf8');
    for (const m of code.matchAll(/(?:import|export)\s[^'"]*?from\s+'(\.[^']+)'/g)) {
      const cible = resolve(dirname(f), m[1]!);
      pile.push(cible.endsWith('.ts') ? cible : `${cible}.ts`);
    }
  }
  return vus;
}

const INTERDITS = ['demo-data.ts', 'backend-demo.ts', 'demo.ts'];

describe('isolation de la démo', () => {
  for (const entree of ['main.ts', 'mount.ts', 'backend-web.ts']) {
    it(`${entree} n'atteint aucun module de démo`, () => {
      const fichiers = [...graphe(entree)].map(f => f.slice(SRC.length + 1));
      for (const interdit of INTERDITS) expect(fichiers).not.toContain(interdit);
      for (const f of graphe(entree)) {
        const code = readFileSync(f, 'utf8');
        expect(code, f).not.toMatch(/MOT_DE_PASSE_DEMO|mot de passe maître est/);
      }
    });
  }

  it('demo.ts fournit bien l\'indice', () => {
    expect(readFileSync(resolve(SRC, 'demo.ts'), 'utf8')).toMatch(/MOT_DE_PASSE_DEMO/);
  });
});
