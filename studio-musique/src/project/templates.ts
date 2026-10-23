// Modèles de projet (étape 3.4) : points de départ proposés par « Nouveau depuis un modèle ».
import { DRUM, newProject } from './defaults';
import { buildSong, masterChain, everyBar, notes, perBar, type NoteSpec, type Song } from './song-builder';

// Gain d'entrée du limiteur du maître par modèle : crête -1 dBFS, environ -14 dB RMS.
const GAIN = { hiphop: 5.5, house: 2.5, lofi: 7.5 };

export interface Template { id: string; name: string; description: string; create(): Song }

// --- Beat hip-hop 90 BPM : kit Boom-bap, swing marqué, basse ronde et piano électrique.
const HIPHOP_CHORDS = [
  { bass: 38, tones: [57, 60, 65] }, { bass: 38, tones: [57, 60, 65] },
  { bass: 34, tones: [58, 62, 65] }, { bass: 36, tones: [55, 60, 64] },
];
function hiphop(): Song {
  const kick = () => everyBar([[0, 1], [7, 0.7], [10, 0.9]], DRUM.grosseCaisse);
  const kickVar = () => [...everyBar([[0, 1], [7, 0.7], [10, 0.9]], DRUM.grosseCaisse, 3), ...notes([[0, 1, DRUM.grosseCaisse, 1], [3, 1, DRUM.grosseCaisse, 0.6], [10, 1, DRUM.grosseCaisse, 0.9], [11, 1, DRUM.grosseCaisse, 0.7]], 3)];
  const snare = () => everyBar([[4, 0.95], [12, 1]], DRUM.caisseClaire);
  const hats = () => everyBar([0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, s % 4 ? 0.45 : 0.7]), DRUM.charleyFerme);
  const bass = () => perBar(HIPHOP_CHORDS, c => [[0, 6, c.bass, 0.9], [7, 2, c.bass, 0.6], [10, 4, c.bass + 12, 0.75]]);
  const keys = () => perBar(HIPHOP_CHORDS, c => c.tones.map(p => [0, 7, p, 0.55] as NoteSpec).concat(c.tones.map(p => [10, 5, p, 0.45] as NoteSpec)));
  return buildSong({
    name: 'Beat hip-hop', bpm: 90, swing: 0.35,
    channels: [
      { key: 'kick', name: 'Grosse caisse', type: 'frappe', preset: 'frappe-kit-boombap', rootPitch: DRUM.grosseCaisse, volume: 1 },
      { key: 'snare', name: 'Caisse claire', type: 'frappe', preset: 'frappe-kit-boombap', rootPitch: DRUM.caisseClaire, volume: 0.85, effects: [['reverbe', 0.15]] },
      { key: 'hats', name: 'Charley', type: 'frappe', preset: 'frappe-kit-boombap', rootPitch: DRUM.charleyFerme, volume: 0.55 },
      { key: 'bass', name: 'Basse', type: 'trio', preset: 'trio-basse-ronde', rootPitch: 38, volume: 0.85 },
      { key: 'keys', name: 'Piano électrique', type: 'prisme', preset: 'prisme-piano-velours', volume: 0.55, effects: [['chorus', 0.3], ['reverbe', 0.25]] },
    ],
    patterns: [
      { name: 'Beat', parts: { kick, snare, hats, bass, keys } },
      { name: 'Variation', parts: { kick: kickVar, snare, hats, bass, keys } },
    ],
    clips: [[0, 'Beat', 0], [0, 'Variation', 4]],
    master: masterChain(GAIN.hiphop),
  });
}

