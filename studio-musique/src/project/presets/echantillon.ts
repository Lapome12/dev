// Réglages de départ d'Échantillon : 2 points de départ (le son lui-même est choisi par l'utilisateur).
import type { PresetSpec } from './spec';

export const ECHANTILLON: PresetSpec[] = [
  { id: 'echantillon-coup', name: 'Coup (sans boucle)', category: 'Départs', params: { boucle: false, ampa: 1, ampd: 200, amps: 1, ampr: 40, filtre: 'aucun' } },
  { id: 'echantillon-tenue', name: 'Tenue en boucle', category: 'Départs', params: { boucle: true, ampa: 120, amps: 1, ampr: 600, filtre: 'lowpass', coupure: 9000 } },
];
