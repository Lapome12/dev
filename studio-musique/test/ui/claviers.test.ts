import { describe, expect, it } from 'vitest';
import { cibleCanal } from '../../src/ui/claviers';
import type { Contexte } from '../../src/ui/contexte';

describe('claviers', () => {
  it('relâche une note sur le canal où elle a commencé', () => {
    const vus: string[] = [];
    let canalId = 'a';
    const ctx = {
      ui: { get: () => ({ canalId }) },
      moteur: { noteOn: (c: string, p: number) => vus.push(`on:${c}:${p}`), noteOff: (c: string, p: number) => vus.push(`off:${c}:${p}`) },
    } as unknown as Pick<Contexte, 'moteur' | 'ui'>;
    const cible = cibleCanal(ctx);
    cible.noteOn(60, 0.8);
    canalId = 'b';
    cible.noteOff(60);
    cible.noteOff(60);
    expect(vus).toEqual(['on:a:60', 'off:a:60']);
  });
});
