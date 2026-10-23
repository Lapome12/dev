// Presets de Corde (corde pincée) : 6 sons maison.
import type { PresetSpec } from './spec';

export const CORDE: PresetSpec[] = [
  { id: 'corde-guitare-nylon', name: 'Guitare nylon', category: 'Cordes pincées', params: { brillance: 0.45, maintien: 0.75, position: 0.18, attaque: 0.4, relachement: 200 } },
  { id: 'corde-guitare-acier', name: 'Guitare acier', category: 'Cordes pincées', params: { brillance: 0.8, maintien: 0.85, position: 0.12, attaque: 0.7, relachement: 250 } },
  { id: 'corde-harpe', name: 'Harpe', category: 'Cordes pincées', params: { brillance: 0.6, maintien: 0.92, position: 0.3, attaque: 0.35, relachement: 1200 } },
  { id: 'corde-koto', name: 'Koto', category: 'Cordes pincées', params: { brillance: 0.85, maintien: 0.7, position: 0.08, attaque: 0.85, relachement: 300 } },
  { id: 'corde-basse-pincee', name: 'Basse pincée', category: 'Cordes pincées', params: { brillance: 0.3, maintien: 0.8, position: 0.25, attaque: 0.6, relachement: 120 } },
  { id: 'corde-pizzicato', name: 'Pizzicato', category: 'Cordes pincées', params: { brillance: 0.5, maintien: 0.35, position: 0.2, attaque: 0.5, relachement: 60 } },
];
