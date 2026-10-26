// Kits de Frappe : 6 kits de 12 voix maison (étape 6 : percu et ride, plus le réglage « Caractère »). Chaque voix : accord, déclin, tonalité, claquement, niveau.
import type { ParamValue } from '../types';
import type { PresetSpec } from './spec';

const VOICES = ['gc', 'rim', 'cc', 'clap', 'tomg', 'chf', 'tomm', 'cho', 'percu', 'crash', 'ride', 'cloche'] as const;
type Voice = (typeof VOICES)[number];
type V = [accord: number, declin: number, tonalite: number, claquement: number, niveau: number];

function kit(voices: Record<Voice, V>, caractere?: number): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = caractere === undefined ? {} : { caractere };
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
    percu: [-2, 200, 0.4, 0.3, 0.6], crash: [-2, 380, 0.4, 0.3, 0.55], ride: [-2, 360, 0.35, 0.3, 0.45], cloche: [-2, 140, 0.4, 0.2, 0.6],
  }) },
  { id: 'frappe-kit-club', name: 'Club', category: 'Kits', params: kit({
    gc: [0, 300, 0.5, 0.35, 1], rim: [2, 50, 0.6, 0.6, 0.6], cc: [1, 140, 0.6, 0.55, 0.75], clap: [0, 200, 0.6, 0.6, 0.85],
    tomg: [0, 240, 0.5, 0.25, 0.7], chf: [2, 40, 0.75, 0.35, 0.65], tomm: [2, 200, 0.55, 0.25, 0.7], cho: [1, 220, 0.75, 0.3, 0.6],
    percu: [0, 180, 0.55, 0.35, 0.65], crash: [0, 400, 0.65, 0.3, 0.55], ride: [0, 380, 0.6, 0.3, 0.5], cloche: [0, 120, 0.6, 0.2, 0.6],
  }) },
  { id: 'frappe-kit-machine80', name: 'Machine 80', category: 'Kits', params: kit({
    gc: [-4, 400, 0.25, 0.25, 1], rim: [0, 40, 0.7, 0.7, 0.65], cc: [0, 220, 0.7, 0.45, 0.85], clap: [0, 240, 0.7, 0.7, 0.85],
    tomg: [-5, 380, 0.3, 0.1, 0.8], chf: [3, 60, 0.85, 0.2, 0.6], tomm: [-2, 320, 0.35, 0.1, 0.8], cho: [3, 300, 0.85, 0.2, 0.55],
    percu: [0, 220, 0.6, 0.2, 0.65], crash: [2, 400, 0.8, 0.2, 0.5], ride: [2, 400, 0.75, 0.2, 0.45], cloche: [3, 180, 0.7, 0.2, 0.65],
  }) },
  { id: 'frappe-kit-entrepot', name: 'Entrepôt', category: 'Kits techno', params: kit({
    gc: [-3, 380, 0.3, 0.6, 1], rim: [1, 40, 0.65, 0.7, 0.6], cc: [-1, 160, 0.5, 0.7, 0.75], clap: [-1, 260, 0.45, 0.65, 0.8],
    tomg: [-4, 300, 0.3, 0.3, 0.7], chf: [1, 35, 0.7, 0.5, 0.6], tomm: [-2, 260, 0.35, 0.3, 0.7], cho: [0, 200, 0.7, 0.4, 0.55],
    percu: [-3, 160, 0.45, 0.5, 0.6], crash: [-1, 380, 0.55, 0.4, 0.5], ride: [-1, 400, 0.55, 0.35, 0.5], cloche: [-2, 100, 0.5, 0.3, 0.55],
  }, 0.75) },
  { id: 'frappe-kit-garage', name: 'Garage', category: 'Kits house', params: kit({
    gc: [-1, 280, 0.45, 0.4, 0.95], rim: [2, 55, 0.6, 0.55, 0.7], cc: [0, 170, 0.55, 0.5, 0.75], clap: [1, 230, 0.55, 0.55, 0.85],
    tomg: [-1, 250, 0.45, 0.25, 0.7], chf: [2, 45, 0.7, 0.3, 0.6], tomm: [1, 220, 0.5, 0.25, 0.7], cho: [2, 240, 0.7, 0.3, 0.6],
    percu: [2, 200, 0.6, 0.3, 0.7], crash: [0, 360, 0.6, 0.3, 0.5], ride: [1, 400, 0.65, 0.25, 0.55], cloche: [1, 150, 0.6, 0.2, 0.6],
  }, 0.35) },
  { id: 'frappe-kit-minimal', name: 'Minimal', category: 'Kits techno', params: kit({
    gc: [0, 200, 0.4, 0.5, 0.95], rim: [3, 30, 0.75, 0.8, 0.65], cc: [2, 90, 0.65, 0.6, 0.6], clap: [2, 140, 0.65, 0.7, 0.7],
    tomg: [0, 180, 0.4, 0.4, 0.6], chf: [4, 25, 0.85, 0.5, 0.55], tomm: [2, 160, 0.5, 0.4, 0.6], cho: [3, 140, 0.8, 0.4, 0.5],
    percu: [3, 110, 0.6, 0.6, 0.65], crash: [2, 300, 0.75, 0.3, 0.4], ride: [2, 380, 0.75, 0.3, 0.45], cloche: [4, 80, 0.7, 0.4, 0.6],
  }, 0.1) },
];
