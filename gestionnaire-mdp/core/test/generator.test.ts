import { describe, expect, it } from 'vitest';
import { generatePassphrase, generatePassword } from '../src/index';
import { charsets, passphraseEntropy, passwordEntropy, randomInt } from '../src/generator';
import { EFF_WORDS } from '../src/wordlist-eff';

const ALL = { lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: false };

describe('randomInt', () => {
  it('reste dans les bornes', () => {
    for (let i = 0; i < 2000; i++) {
      const x = randomInt(7);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(7);
    }
    expect(randomInt(1)).toBe(0);
    expect(() => randomInt(0)).toThrow(RangeError);
  });

  it('répartition uniforme (khi-deux, 10 cases, 50 000 tirages)', () => {
    const n = 10;
    const draws = 50_000;
    const counts = new Array<number>(n).fill(0);
    for (let i = 0; i < draws; i++) counts[randomInt(n)]!++;
    const expected = draws / n;
    const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    // 9 degrés de liberté : seuil à 0,1 % = 27,88. Un tirage honnête échoue une fois sur mille.
    expect(chi2).toBeLessThan(27.88);
  });
});

describe('generatePassword', () => {
  it('respecte la longueur et contient chaque classe demandée', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword({ length: 12, ...ALL });
      expect(pw).toHaveLength(12);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[^a-zA-Z0-9]/);
    }
  });

  it('n’utilise que les classes choisies', () => {
    const pw = generatePassword({ length: 64, lower: false, upper: false, digits: true, symbols: false, avoidAmbiguous: false });
    expect(pw).toMatch(/^[0-9]{64}$/);
  });

  it('évite les caractères ambigus si demandé', () => {
    const pw = generatePassword({ length: 1000, ...ALL, avoidAmbiguous: true });
    expect(pw).not.toMatch(/[Il1O0o|`'"{}[\]()/\;:.,]/);
  });

  it('couvre tout l’alphabet de façon équilibrée', () => {
    const counts = new Map<string, number>();
    const opts = { length: 1000, lower: true, upper: false, digits: false, symbols: false, avoidAmbiguous: false };
    for (let i = 0; i < 26; i++) for (const c of generatePassword(opts)) counts.set(c, (counts.get(c) ?? 0) + 1);
    expect(counts.size).toBe(26);
    const expected = 26_000 / 26;
    const chi2 = [...counts.values()].reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    expect(chi2).toBeLessThan(52.62); // 25 ddl, seuil 0,1 %
  });

  it('refuse les réglages impossibles', () => {
    expect(() => generatePassword({ length: 12, lower: false, upper: false, digits: false, symbols: false, avoidAmbiguous: false })).toThrow(RangeError);
    expect(() => generatePassword({ length: 3, ...ALL })).toThrow(RangeError);
    expect(() => generatePassword({ length: 5000, ...ALL })).toThrow(RangeError);
  });

  it('calcule l’entropie affichée', () => {
    expect(charsets(ALL).join('')).toHaveLength(26 + 26 + 10 + 28);
    expect(passwordEntropy({ length: 20, ...ALL })).toBe(Math.floor(20 * Math.log2(90)));
  });
});

describe('generatePassphrase', () => {
  it('utilise la liste EFF complète', () => {
    expect(EFF_WORDS).toHaveLength(7776);
    expect(new Set(EFF_WORDS).size).toBe(7776);
    expect(EFF_WORDS[0]).toBe('abacus');
    expect(EFF_WORDS[7775]).toBe('zoom');
  });

  it('respecte le nombre de mots, le séparateur, les majuscules et le chiffre', () => {
    const p = generatePassphrase({ words: 6, separator: '-', capitalize: true, addDigit: true });
    const parts = p.split('-');
    expect(parts).toHaveLength(6);
    for (const w of parts) expect(w).toMatch(/^[A-Z][a-z]*\d?$/);
    expect(p.match(/\d/g)).toHaveLength(1);
    expect(passphraseEntropy({ words: 6, separator: '-', capitalize: false, addDigit: false })).toBe(77);
  });

  it('ne répète pas les phrases', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generatePassphrase({ words: 4, separator: ' ', capitalize: false, addDigit: false })));
    expect(seen.size).toBe(200);
  });
});
