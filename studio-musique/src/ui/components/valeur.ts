// Conversions de valeurs des réglages : position normalisée 0..1 <-> valeur réelle, pas, affichage.
// Partagé par le bouton rotatif, le fader et le champ numérique. Fonctions pures, testées.

import { borner } from '../dom';

export type Courbe = 'lin' | 'log';
export type Unite = 'Hz' | 'ms' | 's' | 'dB' | '%' | 'demi-tons' | 'cents' | 'temps';

export interface Plage { min: number; max: number; step?: number; curve?: Courbe }

/** Valeur réelle -> position 0..1. La courbe log exige min > 0 ; sinon on retombe sur lin. */
export function versNorme(v: number, p: Plage): number {
  if (p.max === p.min) return 0;
  const vb = borner(v, p.min, p.max);
  if (p.curve === 'log' && p.min > 0) return Math.log(vb / p.min) / Math.log(p.max / p.min);
  return (vb - p.min) / (p.max - p.min);
}

/** Position 0..1 -> valeur réelle, arrondie au pas. */
export function depuisNorme(n: number, p: Plage): number {
  const nb = borner(n, 0, 1);
  const brute = p.curve === 'log' && p.min > 0
    ? p.min * Math.pow(p.max / p.min, nb)
    : p.min + nb * (p.max - p.min);
  return arrondirPas(brute, p);
}

export function arrondirPas(v: number, p: Plage): number {
  const vb = borner(v, p.min, p.max);
  if (!p.step || p.step <= 0) return vb;
  const r = Math.round((vb - p.min) / p.step) * p.step + p.min;
  // Supprime le bruit de virgule flottante (0.30000000000000004).
  const decimales = Math.max(0, -Math.floor(Math.log10(p.step)) + 1);
  return borner(Number(r.toFixed(Math.min(10, decimales))), p.min, p.max);
}

const nf = (decimales: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimales, minimumFractionDigits: 0 });

/** Texte affiché pour une valeur : « 1,2 kHz », « 350 ms », « -6,0 dB », « 75 % », « +3 demi-tons ». */
export function formater(v: number, unite?: Unite, step?: number): string {
  const dec = step && step < 1 ? Math.min(3, Math.ceil(-Math.log10(step))) : 0;
  switch (unite) {
    case 'Hz':
      return Math.abs(v) >= 1000 ? `${nf(2).format(v / 1000)} kHz` : `${nf(v < 100 ? 1 : 0).format(v)} Hz`;
    case 'ms':
      return Math.abs(v) >= 1000 ? `${nf(2).format(v / 1000)} s` : `${nf(v < 10 ? 1 : 0).format(v)} ms`;
    case 's':
      return Math.abs(v) < 1 ? `${nf(0).format(v * 1000)} ms` : `${nf(2).format(v)} s`;
    case 'dB':
      return v <= -96 ? '-∞ dB' : `${v > 0 ? '+' : ''}${nf(1).format(v)} dB`;
    case '%':
      return `${nf(0).format(v)} %`;
    case 'demi-tons':
      return `${v > 0 ? '+' : ''}${nf(dec).format(v)} demi-ton${Math.abs(v) >= 2 ? 's' : ''}`;
    case 'cents':
      return `${v > 0 ? '+' : ''}${nf(0).format(v)} cents`;
    case 'temps':
      return formaterTemps(v);
    default:
      return nf(Math.max(dec, Math.abs(v) < 10 && !step ? 2 : 0)).format(v);
  }
}

/** Durées musicales exprimées en temps (noires) : 0,25 -> « 1/16 », 1 -> « 1/4 », 4 -> « 1 mesure ». */
export function formaterTemps(temps: number): string {
  const connus: [number, string][] = [
    [1 / 8, '1/32'], [1 / 6, '1/16 T'], [3 / 16, '1/32 p.'], [1 / 4, '1/16'], [1 / 3, '1/8 T'], [3 / 8, '1/16 p.'],
    [1 / 2, '1/8'], [2 / 3, '1/4 T'], [3 / 4, '1/8 p.'], [1, '1/4'], [3 / 2, '1/4 p.'], [2, '1/2'], [3, '1/2 p.'],
    [4, '1 mesure'], [8, '2 mesures'],
  ];
  for (const [v, t] of connus) if (Math.abs(v - temps) < 1e-6) return t;
  return `${nf(2).format(temps)} temps`;
}

/** Pan -1..1 -> « G 40 », « Centre », « D 100 ». */
export function formaterPan(p: number): string {
  const n = Math.round(Math.abs(p) * 100);
  if (n === 0) return 'Centre';
  return `${p < 0 ? 'G' : 'D'} ${n}`;
}

/** Gain linéaire -> dB (−∞ pour 0). */
export const versDb = (g: number): number => (g <= 0 ? -Infinity : 20 * Math.log10(g));
export const depuisDb = (db: number): number => (db === -Infinity ? 0 : Math.pow(10, db / 20));

/** Volume 0..1.25 affiché en dB : 1 = 0 dB. */
export function formaterVolume(g: number): string {
  const db = versDb(g);
  return db < -96 ? '-∞ dB' : `${db > 0 ? '+' : ''}${nf(1).format(db)} dB`;
}

/** Courbe « volume » des faders : position = (g / max)^(1/2), 0 dB tombe vers 89 % de la course. */
export const volumeVersNorme = (g: number, max = 1.25): number => Math.sqrt(borner(g, 0, max) / max);
export const volumeDepuisNorme = (n: number, max = 1.25): number => max * borner(n, 0, 1) ** 2;
