import { describe, expect, it } from 'vitest';
import { formeAutofiltre } from '../../src/engine/effects/autofiltre';
import { ecrireMotif, formePorte, lireMotif, MOTIF_DEFAUT } from '../../src/engine/effects/porte';
import { compensationSaturation, courbeSaturation } from '../../src/engine/effects/saturation';
import { defaultParams, listPlugins } from '../../src/engine/params';

describe('effets de l’étape 6 (Dev 2)', () => {
  it('phaser, autofiltre, saturation et porte sont déclarés', () => {
    const types = listPlugins().filter((p) => p.kind === 'effet').map((p) => p.type);
    for (const t of ['phaser', 'autofiltre', 'saturation', 'porte']) expect(types).toContain(t);
    expect(defaultParams('porte')['motif']).toBe(MOTIF_DEFAUT);
  });

  it('porte : lecture tolérante du motif', () => {
    expect(lireMotif('x.x')).toEqual([true, false, true, ...Array(13).fill(false)]);
    expect(lireMotif(42)).toEqual(Array(16).fill(false));
    expect(ecrireMotif(lireMotif('xx..xx..xx..xx..zzz'))).toBe('xx..xx..xx..xx..');
  });

  it('porte : fermée sur les pas fermés, ouverte sur les pas ouverts, rampes sans saut', () => {
    const f = formePorte(lireMotif('x...............'), 0.1, 1600);   // 100 points par pas
    expect(f[50]).toBe(1);
    expect(f[150]).toBe(0);
    expect(f[1550]).toBe(0);
    for (let i = 1; i < f.length; i++) expect(Math.abs((f[i] ?? 0) - (f[i - 1] ?? 0))).toBeLessThan(0.2);
  });

  it('saturation : courbes bornées, silence au repos, volume corrigé', () => {
    for (const mode of ['bande', 'lampe', 'repli']) {
      for (const drive of [0, 12, 36]) {
        const c = courbeSaturation(mode, drive, 1001);
        expect(c[500]).toBeCloseTo(0, 6);
        for (const v of c) expect(Math.abs(v)).toBeLessThanOrEqual(1);
        const k = compensationSaturation(c);
        expect(k).toBeGreaterThan(0.1);
        expect(k).toBeLessThanOrEqual(4);
      }
    }
    // Lampe : asymétrique (harmoniques paires).
    const l = courbeSaturation('lampe', 12, 1001);
    expect(Math.abs(l[1000] ?? 0)).not.toBeCloseTo(Math.abs(l[0] ?? 0), 2);
  });

  it('autofiltre : la rampe monte d’un bout à l’autre du cycle, l’aléatoire est reproductible', () => {
    const r = formeAutofiltre('rampe', 100);
    expect(r[0]).toBe(-1);
    expect(r[99]).toBeGreaterThan(0.95);
    expect(formeAutofiltre('aleatoire')).toEqual(formeAutofiltre('aleatoire'));
  });
});
