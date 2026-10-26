// Presets d'Acide (étape 6) : la basse monophonique qui couine, de la plus ronde à la plus sale.
import type { ParamValue } from '../types';
import type { PresetSpec } from './spec';

type A = [onde: 'sawtooth' | 'square', coupure: number, resonance: number, envmod: number, declin: number, accent: number, saturation: number];

function acide([onde, coupure, resonance, envmod, declin, accent, saturation]: A, extra: Record<string, ParamValue> = {}): Record<string, ParamValue> {
  return { onde, coupure, resonance, envmod, declin, accent, saturation, ...extra };
}

export const ACIDE: PresetSpec[] = [
  { id: 'acide-couineur', name: 'Couineur', category: 'Acides', params: acide(['sawtooth', 400, 0.85, 0.7, 260, 0.7, 0.2]) },
  { id: 'acide-profonde', name: 'Profonde', category: 'Acides', params: acide(['sawtooth', 220, 0.55, 0.35, 420, 0.4, 0.1], { transpose: -12 }) },
  { id: 'acide-hypnotique', name: 'Hypnotique', category: 'Acides', params: acide(['square', 350, 0.75, 0.5, 300, 0.5, 0.15]) },
  { id: 'acide-distordue', name: 'Distordue', category: 'Acides', params: acide(['sawtooth', 500, 0.8, 0.75, 220, 0.8, 0.85]) },
  { id: 'acide-bulle', name: 'Bulle', category: 'Acides', params: acide(['square', 300, 0.92, 0.6, 180, 0.6, 0.05], { glisse: 90 }) },
  { id: 'acide-rampante', name: 'Rampante', category: 'Acides', params: acide(['sawtooth', 160, 0.7, 0.45, 900, 0.35, 0.25], { glisse: 140 }) },
  { id: 'acide-mordante', name: 'Mordante', category: 'Acides', params: acide(['sawtooth', 700, 0.65, 0.85, 140, 0.9, 0.5]) },
  { id: 'acide-sous-marine', name: 'Sous-marine', category: 'Acides', params: acide(['square', 140, 0.6, 0.25, 600, 0.3, 0.1], { transpose: -12 }) },
  { id: 'acide-sifflante', name: 'Sifflante', category: 'Acides', params: acide(['sawtooth', 900, 0.97, 0.55, 240, 0.6, 0.3], { transpose: 12 }) },
  { id: 'acide-caoutchouc', name: 'Caoutchouc', category: 'Acides', params: acide(['square', 260, 0.5, 0.65, 120, 0.7, 0.2], { glisse: 40 }) },
  { id: 'acide-entrepot', name: 'Entrepôt', category: 'Acides', params: acide(['sawtooth', 320, 0.82, 0.6, 350, 0.75, 0.65]) },
  { id: 'acide-douce', name: 'Douce nuit', category: 'Acides', params: acide(['sawtooth', 600, 0.3, 0.25, 700, 0.2, 0], { relachement: 120 }) },
];
