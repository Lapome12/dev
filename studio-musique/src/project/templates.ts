// Modèles de projet (étape 3.4) : points de départ proposés par « Nouveau depuis un modèle ».
import { DRUM, newProject } from './defaults';
import { findPreset } from './presets';
import type { EffectType, ParamValue } from './types';
import { buildSong, masterChain, everyBar, notes, perBar, type NoteSpec, type Song } from './song-builder';

// Gain d'entrée du limiteur du maître par modèle : crête -1 dBFS, environ -14 dB RMS.
const GAIN = { hiphop: 5.5, house: 2.5, lofi: 7.5, techno: 3 };

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

// Réglages d'un preset d'effet, pour la chaîne d'une tranche : [type, mix, réglages].
function fx(presetId: string, mix = 1, extra: Record<string, ParamValue> = {}): [EffectType, number, Record<string, ParamValue>] {
  const p = findPreset(presetId);
  if (!p) throw new Error(`Preset d'effet inconnu : ${presetId}`);
  return [p.type as EffectType, mix, { ...p.params, ...extra }];
}

// --- House 124 BPM : kit Club, stabs d'Accord pompés par le sidechain, percu, pont au piano.
// Une note d'Accord joue tout l'accord : on n'écrit que la fondamentale.
const HOUSE_ROOTS = [57, 57, 53, 55];
function house(): Song {
  const kick = () => everyBar([[0, 1], [4, 1], [8, 1], [12, 1]], DRUM.grosseCaisse);
  const clap = () => everyBar([[4, 0.9], [12, 0.9]], DRUM.clap);
  const open = () => everyBar([[2, 0.7], [6, 0.7], [10, 0.7], [14, 0.7]], DRUM.charleyOuvert);
  const closed = () => everyBar([...Array(16).keys()].filter(s => s % 2).map(s => [s, 0.35]), DRUM.charleyFerme);
  const percu = () => everyBar([[3, 0.6], [7, 0.45], [11, 0.6], [14, 0.5]], DRUM.percu);
  const bass = () => perBar(HOUSE_ROOTS, r => [[2, 2, r - 12, 0.9], [6, 2, r - 12, 0.85], [10, 2, r - 12, 0.9], [14, 2, r, 0.7]]);
  const stabs = () => perBar(HOUSE_ROOTS, r => [[3, 2, r, 0.8], [6, 2, r, 0.7], [11, 2, r, 0.8]]);
  const piano = () => perBar(HOUSE_ROOTS, r => [[0, 3, r + 12, 0.75], [3, 3, r + 12, 0.6], [8, 3, r + 12, 0.7], [11, 5, r + 12, 0.6]]);
  return buildSong({
    name: 'House', bpm: 124,
    channels: [
      { key: 'kick', name: 'Grosse caisse', type: 'frappe', preset: 'frappe-kit-club', rootPitch: DRUM.grosseCaisse, volume: 1 },
      { key: 'clap', name: 'Clap', type: 'frappe', preset: 'frappe-kit-club', rootPitch: DRUM.clap, volume: 0.7, effects: [['reverbe', 0.2]] },
      { key: 'open', name: 'Charley ouvert', type: 'frappe', preset: 'frappe-kit-club', rootPitch: DRUM.charleyOuvert, volume: 0.45, pan: 0.1 },
      { key: 'closed', name: 'Charley fermé', type: 'frappe', preset: 'frappe-kit-club', rootPitch: DRUM.charleyFerme, volume: 0.4, pan: -0.1 },
      { key: 'percu', name: 'Percu', type: 'frappe', preset: 'frappe-kit-garage', rootPitch: DRUM.percu, volume: 0.45, pan: 0.25 },
      { key: 'bass', name: 'Basse', type: 'trio', preset: 'trio-basse-carree', rootPitch: 45, volume: 0.75, effects: [fx('sidechain-discret')] },
      { key: 'stabs', name: 'Stabs', type: 'accord', preset: 'accord-stab-house', rootPitch: 57, volume: 0.55, effects: [fx('sidechain-classique'), ['delai', 0.2], ['reverbe', 0.3]] },
      { key: 'piano', name: 'Piano', type: 'accord', preset: 'accord-piano-house', rootPitch: 69, volume: 0.85, pan: -0.15, effects: [fx('sidechain-discret'), ['reverbe', 0.3]] },
    ],
    patterns: [
      { name: 'Intro', parts: { kick, closed, percu } },
      { name: 'Groove', parts: { kick, clap, open, closed, percu, bass } },
      { name: 'Stabs', parts: { kick, clap, open, closed, percu, bass, stabs } },
      { name: 'Pont', parts: { closed, percu, piano, stabs } },
      { name: 'Final', parts: { kick, clap, open, closed, percu, bass, stabs, piano } },
    ],
    clips: [[0, 'Intro', 0, 8], [0, 'Groove', 8, 8], [0, 'Stabs', 16, 8], [0, 'Pont', 24, 4], [0, 'Final', 28, 8]],
    master: masterChain(GAIN.house),
  });
}

