// Presets de Prisme (FM 4 opérateurs) : 12 sons maison.
import type { PresetSpec } from './spec';

// Enveloppe d'un opérateur : attaque, déclin, maintien, relâchement (ms, ms, 0..1, ms).
const env = (o: number, a: number, d: number, s: number, r: number) => ({ [`o${o}a`]: a, [`o${o}d`]: d, [`o${o}s`]: s, [`o${o}r`]: r });
const op = (o: number, ratio: number, niveau: number, fin = 0) => ({ [`o${o}ratio`]: ratio, [`o${o}niveau`]: niveau, [`o${o}fin`]: fin });

export const PRISME: PresetSpec[] = [
  // Cloches
  { id: 'prisme-cloche-claire', name: 'Cloche claire', category: 'Cloches', params: { algo: '5', retour: 0, ...op(1, 1, 0.9), ...env(1, 1, 3000, 0, 2500), ...op(2, 3.5, 0.5), ...env(2, 1, 1800, 0, 1500), ...op(3, 1, 0.5, 3), ...env(3, 1, 2500, 0, 2000), ...op(4, 7, 0.3), ...env(4, 1, 900, 0, 800) } },
  { id: 'prisme-cloche-tube', name: 'Carillon', category: 'Cloches', params: { algo: '3', retour: 0.1, ...op(1, 1, 0.9), ...env(1, 2, 5000, 0, 4000), ...op(2, 3.5, 0.45), ...env(2, 1, 3000, 0, 2500), ...op(3, 1.41, 0.35), ...op(4, 2.76, 0.3), ...env(4, 1, 1500, 0, 1500) } },
  { id: 'prisme-cloche-verre', name: 'Verre', category: 'Cloches', params: { algo: '8', retour: 0, ...op(1, 1, 0.8), ...env(1, 1, 2500, 0, 2000), ...op(2, 2.76, 0.4), ...env(2, 1, 1500, 0, 1200), ...op(3, 5.4, 0.25), ...env(3, 1, 900, 0, 800), ...op(4, 8.9, 0.15), ...env(4, 1, 600, 0, 500) } },
  { id: 'prisme-cloche-boite', name: 'Boîte à musique', category: 'Cloches', params: { algo: '5', retour: 0, ...op(1, 2, 0.85), ...env(1, 1, 1400, 0, 1200), ...op(2, 8, 0.3), ...env(2, 1, 400, 0, 400), ...op(3, 4, 0.4), ...env(3, 1, 1000, 0, 900), ...op(4, 12, 0.2), ...env(4, 1, 250, 0, 250) } },
  // Pianos électriques
  { id: 'prisme-piano-velours', name: 'Piano électrique velours', category: 'Pianos électriques', params: { algo: '5', retour: 0.1, velocite: 0.8, ...op(1, 1, 0.9), ...env(1, 2, 2500, 0.2, 500), ...op(2, 1, 0.35), ...env(2, 1, 900, 0.1, 400), ...op(3, 1, 0.5, 2), ...env(3, 2, 2000, 0.2, 500), ...op(4, 14, 0.2), ...env(4, 1, 200, 0, 150) } },
  { id: 'prisme-piano-brillant', name: 'Piano électrique brillant', category: 'Pianos électriques', params: { algo: '5', retour: 0.2, velocite: 0.9, ...op(1, 1, 0.9), ...env(1, 1, 2000, 0.15, 450), ...op(2, 14, 0.35), ...env(2, 1, 300, 0, 200), ...op(3, 1, 0.6, -3), ...env(3, 1, 1800, 0.2, 450), ...op(4, 1, 0.55), ...env(4, 1, 1200, 0.1, 400) } },
  { id: 'prisme-orgue-fm', name: 'Orgue de poche', category: 'Pianos électriques', params: { algo: '8', retour: 0.3, velocite: 0.2, ...op(1, 1, 0.8), ...env(1, 5, 100, 1, 60), ...op(2, 2, 0.5), ...env(2, 5, 100, 1, 60), ...op(3, 3, 0.35), ...env(3, 5, 100, 1, 60), ...op(4, 4, 0.25), ...env(4, 5, 100, 1, 60) } },
  { id: 'prisme-marimba', name: 'Marimba', category: 'Pianos électriques', params: { algo: '5', retour: 0, ...op(1, 1, 0.9), ...env(1, 1, 600, 0, 400), ...op(2, 4, 0.4), ...env(2, 1, 80, 0, 60), ...op(3, 1, 0.4), ...env(3, 1, 500, 0, 300), ...op(4, 10, 0.2), ...env(4, 1, 50, 0, 40) } },
  // Basses FM
  { id: 'prisme-basse-fm', name: 'Basse FM', category: 'Basses FM', params: { algo: '1', retour: 0.3, ...op(1, 0.5, 0.95), ...env(1, 1, 800, 0.6, 120), ...op(2, 1, 0.5), ...env(2, 1, 300, 0.2, 100), ...op(3, 1, 0.3), ...env(3, 1, 200, 0, 100), ...op(4, 2, 0.2), ...env(4, 1, 150, 0, 80) } },
  { id: 'prisme-basse-claquee', name: 'Basse claquée', category: 'Basses FM', params: { algo: '3', retour: 0.5, velocite: 0.9, ...op(1, 0.5, 0.95), ...env(1, 1, 600, 0.5, 100), ...op(2, 1, 0.6), ...env(2, 1, 120, 0, 80), ...op(3, 3, 0.4), ...env(3, 1, 60, 0, 50), ...op(4, 1, 0.3), ...env(4, 1, 400, 0.2, 100) } },
  { id: 'prisme-basse-metal', name: 'Basse métallique', category: 'Basses FM', params: { algo: '2', retour: 0.6, ...op(1, 0.5, 0.9), ...env(1, 1, 1000, 0.5, 150), ...op(2, 1.5, 0.45), ...env(2, 1, 500, 0.2, 150), ...op(3, 2.5, 0.3), ...op(4, 3.5, 0.25), ...env(4, 1, 300, 0.1, 120) } },
  { id: 'prisme-basse-bois', name: 'Contrebasse boisée', category: 'Basses FM', params: { algo: '4', retour: 0.1, ...op(1, 0.5, 0.95), ...env(1, 5, 1200, 0.3, 200), ...op(2, 1, 0.3), ...env(2, 3, 400, 0.1, 150), ...op(3, 2, 0.15), ...op(4, 0.5, 0.2), ...env(4, 1, 200, 0, 100) } },
];