// --- House 124 BPM : kit Club, grosse caisse à chaque temps, charley ouvert à contretemps, accords pompés.
const HOUSE_CHORDS = [
  { bass: 45, tones: [60, 64, 67] }, { bass: 45, tones: [60, 64, 67] },
  { bass: 41, tones: [60, 65, 69] }, { bass: 43, tones: [62, 67, 71] },
];
function house(): Song {
  const kick = () => everyBar([[0, 1], [4, 1], [8, 1], [12, 1]], DRUM.grosseCaisse);
  const clap = () => everyBar([[4, 0.9], [12, 0.9]], DRUM.clap);
  const open = () => everyBar([[2, 0.7], [6, 0.7], [10, 0.7], [14, 0.7]], DRUM.charleyOuvert);
  const closed = () => everyBar([...Array(16).keys()].filter(s => s % 2).map(s => [s, 0.35]), DRUM.charleyFerme);
  const bass = () => perBar(HOUSE_CHORDS, c => [[2, 2, c.bass, 0.9], [6, 2, c.bass, 0.85], [10, 2, c.bass, 0.9], [14, 2, c.bass + 12, 0.7]]);
  const stabs = () => perBar(HOUSE_CHORDS, c => [3, 6, 11].flatMap(s => c.tones.map(p => [s, 2, p, 0.7] as NoteSpec)));
  return buildSong({
    name: 'House', bpm: 124,
    channels: [
      { key: 'kick', name: 'Grosse caisse', type: 'frappe', preset: 'frappe-kit-club', rootPitch: DRUM.grosseCaisse, volume: 1 },
      { key: 'clap', name: 'Clap', type: 'frappe', preset: 'frappe-kit-club', rootPitch: DRUM.clap, volume: 0.75, effects: [['reverbe', 0.2]] },
      { key: 'open', name: 'Charley ouvert', type: 'frappe', preset: 'frappe-kit-club', rootPitch: DRUM.charleyOuvert, volume: 0.5, pan: 0.1 },
      { key: 'closed', name: 'Charley fermé', type: 'frappe', preset: 'frappe-kit-club', rootPitch: DRUM.charleyFerme, volume: 0.4, pan: -0.1 },
      { key: 'bass', name: 'Basse', type: 'trio', preset: 'trio-basse-carree', rootPitch: 45, volume: 0.8 },
      { key: 'stabs', name: 'Accords', type: 'trio', preset: 'trio-cuivre-stab', volume: 0.5, effects: [['pompe', 1], ['delai', 0.2], ['reverbe', 0.3]] },
    ],
    patterns: [
      { name: 'Groove', parts: { kick, clap, open, closed, bass } },
      { name: 'Groove + accords', parts: { kick, clap, open, closed, bass, stabs } },
    ],
    clips: [[0, 'Groove', 0], [0, 'Groove + accords', 4]],
    master: masterChain(GAIN.house),
  });
}

// --- Lo-fi 75 BPM : swing fort, accords jazz au piano électrique, basse pincée, souffle discret.
const LOFI_CHORDS = [
  { bass: 38, tones: [53, 57, 60, 64] }, { bass: 43, tones: [53, 57, 59, 64] },
  { bass: 36, tones: [52, 55, 59, 62] }, { bass: 45, tones: [55, 60, 64, 67] },
];
function lofi(): Song {
  const kick = () => everyBar([[0, 0.9], [9, 0.7], [10, 0.8]], DRUM.grosseCaisse);
  const snare = () => everyBar([[4, 0.7], [12, 0.75]], DRUM.rimshot);
  const hats = () => everyBar([0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, s % 4 ? 0.3 : 0.5]), DRUM.charleyFerme);
  const bass = () => perBar(LOFI_CHORDS, c => [[0, 5, c.bass, 0.8], [6, 2, c.bass + 7, 0.6], [10, 4, c.bass, 0.7]]);
  const keys = () => perBar(LOFI_CHORDS, c => c.tones.map((p, i) => [i, 14 - i, p, 0.5] as NoteSpec));
  const air = () => notes([[0, 64, 57, 0.3]]);
  return buildSong({
    name: 'Lo-fi', bpm: 75, swing: 0.45,
    channels: [
      { key: 'kick', name: 'Grosse caisse', type: 'frappe', preset: 'frappe-kit-boombap', rootPitch: DRUM.grosseCaisse, volume: 0.85 },
      { key: 'snare', name: 'Rimshot', type: 'frappe', preset: 'frappe-kit-boombap', rootPitch: DRUM.rimshot, volume: 0.7 },
      { key: 'hats', name: 'Charley', type: 'frappe', preset: 'frappe-kit-boombap', rootPitch: DRUM.charleyFerme, volume: 0.4 },
      { key: 'bass', name: 'Basse', type: 'corde', preset: 'corde-basse-pincee', rootPitch: 38, volume: 0.8 },
      { key: 'keys', name: 'Piano électrique', type: 'prisme', preset: 'prisme-piano-velours', volume: 0.55, effects: [['chorus', 0.4], ['bitcrusher', 0.2], ['reverbe', 0.35]] },
      { key: 'air', name: 'Souffle', type: 'trio', preset: 'trio-texture-vent', volume: 0.2 },
    ],
    patterns: [{ name: 'Boucle', parts: { kick, snare, hats, bass, keys, air } }],
    clips: [[0, 'Boucle', 0, 8]],
    master: masterChain(GAIN.lofi, [['filtre', 1, { type: 'lowpass', frequence: 7000, resonance: 0.7, pente: '12', lfoquantite: 0 }]]),
  });
}

export const TEMPLATES: Template[] = [
  { id: 'vide', name: 'Vide', description: 'Un kit de batterie et un synthé, prêts à remplir.', create: () => ({ project: newProject(), samples: new Map() }) },
  { id: 'hiphop-90', name: 'Beat hip-hop 90 BPM', description: 'Kit Boom-bap, swing marqué, basse ronde et piano électrique.', create: hiphop },
  { id: 'house-124', name: 'House 124 BPM', description: 'Grosse caisse à chaque temps, charley ouvert à contretemps, accords pompés.', create: house },
  { id: 'lofi-75', name: 'Lo-fi 75 BPM', description: 'Accords jazz feutrés, basse pincée, souffle discret.', create: lofi },
];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find(t => t.id === id);
}
