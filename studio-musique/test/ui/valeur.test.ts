import { describe, expect, it } from 'vitest';
import {
  arrondirPas, depuisNorme, formater, formaterPan, formaterTemps, formaterVolume, versNorme,
  volumeDepuisNorme, volumeVersNorme,
} from '../../src/ui/components/valeur';
import { hauteurDb } from '../../src/ui/components/meter';

describe('conversions des réglages', () => {
  it('linéaire : aller-retour et bornes', () => {
    const p = { min: -1, max: 1 };
    expect(versNorme(0, p)).toBe(0.5);
    expect(depuisNorme(0.75, p)).toBe(0.5);
    expect(versNorme(5, p)).toBe(1);
    expect(depuisNorme(-2, p)).toBe(-1);
  });

  it('logarithmique : le milieu de course est la moyenne géométrique', () => {
    const p = { min: 20, max: 20000, curve: 'log' as const };
    expect(depuisNorme(0.5, p)).toBeCloseTo(Math.sqrt(20 * 20000), 6);
    for (const v of [20, 100, 1000, 12345, 20000]) expect(depuisNorme(versNorme(v, p), p)).toBeCloseTo(v, 6);
  });

  it('log avec un minimum nul retombe sur linéaire', () => {
    expect(versNorme(50, { min: 0, max: 100, curve: 'log' })).toBe(0.5);
  });

  it('arrondit au pas sans bruit de virgule flottante', () => {
    expect(arrondirPas(0.30000000000000004, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
    expect(arrondirPas(7.4, { min: 0, max: 100, step: 1 })).toBe(7);
    expect(arrondirPas(131.27, { min: 40, max: 300, step: 0.1 })).toBe(131.3);
    expect(depuisNorme(1, { min: 0, max: 7, step: 1 })).toBe(7);
  });

  it('courbe de volume : 0 dB vers 89 % de la course', () => {
    expect(volumeVersNorme(1)).toBeCloseTo(Math.sqrt(0.8), 6);
    expect(volumeDepuisNorme(volumeVersNorme(0.42))).toBeCloseTo(0.42, 9);
    expect(volumeDepuisNorme(0)).toBe(0);
    expect(volumeDepuisNorme(1)).toBe(1.25);
  });
});

describe('affichage', () => {
  it('fréquences, durées, dB, pourcentages', () => {
    expect(formater(1200, 'Hz')).toBe('1,2 kHz');
    expect(formater(440, 'Hz')).toBe('440 Hz');
    expect(formater(350, 'ms')).toBe('350 ms');
    expect(formater(1500, 'ms')).toBe('1,5 s');
    expect(formater(-6, 'dB')).toBe('-6 dB');
    expect(formater(3.5, 'dB')).toBe('+3,5 dB');
    expect(formater(-120, 'dB')).toBe('-∞ dB');
    expect(formater(75, '%')).toBe('75 %');
    expect(formater(7, 'demi-tons')).toBe('+7 demi-tons');
    expect(formater(-1, 'demi-tons')).toBe('-1 demi-ton');
  });

  it('durées musicales', () => {
    expect(formaterTemps(0.25)).toBe('1/16');
    expect(formaterTemps(1 / 3)).toBe('1/8 T');
    expect(formaterTemps(4)).toBe('1 mesure');
  });

  it('pan et volume', () => {
    expect(formaterPan(0)).toBe('Centre');
    expect(formaterPan(-0.4)).toBe('G 40');
    expect(formaterPan(1)).toBe('D 100');
    expect(formaterVolume(1)).toBe('0 dB');
    expect(formaterVolume(0)).toBe('-∞ dB');
  });
});

describe('vu-mètre', () => {
  it('échelle -60..+6 dB', () => {
    expect(hauteurDb(0)).toBe(0);
    expect(hauteurDb(1)).toBeCloseTo(60 / 66, 6);
    expect(hauteurDb(4)).toBe(1);
    expect(hauteurDb(0.0001)).toBe(0);
  });
});
