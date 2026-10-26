import { describe, expect, it } from 'vitest';
import { pluck } from '../../src/engine/instruments/corde';
import { chordPitches, intervallesAccord } from '../../src/engine/instruments/accord';
import { acidCurve } from '../../src/engine/instruments/acide';
import { characterCurve, drumFor, DRUMS } from '../../src/engine/instruments/frappe';
import { ALGORITHMS, feedbackHarmonics } from '../../src/engine/instruments/prisme';
import { defaultParams, listPlugins } from '../../src/engine/params';

describe('les 7 instruments', () => {
  it('sont tous déclarés avec leurs réglages', () => {
    const types = listPlugins().filter((p) => p.kind === 'instrument').map((p) => p.type);
    expect(types.sort()).toEqual(['accord', 'acide', 'corde', 'echantillon', 'frappe', 'prisme', 'trio']);
    expect(Object.keys(defaultParams('frappe')).length).toBe(62);
  });
});

describe('Frappe', () => {
  it('associe les hauteurs General MIDI aux 12 voix', () => {
    expect(DRUMS.length).toBe(12);
    expect(drumFor(47)).toBe('percu');
    expect(drumFor(51)).toBe('ride');
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

describe('Acide', () => {
  it('sature sans dépasser ±1, de façon croissante', () => {
    for (const amount of [0, 0.5, 1]) {
      const c = acidCurve(amount, 257);
      expect(c[0]).toBeCloseTo(-1, 5);
      expect(c[256]).toBeCloseTo(1, 5);
      for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]!);
    }
  });
});

describe('Accord', () => {
  it('donne les intervalles de chaque accord, m7 par défaut', () => {
    expect(intervallesAccord('majeur')).toEqual([0, 4, 7]);
    expect(intervallesAccord('m9')).toEqual([0, 3, 7, 10, 14]);
    expect(intervallesAccord('inconnu')).toEqual([0, 3, 7, 10]);
  });

  it('renverse l’accord en montant les notes graves d’une octave', () => {
    expect(chordPitches(60, 'majeur', 0)).toEqual([60, 64, 67]);
    expect(chordPitches(60, 'majeur', 1)).toEqual([64, 67, 72]);
    expect(chordPitches(60, 'majeur', 2)).toEqual([67, 72, 76]);
    // Pas plus de renversements que de notes moins une.
    expect(chordPitches(60, 'quinte', 3)).toEqual([67, 72]);
  });
});

describe('Frappe : caractère', () => {
  it('laisse le silence à 0 et reste borné à ±1 (à 0, la courbe est retirée)', () => {
    for (const amount of [0.1, 0.5, 1]) {
      const c = characterCurve(amount, 257);
      expect(c[128]).toBeCloseTo(0, 9);
      for (const v of c) expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-6);
    }
  });
});
