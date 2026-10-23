// Morceau de démo « Premier jet » (étape 3.4) : la mineur, 124 BPM, 32 mesures (environ 1 min),
// 8 canaux, 6 patterns, les 5 instruments, intro / couplet / refrain / pont / refrain / fin.
// Tout est écrit ici, note par note ; le son de texture est synthétisé (aucun fichier audio).
import { DRUM } from './defaults';
import { buildSong, masterChain, everyBar, notes, perBar, type NoteSpec, type Song } from './song-builder';
import type { Note } from './types';

const PAD_SAMPLE_ID = 'demo-souffle';
const DEMO_GAIN = 6;   // gain d'entrée du limiteur du maître : crête -1 dBFS, environ -14 dB RMS

// Les accords du morceau, une mesure chacun : la m, fa, do, sol.
const CHORDS = [
  { bass: 45, tones: [57, 60, 64] },
  { bass: 41, tones: [53, 57, 60] },
  { bass: 48, tones: [55, 60, 64] },
  { bass: 43, tones: [55, 59, 62] },
];

const perChord = (f: (c: (typeof CHORDS)[number], bar: number) => NoteSpec[]) => perBar(CHORDS, f);

// --- les parties

/** Même partie, plus douce ou plus forte : la structure respire (intro et fin calmes, refrain plein). */
const louder = (make: () => Note[], factor: number) => () => make().map(n => ({ ...n, velocity: Math.min(1, n.velocity * factor) }));

const kickCouplet = () => everyBar([[0, 1], [6, 0.7], [8, 0.95], [11, 0.6]], DRUM.grosseCaisse);
const kickRefrain = () => everyBar([[0, 1], [4, 0.95], [8, 1], [12, 0.95]], DRUM.grosseCaisse);
const snare = () => everyBar([[4, 0.9], [12, 0.95]], DRUM.caisseClaire);
const hatsCroches = () => everyBar([0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, s % 4 === 2 ? 0.75 : 0.5]), DRUM.charleyFerme);
const hatsRefrain = () => [...hatsDoubles(), ...everyBar([2, 6, 10, 14].map(s => [s, 0.6]), DRUM.charleyOuvert)];
const kickCrash = () => [...kickRefrain(), ...notes([[0, 8, DRUM.crash, 0.85]])];
const snareClap = () => [...snare(), ...everyBar([[4, 0.75], [12, 0.8]], DRUM.clap)];
const hatsDoubles = () => everyBar([...Array(16).keys()].map(s => [s, s % 4 === 2 ? 0.8 : s % 2 ? 0.35 : 0.55]), DRUM.charleyFerme);
const snareRoll = () => notes([[4, 1, DRUM.caisseClaire, 0.9], [12, 1, DRUM.caisseClaire, 0.9], [14, 1, DRUM.caisseClaire, 0.6], [15, 1, DRUM.caisseClaire, 0.75]], 3);

const bassCouplet = () => perChord(c => [[0, 3, c.bass, 0.9], [4, 2, c.bass], [6, 2, c.bass + 12, 0.7], [8, 3, c.bass, 0.85], [12, 2, c.bass], [14, 2, c.bass + 7, 0.7]]);
const bassRefrain = () => perChord(c => [[0, 2, c.bass, 0.95], [3, 1, c.bass, 0.6], [6, 2, c.bass + 12, 0.8], [8, 2, c.bass, 0.9], [11, 1, c.bass, 0.6], [12, 2, c.bass + 10, 0.75], [14, 2, c.bass + 12, 0.8]]);

const padChords = (velocity = 0.6) => perChord(c => c.tones.map(p => [0, 16, p, velocity] as NoteSpec));
const padFin = () => [...notes([[0, 32, 57, 0.6], [0, 32, 60, 0.6], [0, 32, 64, 0.6]]), ...notes([[0, 32, 53, 0.55], [0, 32, 57, 0.55], [0, 32, 60, 0.55], [0, 32, 64, 0.5]], 2)];

const arpUp = (octave = 12) => perChord(c => {
  const tones = [...c.tones, c.tones[0]! + 12].map(p => p + octave - 12);
  return [...Array(16).keys()].map(s => [s, 1, tones[s % 4]!, s % 4 === 0 ? 0.85 : 0.6] as NoteSpec);
});

// Mélodie du refrain, jouée par les cloches (mi, ré, do, ré… puis réponse).
const hook = () => notes([
  [0, 3, 76], [4, 2, 74], [6, 2, 72], [8, 6, 74, 0.7],
  [16, 3, 72], [20, 2, 69], [22, 2, 72], [24, 6, 77, 0.7],
  [32, 3, 76], [36, 2, 79], [38, 2, 76], [40, 6, 72, 0.7],
  [48, 3, 74], [52, 2, 71], [54, 2, 74], [56, 8, 69, 0.75],
]);
const bellsFin = () => notes([[0, 8, 76, 0.5], [8, 8, 72, 0.45], [16, 16, 69, 0.5], [32, 32, 81, 0.35]]);

