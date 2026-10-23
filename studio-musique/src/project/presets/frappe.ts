// Kits de Frappe : 3 kits de 10 voix maison. Chaque voix : accord, déclin, tonalité, claquement, niveau.
import type { ParamValue } from '../types';
import type { PresetSpec } from './spec';

const VOICES = ['gc', 'rim', 'cc', 'clap', 'tomg', 'chf', 'tomm', 'cho', 'crash', 'cloche'] as const;
type Voice = (typeof VOICES)[number];
type V = [accord: number, declin: number, tonalite: number, claquement: number, niveau: number];

function kit(voices: Record<Voice, V>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const v of VOICES) {
    const [accord, declin, tonalite, claquement, niveau] = voices[v];
    Object.assign(out, { [`${v}accord`]: accord, [`${v}declin`]: declin, [`${v}tonalite`]: tonalite, [`${v}claquement`]: claquement, [`${v}niveau`]: niveau });
  }
  return out;
}

export const FRAPPE: PresetSpec[] = [
  { id: 'frappe-kit-boombap', name: 'Boom-bap', category: 'Kits', params: kit({
    gc: [-2, 220, 0.35, 0.55, 0.95], rim: [0, 60, 0.5, 0.6, 0.7], cc: [-3, 180, 0.35, 0.75, 0.85], clap: [-2, 160, 0.4, 0.5, 0.7],
    tomg: [-3, 260, 0.35, 0.2, 0.75], chf: [-2, 50, 0.45, 0.4, 0.6], tomm: [-1, 220, 0.45, 0.2, 0.75], cho: [-2, 260, 0.45, 0.3, 0.55],
    crash: [-2, 380, 0.4, 0.3, 0.55], cloche: [-2, 140, 0.4, 0.2, 0.6],
  }) },
  { id: 'frappe-kit-club', name: 'Club', category: 'Kits', params: kit({
    gc: [0, 300, 0.5, 0.35, 1], rim: [2, 50, 0.6, 0.6, 0.6], cc: [1, 140, 0.6, 0.55, 0.75], clap: [0, 200, 0.6, 0.6, 0.85],
    tomg: [0, 240, 0.5, 0.25, 0.7], chf: [2, 40, 0.75, 0.35, 0.65], tomm: [2, 200, 0.55, 0.25, 0.7], cho: [1, 220, 0.75, 0.3, 0.6],
    crash: [0, 400, 0.65, 0.3, 0.55], cloche: [0, 120, 0.6, 0.2, 0.6],
  }) },
  { id: 'frappe-kit-machine80', name: 'Machine 80', category: 'Kits', params: kit({
    gc: [-4, 400, 0.25, 0.25, 1], rim: [0, 40, 0.7, 0.7, 0.65], cc: [0, 220, 0.7, 0.45, 0.85], clap: [0, 240, 0.7, 0.7, 0.85],
    tomg: [-5, 380, 0.3, 0.1, 0.8], chf: [3, 60, 0.85, 0.2, 0.6], tomm: [-2, 320, 0.35, 0.1, 0.8], cho: [3, 300, 0.85, 0.2, 0.55],
    crash: [2, 400, 0.8, 0.2, 0.5], cloche: [3, 180, 0.7, 0.2, 0.65],
  }) },
];