// --- Techno 132 BPM : kit Entrepôt, grosse caisse roulante (grondement de réverbe pompé par le
// sidechain), ligne d'Acide, charley ouvert, ride, nappe hachée par la Porte.
const ACIDE_LIGNE: NoteSpec[] = [
  [0, 1, 33, 0.9], [2, 1, 45, 0.6], [3, 2, 33, 0.7], [5, 1, 36, 0.9], [6, 1, 45, 0.6], [8, 1, 33, 0.85],
  [10, 2, 43, 0.6], [11, 1, 45, 0.9], [12, 1, 33, 0.6], [14, 1, 48, 0.9], [15, 1, 45, 0.6],
];
function techno(): Song {
  const kick = () => everyBar([[0, 1], [4, 1], [8, 1], [12, 1]], DRUM.grosseCaisse);
  // Le grondement rejoue la grosse caisse entre les temps : la réverbe sombre et le sidechain font le reste.
  const rumble = () => everyBar([[0, 0.9], [2, 0.6], [3, 0.5], [4, 0.9], [6, 0.6], [7, 0.5], [8, 0.9], [10, 0.6], [11, 0.5], [12, 0.9], [14, 0.6], [15, 0.5]], DRUM.grosseCaisse);
  const open = () => everyBar([[2, 0.75], [6, 0.75], [10, 0.75], [14, 0.75]], DRUM.charleyOuvert);
  const closed = () => everyBar([...Array(16).keys()].map(s => [s, s % 2 ? 0.3 : 0.45]), DRUM.charleyFerme);
  const ride = () => everyBar([0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, s % 4 ? 0.55 : 0.4]), DRUM.ride);
  const clap = () => everyBar([[4, 0.8], [12, 0.8]], DRUM.clap);
  const percu = () => everyBar([[3, 0.5], [9, 0.6], [13, 0.45]], DRUM.percu);
  const acide = () => [0, 1, 2, 3].flatMap(b => notes(ACIDE_LIGNE.map(([s, l, p, v]) => [s, l, b === 3 && s === 14 ? p + 3 : p, v] as NoteSpec), b));
  const pad = () => notes([[0, 32, 57, 0.6], [32, 32, 53, 0.6]]);
  return buildSong({
    name: 'Techno', bpm: 132,
    channels: [
      { key: 'kick', name: 'Grosse caisse', type: 'frappe', preset: 'frappe-kit-entrepot', rootPitch: DRUM.grosseCaisse, volume: 0.45 },
      { key: 'rumble', name: 'Grondement', type: 'frappe', preset: 'frappe-kit-entrepot', rootPitch: DRUM.grosseCaisse, volume: 0.3, effects: [
        fx('reverbe-grondement'), ['filtre', 1, { type: 'lowpass', frequence: 160, resonance: 1, pente: '24', lfoquantite: 0 }], fx('sidechain-extreme'),
      ] },
      { key: 'open', name: 'Charley ouvert', type: 'frappe', preset: 'frappe-kit-entrepot', rootPitch: DRUM.charleyOuvert, volume: 0.45, pan: 0.1 },
      { key: 'closed', name: 'Charley fermé', type: 'frappe', preset: 'frappe-kit-entrepot', rootPitch: DRUM.charleyFerme, volume: 0.35, pan: -0.15 },
      { key: 'ride', name: 'Ride', type: 'frappe', preset: 'frappe-kit-entrepot', rootPitch: DRUM.ride, volume: 0.35, pan: 0.2 },
      { key: 'clap', name: 'Clap', type: 'frappe', preset: 'frappe-kit-entrepot', rootPitch: DRUM.clap, volume: 0.6, effects: [['reverbe', 0.25]] },
      { key: 'percu', name: 'Percu', type: 'frappe', preset: 'frappe-kit-entrepot', rootPitch: DRUM.percu, volume: 0.4, pan: -0.3, effects: [['delai', 0.25]] },
      { key: 'acide', name: 'Acide', type: 'acide', preset: 'acide-couineur', rootPitch: 33, volume: 0.5, effects: [fx('sidechain-discret'), ['delai', 0.15]] },
      { key: 'pad', name: 'Nappe', type: 'accord', preset: 'accord-nappe-sombre', rootPitch: 57, volume: 0.9, params: { volume: 1 }, effects: [fx('porte-trance'), fx('sidechain-classique'), ['reverbe', 0.35]] },
    ],
    patterns: [
      { name: 'Intro', parts: { kick, rumble, closed } },
      { name: 'Groove', parts: { kick, rumble, open, closed, ride, clap, percu } },
      { name: 'Acide', parts: { kick, rumble, open, closed, ride, clap, percu, acide } },
      { name: 'Pause', parts: { closed, ride, acide, pad } },
      { name: 'Final', parts: { kick, rumble, open, closed, ride, clap, percu, acide, pad } },
    ],
    clips: [[0, 'Intro', 0, 8], [0, 'Groove', 8, 8], [0, 'Acide', 16, 8], [0, 'Pause', 24, 4], [0, 'Final', 28, 8]],
    master: masterChain(GAIN.techno),
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
  { id: 'house-124', name: 'House 124 BPM', description: 'Stabs d’accords pompés par le sidechain, charley ouvert à contretemps, percu, pont au piano.', create: house },
  { id: 'techno-132', name: 'Techno 132 BPM', description: 'Grosse caisse roulante et son grondement, ligne d’Acide, ride, nappe hachée par la Porte.', create: techno },
  { id: 'lofi-75', name: 'Lo-fi 75 BPM', description: 'Accords jazz feutrés, basse pincée, souffle discret.', create: lofi },
];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find(t => t.id === id);
}