const texturePont = () => notes([[0, 32, 57, 0.7], [32, 32, 60, 0.8]]);
const textureIntro = () => notes([[0, 64, 57, 0.5]]);

// --- son de texture : souffle filtré qui monte, synthétisé à la volée

/** WAV mono 16 bits de 4 s : bruit filtré qui s'ouvre puis se referme (graine fixe). */
export function synthBreathWav(sampleRate = 22050, seconds = 4): ArrayBuffer {
  const n = sampleRate * seconds;
  const data = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sampleRate, true); data.setUint32(28, sampleRate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true);
  str(36, 'data'); data.setUint32(40, n * 2, true);
  let seed = 0x2f6b1d3a, low = 0, band = 0;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = seed / 2 ** 31 - 1;
    const t = i / n;
    const env = Math.sin(Math.PI * t) ** 1.5;
    const cutoff = 0.02 + 0.25 * t * t;                   // le filtre s'ouvre
    low += cutoff * band; band += cutoff * (noise - low - 0.6 * band);   // filtre d'état passe-bande
    const tone = Math.sin(2 * Math.PI * 220 * i / sampleRate) * 0.15 * t;   // un la discret dans le souffle
    const v = Math.max(-1, Math.min(1, (band * 1.4 + tone) * env * 0.8));
    data.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return data.buffer;
}

// --- assemblage

/** « Premier jet » : intro 4 mesures, couplet 8, refrain 8, pont 4, refrain 4, fin 4 (32 mesures, ~62 s). */
export function demoSong(): Song {
  return buildSong({
    name: 'Premier jet', bpm: 124, swing: 0.08,
    channels: [
      { key: 'kick', name: 'Grosse caisse', type: 'frappe', preset: 'frappe-kit-club', rootPitch: DRUM.grosseCaisse, volume: 0.95, effects: [['compresseur', 1]] },
      { key: 'snare', name: 'Caisse claire', type: 'frappe', preset: 'frappe-kit-club', rootPitch: DRUM.caisseClaire, volume: 0.8, effects: [['reverbe', 0.18]] },
      { key: 'hats', name: 'Charley', type: 'frappe', preset: 'frappe-kit-club', rootPitch: DRUM.charleyFerme, volume: 0.55, pan: 0.15, effects: [['filtre', 1]] },
      { key: 'bass', name: 'Basse', type: 'trio', preset: 'trio-basse-funk', rootPitch: 45, volume: 0.8, effects: [['eq', 1], ['distorsion', 0.25], ['compresseur', 1]] },
      { key: 'pad', name: 'Nappe', type: 'trio', preset: 'trio-nappe-chaude', volume: 0.5, effects: [['chorus', 0.5], ['pompe', 1], ['reverbe', 0.4]] },
      { key: 'bells', name: 'Cloches', type: 'prisme', preset: 'prisme-cloche-claire', rootPitch: 72, volume: 0.55, pan: -0.2, effects: [['delai', 0.3], ['reverbe', 0.3]] },
      { key: 'arp', name: 'Arpège', type: 'corde', preset: 'corde-harpe', volume: 0.6, pan: 0.25, effects: [['filtre', 1], ['delai', 0.2]] },
      { key: 'texture', name: 'Souffle', type: 'echantillon', preset: 'echantillon-tenue', rootPitch: 57, volume: 0.45, params: { sample: PAD_SAMPLE_ID, racine: 57 }, effects: [['bitcrusher', 0.3], ['reverbe', 0.5]] },
    ],
    patterns: [
      { name: 'Intro', parts: { pad: () => padChords(0.3), texture: textureIntro } },
      { name: 'Rythme', parts: { kick: kickCouplet, snare, hats: hatsCroches } },
      { name: 'Couplet', parts: { bass: louder(bassCouplet, 0.85), pad: () => padChords(0.4), arp: louder(() => arpUp(0), 0.8) } },
      { name: 'Refrain', parts: { kick: kickCrash, snare: snareClap, hats: hatsRefrain, bass: louder(bassRefrain, 1.1), pad: () => padChords(0.75), bells: louder(hook, 1.2), arp: () => arpUp(12) } },
      { name: 'Pont', parts: { pad: () => padChords(0.5), texture: texturePont, hats: hatsCroches, snare: snareRoll } },
      { name: 'Fin', parts: { pad: louder(padFin, 0.5), bells: louder(bellsFin, 0.6) } },
    ],
    trackNames: ['Mélodie', 'Rythme'],
    clips: [
      [0, 'Intro', 0],
      [0, 'Couplet', 4, 8], [1, 'Rythme', 4, 8],          // un clip de 8 mesures répète le pattern de 4
      [0, 'Refrain', 12, 8],
      [0, 'Pont', 20],
      [0, 'Refrain', 24],
      [0, 'Fin', 28],
    ],
    master: masterChain(DEMO_GAIN, [['eq', 1]]),
    samples: [{ ref: { id: PAD_SAMPLE_ID, name: 'Souffle', durationSec: 4 }, data: synthBreathWav() }],
  });
}
