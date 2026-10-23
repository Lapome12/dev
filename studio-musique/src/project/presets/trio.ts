// Presets de Trio (soustractif) : 25 sons maison.
import type { PresetSpec } from './spec';

const basse = { mono: true, ampa: 2, amps: 0.9, ampr: 60, filtre: 'lowpass' };
const nappe = { ampa: 900, ampd: 1500, amps: 0.85, ampr: 1800, fa: 1200, fd: 2500, fs: 0.6, fr: 1500 };
const pince = { ampa: 1, ampd: 260, amps: 0, ampr: 180, fa: 1, fd: 220, fs: 0, fr: 150 };

export const TRIO: PresetSpec[] = [
  // Basses
  { id: 'trio-basse-ronde', name: 'Basse ronde', category: 'Basses', params: { ...basse, o1onde: 'sine', o1octave: -1, o2onde: 'triangle', o2octave: -1, o2niveau: 0.3, coupure: 900, envfiltre: 0.5, fd: 250, fs: 0.2 } },
  { id: 'trio-basse-acide', name: 'Basse acide', category: 'Basses', params: { ...basse, o1onde: 'sawtooth', o1octave: -1, o2niveau: 0, coupure: 380, resonance: 12, envfiltre: 3.2, fa: 1, fd: 180, fs: 0.05, portamento: 70 } },
  { id: 'trio-basse-sub', name: 'Sub profonde', category: 'Basses', params: { ...basse, o1onde: 'sine', o1octave: -2, o1niveau: 1, o2niveau: 0, coupure: 400, envfiltre: 0 } },
  { id: 'trio-basse-carree', name: 'Basse carrée', category: 'Basses', params: { ...basse, o1onde: 'square', o1octave: -1, o2onde: 'sine', o2octave: -2, o2niveau: 0.6, coupure: 1200, resonance: 3, envfiltre: 1.4, fd: 300, fs: 0.15 } },
  { id: 'trio-basse-grondement', name: 'Grondement', category: 'Basses', params: { ...basse, o1onde: 'sawtooth', o1octave: -1, o2onde: 'sawtooth', o2octave: -1, o2fin: 12, o2niveau: 0.7, unisson: 3, desaccord: 20, coupure: 700, resonance: 4, envfiltre: 1.8, fd: 350, fs: 0.3 } },
  { id: 'trio-basse-funk', name: 'Basse élastique', category: 'Basses', params: { ...basse, o1onde: 'sawtooth', o1octave: -1, o2onde: 'square', o2octave: -1, o2niveau: 0.5, coupure: 500, resonance: 7, envfiltre: 2.6, fd: 140, fs: 0, ampd: 300, amps: 0.6, portamento: 40 } },
  // Leads
  { id: 'trio-lead-scie', name: 'Lead scie', category: 'Leads', params: { o1onde: 'sawtooth', o2onde: 'sawtooth', o2fin: 9, o2niveau: 0.7, unisson: 3, desaccord: 18, coupure: 4200, resonance: 2, envfiltre: 0.8, mono: true, portamento: 60, lfocible: 'hauteur', lfovitesse: 5.5, lfoquantite: 0.08 } },
  { id: 'trio-lead-flute', name: 'Sifflet', category: 'Leads', params: { o1onde: 'sine', o2onde: 'triangle', o2octave: 1, o2niveau: 0.2, o3onde: 'bruit', o3niveau: 0.05, coupure: 3500, envfiltre: 0, ampa: 60, amps: 0.9, ampr: 250, lfocible: 'hauteur', lfovitesse: 5, lfoquantite: 0.06 } },
  { id: 'trio-lead-carre', name: 'Lead 8 bits', category: 'Leads', params: { o1onde: 'square', o2onde: 'square', o2octave: 1, o2niveau: 0.25, coupure: 9000, envfiltre: 0, ampa: 1, amps: 0.8, ampr: 60, mono: true } },
  { id: 'trio-lead-super', name: 'Super lead', category: 'Leads', params: { o1onde: 'sawtooth', o2onde: 'sawtooth', o2octave: 1, o2niveau: 0.4, unisson: 7, desaccord: 30, largeur: 0.9, coupure: 6000, resonance: 1.5, envfiltre: 0.6, ampr: 400 } },
  { id: 'trio-lead-chant', name: 'Lead chantant', category: 'Leads', params: { o1onde: 'triangle', o2onde: 'sawtooth', o2niveau: 0.3, o2fin: -6, coupure: 2600, resonance: 5, envfiltre: 0.7, ampa: 30, mono: true, portamento: 120, lfocible: 'filtre', lfovitesse: 4, lfoquantite: 0.2 } },
  // Nappes
  { id: 'trio-nappe-chaude', name: 'Nappe chaude', category: 'Nappes', params: { ...nappe, o1onde: 'sawtooth', o2onde: 'sawtooth', o2fin: 7, o2niveau: 0.6, unisson: 5, desaccord: 22, largeur: 0.85, coupure: 1800, envfiltre: 0.6 } },
  { id: 'trio-nappe-verre', name: 'Nappe de verre', category: 'Nappes', params: { ...nappe, o1onde: 'triangle', o2onde: 'sine', o2octave: 1, o2niveau: 0.5, o3onde: 'sine', o3octave: 2, o3niveau: 0.2, coupure: 7000, envfiltre: 0, lfocible: 'volume', lfovitesse: 0.4, lfoquantite: 0.15 } },
  { id: 'trio-nappe-brume', name: 'Brume', category: 'Nappes', params: { ...nappe, o1onde: 'sawtooth', o1niveau: 0.5, o2onde: 'bruit', o2niveau: 0.2, coupure: 900, resonance: 4, envfiltre: 0.4, lfocible: 'filtre', lfovitesse: 0.2, lfoquantite: 0.4, ampa: 2000, ampr: 3000 } },
  { id: 'trio-nappe-cordes', name: 'Ensemble de cordes', category: 'Nappes', params: { ...nappe, o1onde: 'sawtooth', o2onde: 'sawtooth', o2octave: 1, o2niveau: 0.35, unisson: 7, desaccord: 12, largeur: 1, coupure: 3200, envfiltre: 0.3, ampa: 400, lfocible: 'hauteur', lfovitesse: 5, lfoquantite: 0.03 } },
  { id: 'trio-nappe-aube', name: 'Aube', category: 'Nappes', params: { ...nappe, o1onde: 'square', o1niveau: 0.5, o2onde: 'sawtooth', o2demi: 7, o2niveau: 0.35, unisson: 3, desaccord: 15, coupure: 1400, envfiltre: 1.2, fa: 3000, fd: 4000 } },
  // Cuivres
  { id: 'trio-cuivre-section', name: 'Section de cuivres', category: 'Cuivres', params: { o1onde: 'sawtooth', o2onde: 'sawtooth', o2fin: 8, o2niveau: 0.8, unisson: 3, desaccord: 10, coupure: 1200, resonance: 1.5, envfiltre: 2, fa: 60, fd: 400, fs: 0.5, ampa: 40, amps: 0.85, ampr: 200 } },
  { id: 'trio-cuivre-stab', name: 'Coup de cuivre', category: 'Cuivres', params: { o1onde: 'sawtooth', o2onde: 'square', o2niveau: 0.5, unisson: 5, desaccord: 20, coupure: 1500, envfiltre: 2.5, fa: 1, fd: 200, fs: 0.1, ampa: 1, ampd: 350, amps: 0.1, ampr: 150 } },
  { id: 'trio-cuivre-doux', name: 'Cor feutré', category: 'Cuivres', params: { o1onde: 'sawtooth', o2onde: 'triangle', o2octave: -1, o2niveau: 0.6, coupure: 800, envfiltre: 1.3, fa: 150, fd: 600, fs: 0.4, ampa: 90, amps: 0.9 } },
  // Arpèges et sons pincés
  { id: 'trio-arp-pluck', name: 'Pluck clair', category: 'Arpèges', params: { ...pince, o1onde: 'sawtooth', o2onde: 'square', o2octave: 1, o2niveau: 0.3, coupure: 1200, resonance: 3, envfiltre: 3 } },
  { id: 'trio-arp-goutte', name: 'Gouttes', category: 'Arpèges', params: { ...pince, o1onde: 'sine', o2onde: 'triangle', o2octave: 2, o2niveau: 0.2, coupure: 5000, envfiltre: 0, ampd: 160 } },
  { id: 'trio-arp-harpe', name: 'Harpe synthétique', category: 'Arpèges', params: { ...pince, o1onde: 'triangle', o2onde: 'sawtooth', o2niveau: 0.25, coupure: 2500, envfiltre: 1.5, ampd: 700, ampr: 500 } },
  { id: 'trio-arp-sequence', name: 'Séquence analogique', category: 'Arpèges', params: { ...pince, o1onde: 'square', o2onde: 'sawtooth', o2fin: -10, o2niveau: 0.6, coupure: 700, resonance: 8, envfiltre: 2.4, mono: true } },
  // Textures
  { id: 'trio-texture-vent', name: 'Vent', category: 'Textures', params: { o1niveau: 0, o2niveau: 0, o3onde: 'bruit', o3niveau: 0.8, filtre: 'bandpass', coupure: 1200, resonance: 6, envfiltre: 0, ampa: 1500, amps: 1, ampr: 2500, lfocible: 'filtre', lfovitesse: 0.15, lfoquantite: 0.7 } },
  { id: 'trio-texture-sirene', name: 'Montée', category: 'Textures', params: { o1onde: 'sawtooth', o2onde: 'bruit', o2niveau: 0.3, coupure: 300, resonance: 5, envfiltre: 4, fa: 4000, fd: 4000, fs: 1, ampa: 500, amps: 1, ampr: 800 } },
];
