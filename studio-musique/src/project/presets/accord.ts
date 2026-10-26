// Presets d'Accord (étape 6) : stabs house, orgues garage, nappes larges, pianos house, accords dub.
import type { ParamValue } from '../types';
import type { PresetSpec } from './spec';

type Timbre = 'orgue' | 'nappe' | 'piano';
const env = (p: 'f' | 'amp', a: number, d: number, s: number, r: number) => ({ [`${p}a`]: a, [`${p}d`]: d, [`${p}s`]: s, [`${p}r`]: r });

function accord(timbre: Timbre, accord: string, reglages: Record<string, ParamValue>): Record<string, ParamValue> {
  return { timbre, accord, ...reglages };
}

export const ACCORD: PresetSpec[] = [
  { id: 'accord-stab-house', name: 'Stab house', category: 'Stabs', params: accord('nappe', 'm7', { coupure: 2200, resonance: 4, envfiltre: 2.5, ...env('f', 1, 180, 0.1, 120), ...env('amp', 1, 220, 0, 120), largeur: 0.6 }) },
  { id: 'accord-stab-court', name: 'Stab court', category: 'Stabs', params: accord('nappe', 'mineur', { coupure: 1800, resonance: 6, envfiltre: 3, ...env('f', 1, 90, 0, 60), ...env('amp', 1, 120, 0, 60), largeur: 0.5 }) },
  { id: 'accord-dub', name: 'Accord dub', category: 'Stabs', params: accord('nappe', 'm9', { coupure: 900, resonance: 3, envfiltre: 2, brillance: 0.3, ...env('f', 2, 300, 0.1, 400), ...env('amp', 2, 400, 0, 600), largeur: 0.8 }) },
  { id: 'accord-sus-techno', name: 'Quarte suspendue', category: 'Stabs', params: accord('nappe', 'sus4', { coupure: 1500, resonance: 7, envfiltre: 2.5, ...env('f', 1, 150, 0.05, 150), ...env('amp', 1, 200, 0, 150), largeur: 0.7 }) },
  { id: 'accord-orgue-garage', name: 'Orgue garage', category: 'Orgues', params: accord('orgue', 'm7', { tirette1: 0.9, tirette2: 0.7, tirette3: 0.5, tirette4: 0.2, coupure: 6000, ...env('amp', 2, 300, 0.6, 150) }) },
  { id: 'accord-orgue-rond', name: 'Orgue rond', category: 'Orgues', params: accord('orgue', 'majeur', { tirette1: 1, tirette2: 0.4, tirette3: 0.2, tirette4: 0, coupure: 4000, ...env('amp', 3, 500, 0.8, 250) }) },
  { id: 'accord-orgue-percussif', name: 'Orgue percussif', category: 'Orgues', params: accord('orgue', 'm9', { tirette1: 0.8, tirette2: 0.8, tirette3: 0.7, tirette4: 0.6, coupure: 8000, ...env('amp', 1, 160, 0.2, 100) }) },
  { id: 'accord-nappe-detroit', name: 'Nappe Detroit', category: 'Nappes', params: accord('nappe', 'm9', { desaccord: 25, brillance: 0.5, coupure: 3000, resonance: 2, envfiltre: 1, ...env('f', 800, 1200, 0.6, 1500), ...env('amp', 600, 800, 0.8, 1800), largeur: 1 }) },
  { id: 'accord-nappe-aube', name: 'Aube', category: 'Nappes', params: accord('nappe', 'sus2', { desaccord: 35, brillance: 0.6, coupure: 4500, ...env('f', 1500, 2000, 0.7, 2000), ...env('amp', 1200, 1000, 0.85, 2500), largeur: 1 }) },
  { id: 'accord-nappe-sombre', name: 'Nappe sombre', category: 'Nappes', params: accord('nappe', 'mineur', { desaccord: 18, brillance: 0.25, coupure: 1200, resonance: 3, ...env('f', 900, 1500, 0.5, 1800), ...env('amp', 900, 900, 0.8, 2000), largeur: 0.9, octave: -1 }) },
  { id: 'accord-piano-house', name: 'Piano house', category: 'Pianos', params: accord('piano', 'majeur', { brillance: 0.7, coupure: 9000, ...env('amp', 1, 900, 0.2, 300), largeur: 0.4 }) },
  { id: 'accord-piano-soul', name: 'Piano soul', category: 'Pianos', params: accord('piano', 'sept', { brillance: 0.5, coupure: 7000, renversement: 1, ...env('amp', 2, 1200, 0.3, 400), largeur: 0.5 }) },
];
