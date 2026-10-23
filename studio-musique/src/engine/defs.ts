// Constructeurs des descriptions de réglages, partagés par les instruments et les effets.
// (Séparés de params.ts pour éviter un import circulaire avec registry.ts.)
import type { ParamDef } from './params';

type Extra = Partial<Omit<ParamDef, 'id' | 'label' | 'kind' | 'default' | 'help'>>;

export function num(id: string, label: string, min: number, max: number, def: number, help: string, extra: Extra = {}): ParamDef {
  return { id, label, kind: 'number', min, max, default: def, help, ...extra };
}

export function choice(id: string, label: string, options: [string, string][], def: string, help: string, extra: Extra = {}): ParamDef {
  return { id, label, kind: 'choice', options: options.map(([value, l]) => ({ value, label: l })), default: def, help, ...extra };
}

export function toggle(id: string, label: string, def: boolean, help: string, extra: Extra = {}): ParamDef {
  return { id, label, kind: 'toggle', default: def, help, ...extra };
}

export function adsrParams(prefix: string, group: string, d: { a: number; d: number; s: number; r: number }): ParamDef[] {
  return [
    num(`${prefix}a`, 'Attaque', 0, 5000, d.a, 'Temps de montée du son après la note.', { group, unit: 'ms', curve: 'log' }),
    num(`${prefix}d`, 'Déclin', 1, 10000, d.d, 'Temps pour descendre jusqu’au maintien.', { group, unit: 'ms', curve: 'log' }),
    num(`${prefix}s`, 'Maintien', 0, 1, d.s, 'Niveau tenu tant que la note est enfoncée.', { group, step: 0.01 }),
    num(`${prefix}r`, 'Relâchement', 3, 10000, d.r, 'Temps d’extinction après la fin de la note.', { group, unit: 'ms', curve: 'log' }),
  ];
}

/** Divisions de temps synchronisées au tempo, en noires. */
export const SYNC_DIVISIONS: [string, string, number][] = [
  ['4', '1 mesure', 4], ['2', '1/2', 2], ['1', '1/4', 1], ['0.75', '1/8 pointée', 0.75],
  ['0.5', '1/8', 0.5], ['0.333', '1/8 triolet', 1 / 3], ['0.25', '1/16', 0.25], ['0.125', '1/32', 0.125],
];

export function divisionBeats(value: string): number {
  return SYNC_DIVISIONS.find(([v]) => v === value)?.[2] ?? 1;
}
