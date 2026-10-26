// Presets des effets de l'étape 6 (techno et house) : porte, phaser, autofiltre, saturation,
// sidechain, et le « grondement » techno (réverbe sombre sous la grosse caisse).
import type { EffectType } from '../types';
import type { PresetSpec } from './spec';

const PORTE: PresetSpec[] = [
  { id: 'porte-trance', name: 'Porte trance', category: 'Rythme', params: { motif: 'xx.xx.x.xx.xx.x.', division: '1/16', lissage: 3, profondeur: 1, mix: 1 } },
  { id: 'porte-croches', name: 'Hachoir à la croche', category: 'Rythme', params: { motif: 'x.x.x.x.x.x.x.x.', division: '1/16', lissage: 5, profondeur: 0.85, mix: 1 } },
  { id: 'porte-contretemps', name: 'Contretemps', category: 'Rythme', params: { motif: '..x...x...x...x.', division: '1/16', lissage: 8, profondeur: 1, mix: 1 } },
  { id: 'porte-galop', name: 'Galop', category: 'Rythme', params: { motif: 'x.xxx.xxx.xxx.xx', division: '1/16', lissage: 2, profondeur: 0.9, mix: 1 } },
];

const PHASER: PresetSpec[] = [
  { id: 'phaser-lent', name: 'Phaser lent', category: 'Modulation', params: { etages: '8', frequence: 600, profondeur: 0.8, synchro: '16', reinjection: 0.4, melange: 0.5 } },
  { id: 'phaser-tourbillon', name: 'Tourbillon', category: 'Modulation', params: { etages: '12', frequence: 900, profondeur: 1, synchro: '1', reinjection: 0.75, melange: 0.6 } },
  { id: 'phaser-doux', name: 'Moiré doux', category: 'Modulation', params: { etages: '4', frequence: 400, profondeur: 0.5, synchro: 'libre', vitesse: 0.3, reinjection: 0.2, melange: 0.4 } },
];

const AUTOFILTRE: PresetSpec[] = [
  { id: 'autofiltre-montee-8', name: 'Montée 8 mesures', category: 'Filtres', params: { type: 'lowpass', frequence: 200, resonance: 4, pente: '24', source: 'lfo', quantite: 4.5, forme: 'rampe', division: '32' } },
  { id: 'autofiltre-ouverture-lente', name: 'Ouverture lente', category: 'Filtres', params: { type: 'lowpass', frequence: 300, resonance: 2, pente: '12', source: 'lfo', quantite: 3.5, forme: 'triangle', division: '16' } },
  { id: 'autofiltre-wah', name: 'Bouche à la croche', category: 'Filtres', params: { type: 'bandpass', frequence: 500, resonance: 6, pente: '12', source: 'lfo', quantite: 2.5, forme: 'sine', division: '0.5' } },
  { id: 'autofiltre-suiveur', name: 'Suiveur funky', category: 'Filtres', params: { type: 'lowpass', frequence: 400, resonance: 5, pente: '24', source: 'enveloppe', quantite: 3, sensibilite: 12, retour: 120 } },
  { id: 'autofiltre-coupe-graves', name: 'Graves qui reviennent', category: 'Filtres', params: { type: 'highpass', frequence: 40, resonance: 1.5, pente: '24', source: 'lfo', quantite: 3, forme: 'rampe', division: '16' } },
];

const SATURATION: PresetSpec[] = [
  { id: 'saturation-bande', name: 'Saturation bande', category: 'Couleur', params: { mode: 'bande', drive: 9, tonalite: 12000, mix: 1, compensation: true } },
  { id: 'saturation-lampe', name: 'Lampe chaude', category: 'Couleur', params: { mode: 'lampe', drive: 14, tonalite: 9000, mix: 0.8, compensation: true } },
  { id: 'saturation-repli', name: 'Repli métallique', category: 'Couleur', params: { mode: 'repli', drive: 20, tonalite: 7000, mix: 0.6, compensation: true } },
  { id: 'saturation-grondement', name: 'Grondement techno', category: 'Couleur', params: { mode: 'lampe', drive: 24, tonalite: 2500, mix: 1, compensation: true } },
];

const SIDECHAIN: PresetSpec[] = [
  { id: 'sidechain-classique', name: 'Sidechain classique', category: 'Dynamique', params: { source: 1, seuil: -24, ratio: 6, attaque: 1, relachement: 180, profondeur: 0.7 } },
  { id: 'sidechain-extreme', name: 'Sidechain extrême', category: 'Dynamique', params: { source: 1, seuil: -36, ratio: 20, attaque: 0.1, relachement: 260, profondeur: 1 } },
  { id: 'sidechain-discret', name: 'Respiration discrète', category: 'Dynamique', params: { source: 1, seuil: -18, ratio: 3, attaque: 5, relachement: 120, profondeur: 0.4 } },
];

// Le « grondement » techno : réverbe longue et très sombre sur la grosse caisse, coupée à l'aigu.
const REVERBE_TECHNO: PresetSpec[] = [
  { id: 'reverbe-grondement', name: 'Grondement techno', category: 'Salles', params: { taille: 3, brillance: 0.08, predelai: 0, coupebas: 30 } },
];

export const EFFETS_TECHNO: [EffectType, PresetSpec[]][] = [
  ['porte', PORTE], ['phaser', PHASER], ['autofiltre', AUTOFILTRE], ['saturation', SATURATION],
  ['sidechain', SIDECHAIN], ['reverbe', REVERBE_TECHNO],
];
