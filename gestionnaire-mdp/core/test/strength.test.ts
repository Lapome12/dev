import { describe, expect, it } from 'vitest';
import { estimateStrength, generatePassphrase, generatePassword } from '../src/index';

describe('estimateStrength', () => {
  it('juge très faibles les mots de passe courants, y compris français', () => {
    for (const pw of ['123456', 'motdepasse', 'azerty', 'soleil', 'bonjour1']) {
      expect(estimateStrength(pw).score, pw).toBeLessThanOrEqual(1);
    }
  });

  it('donne des conseils en français', () => {
    const r = estimateStrength('azerty');
    expect([r.warning, ...r.suggestions].join(' ')).toMatch(/[éèàç]|mot|clavier|Ajoutez|Évitez/i);
  });

  it('juge forts les mots de passe générés', () => {
    expect(estimateStrength(generatePassword({ length: 20, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: false })).score).toBe(4);
    expect(estimateStrength(generatePassphrase({ words: 6, separator: '-', capitalize: false, addDigit: false })).score).toBeGreaterThanOrEqual(3);
  });

  it('gère le vide et les entrées géantes', () => {
    expect(estimateStrength('').score).toBe(0);
    const t = Date.now();
    estimateStrength('a'.repeat(100_000));
    expect(Date.now() - t).toBeLessThan(2000);
  });

  it('tient compte des informations personnelles', () => {
    expect(estimateStrength('eliottdupont', ['eliott', 'dupont']).score).toBeLessThanOrEqual(1);
  });
});
