import { describe, expect, it } from 'vitest';
import { compressorMakeupCompensation, dbToGain } from '../../src/engine/context';
import { distortionCurve } from '../../src/engine/effects/distorsion';
import { impulseData } from '../../src/engine/impulse';
import { listPlugins } from '../../src/engine/params';

describe('effets', () => {
  it('les effets de l’étape 2.2 sont déclarés', () => {
    const types = listPlugins().filter((p) => p.kind === 'effet').map((p) => p.type);
    for (const t of ['eq', 'reverbe', 'delai', 'compresseur', 'distorsion', 'filtre']) expect(types).toContain(t);
  });

  it('distorsion : courbes bornées, impaires (sauf redresseur), silence au repos', () => {
    for (const forme of ['douce', 'dure', 'paliers']) {
      const c = distortionCurve(forme, 20, 1001);
      expect(c[500]).toBeCloseTo(0, 6);
      for (let i = 0; i < c.length; i++) {
        expect(Math.abs(c[i] ?? 9)).toBeLessThanOrEqual(1);
        expect(c[i]).toBeCloseTo(-(c[c.length - 1 - i] ?? 0), 6);
      }
    }
    const r = distortionCurve('redresseur', 6, 1001);
    expect(r[500]).toBeCloseTo(0, 6);
    expect(r[0]).toBeCloseTo(r[1000] ?? 0, 6);
  });

  it('réverbe : réponse déterministe, -60 dB au bout de la taille', () => {
    const a = impulseData(8000, { seconds: 1, brillance: 0.5 });
    const b = impulseData(8000, { seconds: 1, brillance: 0.5 });
    expect(a[0]).toEqual(b[0]);
    expect(a[0]).not.toEqual(a[1]);          // stéréo décorrélée
    const rms = (d: Float32Array, from: number, to: number): number => {
      let s = 0;
      for (let i = from; i < to; i++) s += (d[i] ?? 0) ** 2;
      return Math.sqrt(s / (to - from));
    };
    const early = rms(a[0], 0, 400);
    const late = rms(a[0], 7600, 8000);
    expect(20 * Math.log10(late / early)).toBeLessThan(-45);
  });

  it('compresseur : le rattrapage automatique du navigateur est annulé', () => {
    expect(compressorMakeupCompensation(0, 4)).toBe(1);
    // seuil -40, ratio 10 : -36 dB à pleine échelle, le navigateur remonte de 21,6 dB
    expect(compressorMakeupCompensation(-40, 10)).toBeCloseTo(dbToGain(-21.6), 9);
  });
});
