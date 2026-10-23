import { describe, expect, it } from 'vitest';
import { pluck } from '../../src/engine/instruments/corde';
import { drumFor, DRUMS } from '../../src/engine/instruments/frappe';
import { ALGORITHMS, feedbackHarmonics } from '../../src/engine/instruments/prisme';
import { defaultParams, listPlugins } from '../../src/engine/params';

describe('les 5 instruments', () => {
  it('sont tous déclarés avec leurs réglages', () => {
    const types = listPlugins().filter((p) => p.kind === 'instrument').map((p) => p.type);
    expect(types.sort()).toEqual(['corde', 'echantillon', 'frappe', 'prisme', 'trio']);
    expect(Object.keys(defaultParams('frappe')).length).toBe(51);
  });
});

describe('Frappe', () => {
  it('associe les hauteurs General MIDI aux 10 voix', () => {
    expect(DRUMS.length).toBe(10);
    expect(drumFor(36)).toBe('gc');
    expect(drumFor(38)).toBe('cc');
    expect(drumFor(42)).toBe('chf');
    expect(drumFor(46)).toBe('cho');
    expect(drumFor(35)).toBe('gc');
    expect(drumFor(60)).toBe('gc');      // do de n'importe quelle octave
    expect(drumFor(62)).toBe('cc');
  });
});

describe('Corde (Karplus-Strong)', () => {
  const o = { brillance: 0.6, maintien: 0.7, position: 0.2, attaque: 0.5 };

  it('est déterministe et sans valeur aberrante', () => {
    const a = pluck(220, 44100, o, 3);
    const b = pluck(220, 44100, o, 3);
    expect(a).toEqual(b);
    expect(a.every((v) => Number.isFinite(v) && Math.abs(v) < 4)).toBe(true);
  });

  it('sonne à la bonne hauteur', () => {
    const sr = 44100;
    const y = pluck(220, sr, o, 3);
    const seg = y.subarray(4410, 4410 + 8192);
    let best = 0;
    let lag = 0;
    for (let l = 100; l < 400; l++) {
      let s = 0;
      for (let i = 0; i < seg.length - l; i++) s += (seg[i] ?? 0) * (seg[i + l] ?? 0);
      if (s > best) [best, lag] = [s, l];
    }
    expect(Math.abs(sr / lag - 220)).toBeLessThan(2);
  });

  it('se tait à la fin et dure plus longtemps avec plus de maintien', () => {
    const short = pluck(220, 44100, { ...o, maintien: 0 });
    const long = pluck(220, 44100, { ...o, maintien: 1 });
    expect(long.length).toBeGreaterThan(short.length);
    expect(Math.abs(short.at(-1) ?? 1)).toBeLessThan(1e-6);
  });
});

describe('Prisme (FM)', () => {
  it('8 algorithmes, chacun avec au moins une porteuse', () => {
    expect(ALGORITHMS.length).toBe(8);
    for (const a of ALGORITHMS) expect(a.carriers.length).toBeGreaterThan(0);
  });

  it('sans réinjection, l’opérateur 4 est un sinus pur', () => {
    const { real, imag } = feedbackHarmonics(0);
    expect(imag[1]).toBeCloseTo(1, 4);
    for (let h = 2; h < imag.length; h++) {
      expect(Math.abs(imag[h] ?? 0)).toBeLessThan(1e-4);
      expect(Math.abs(real[h] ?? 0)).toBeLessThan(1e-4);
    }
  });

  it('la réinjection enrichit le son en harmoniques', () => {
    const { real, imag } = feedbackHarmonics(1.2);
    const h3 = Math.hypot(real[3] ?? 0, imag[3] ?? 0);
    expect(h3).toBeGreaterThan(0.05);
  });
});
