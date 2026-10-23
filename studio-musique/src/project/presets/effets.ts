// Presets d'effets maison : pièces de réverbe, délais, compression, égalisation, couleur et filtres.
import type { EffectType } from '../types';
import type { PresetSpec } from './spec';

const REVERBE: PresetSpec[] = [
  { id: 'reverbe-petite-piece', name: 'Petite pièce', category: 'Pièces', params: { taille: 0.6, brillance: 0.45, predelai: 5, coupebas: 200 } },
  { id: 'reverbe-studio', name: 'Studio boisé', category: 'Pièces', params: { taille: 1.2, brillance: 0.35, predelai: 12, coupebas: 180 } },
  { id: 'reverbe-salle', name: 'Grande salle', category: 'Salles', params: { taille: 3.2, brillance: 0.5, predelai: 30, coupebas: 150 } },
  { id: 'reverbe-cathedrale', name: 'Cathédrale', category: 'Salles', params: { taille: 8, brillance: 0.4, predelai: 60, coupebas: 250 } },
  { id: 'reverbe-plaque', name: 'Plaque brillante', category: 'Plaques', params: { taille: 1.8, brillance: 0.85, predelai: 0, coupebas: 300 } },
];

const DELAI: PresetSpec[] = [
  { id: 'delai-croche-pointee', name: 'Croche pointée', category: 'Délais', params: { sync: true, division: '0.75', reinjection: 0.4, pingpong: true, aigus: 5000, graves: 200 } },
  { id: 'delai-slap', name: 'Écho court', category: 'Délais', params: { sync: false, temps: 90, reinjection: 0.1, pingpong: false, aigus: 8000, graves: 120 } },
  { id: 'delai-noire', name: 'Écho à la noire', category: 'Délais', params: { sync: true, division: '1', reinjection: 0.5, pingpong: false, aigus: 3500, graves: 250 } },
  { id: 'delai-bande', name: 'Bande usée', category: 'Délais', params: { sync: true, division: '0.5', reinjection: 0.65, pingpong: true, aigus: 2200, graves: 400 } },
];

const COMPRESSEUR: PresetSpec[] = [
  { id: 'compresseur-batterie', name: 'Batterie qui claque', category: 'Dynamique', params: { seuil: -20, ratio: 4, attaque: 15, relachement: 120, genou: 4, gain: 4 } },
  { id: 'compresseur-voix', name: 'Lissage doux', category: 'Dynamique', params: { seuil: -24, ratio: 2.5, attaque: 8, relachement: 200, genou: 12, gain: 3 } },
  { id: 'compresseur-colle', name: 'Colle du mix', category: 'Dynamique', params: { seuil: -14, ratio: 2, attaque: 30, relachement: 300, genou: 10, gain: 2 } },
];

const EQ: PresetSpec[] = [
  { id: 'eq-basse-claire', name: 'Basse nette', category: 'Égalisation', params: { b1gain: 2, b2gain: -2, b3gain: -3, b4gain: 1.5, b6gain: -2 } },
  { id: 'eq-voix-presence', name: 'Présence', category: 'Égalisation', params: { b1gain: -6, b3gain: -1.5, b5gain: 2.5, b6gain: 3 } },
  { id: 'eq-telephone', name: 'Petit haut-parleur', category: 'Égalisation', params: { b1gain: -18, b2gain: -12, b4gain: 6, b5gain: 3, b6gain: -12, b7gain: -18 } },
];

const DISTORSION: PresetSpec[] = [
  { id: 'distorsion-chaleur', name: 'Chaleur', category: 'Couleur', params: { forme: 'douce', drive: 6, tonalite: 9000, sortie: -3 } },
  { id: 'distorsion-fuzz', name: 'Grosse saturation', category: 'Couleur', params: { forme: 'dure', drive: 28, tonalite: 4000, sortie: -12 } },
];

const FILTRE: PresetSpec[] = [
  { id: 'filtre-balayage', name: 'Balayage lent', category: 'Filtres', params: { type: 'lowpass', frequence: 900, resonance: 4, pente: '24', lfoforme: 'sine', lfodivision: '8', lfoquantite: 2 } },
  { id: 'filtre-wah', name: 'Wah rythmé', category: 'Filtres', params: { type: 'bandpass', frequence: 1000, resonance: 6, pente: '12', lfoforme: 'triangle', lfodivision: '0.5', lfoquantite: 1.5 } },
  { id: 'filtre-radio', name: 'Passe-haut radio', category: 'Filtres', params: { type: 'highpass', frequence: 600, resonance: 1.5, pente: '24', lfoquantite: 0 } },
];

const LIMITEUR: PresetSpec[] = [
  { id: 'limiteur-master-doux', name: 'Master transparent', category: 'Master', params: { gain: 2, plafond: -1, relachement: 200 } },
  { id: 'limiteur-master-fort', name: 'Master puissant', category: 'Master', params: { gain: 6, plafond: -1, relachement: 80 } },
  { id: 'limiteur-securite', name: 'Sécurité', category: 'Master', params: { gain: 0, plafond: -0.3, relachement: 100 } },
];

const CHORUS: PresetSpec[] = [
  { id: 'chorus-large', name: 'Doublage large', category: 'Modulation', params: { mode: 'chorus', vitesse: 0.6, profondeur: 0.45, delai: 14, reinjection: 0.1, largeur: 1 } },
  { id: 'chorus-avion', name: 'Avion', category: 'Modulation', params: { mode: 'flanger', vitesse: 0.15, profondeur: 0.8, delai: 5, reinjection: 0.7, largeur: 0.7 } },
];

const POMPE: PresetSpec[] = [
  { id: 'pompe-noire', name: 'Pompe à la noire', category: 'Rythme', params: { division: '1', profondeur: 0.7, courbe: 'douce' } },
  { id: 'pompe-legere', name: 'Respiration légère', category: 'Rythme', params: { division: '1', profondeur: 0.35, courbe: 'lineaire' } },
];

const BITCRUSHER: PresetSpec[] = [
  { id: 'bitcrusher-cassette', name: 'Grain de cassette', category: 'Couleur', params: { bits: 10, gain: 0, adoucir: 9000, sortie: 0 } },
  { id: 'bitcrusher-console', name: 'Console 8 bits', category: 'Couleur', params: { bits: 5, gain: 3, adoucir: 20000, sortie: -4 } },
];

export const EFFETS: [EffectType, PresetSpec[]][] = [
  ['reverbe', REVERBE], ['delai', DELAI], ['compresseur', COMPRESSEUR], ['eq', EQ], ['distorsion', DISTORSION], ['filtre', FILTRE],
  ['limiteur', LIMITEUR], ['chorus', CHORUS], ['pompe', POMPE], ['bitcrusher', BITCRUSHER],
];
