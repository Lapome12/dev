import { describe, expect, it } from 'vitest';
import { newProject, stepNote } from '../../src/project/defaults';
import { FrequenceError } from '../../src/project/errors';
import { exportMidi, flattenNotes, importMidi } from '../../src/project/midi-file';

const buf = (bytes: number[]) => new Uint8Array(bytes).buffer;
const chunk = (tag: string, body: number[]) => [...[...tag].map(c => c.charCodeAt(0)), body.length >>> 24, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255, ...body];

// Fichier écrit à la main : type 0, division 480, tempo 100 BPM (600 000 µs), statut courant,
// note on à vélocité nulle comme note off, un sysex, une note batterie sur le canal 10, une note jamais terminée.
const TYPE0 = [
  ...chunk('MThd', [0, 0, 0, 1, 0x01, 0xe0]),
  ...chunk('MTrk', [
    0x00, 0xff, 0x03, 0x05, ...[...'Piano'].map(c => c.charCodeAt(0)),
    0x00, 0xff, 0x51, 0x03, 0x09, 0x27, 0xc0,
    0x00, 0xf0, 0x03, 0x7e, 0x00, 0xf7,
    0x00, 0x90, 60, 100,
    0x00, 64, 127,                                // statut courant : note on 64
    0x83, 0x60, 60, 0,                             // +480 : note on vélocité 0 = fin du do
    0x00, 0x80, 64, 0,
    0x00, 0x99, 36, 90,                            // canal 10
    0x81, 0x70, 0x89, 36, 0,                       // +240
    0x00, 0xc0, 5,                                 // changement de programme (1 octet de données)
    0x00, 0x90, 67, 50,                            // jamais terminée
    0x83, 0x60, 0xff, 0x2f, 0x00,                  // +480 fin de piste
  ]),
];

describe('import MIDI', () => {
  it('lit un fichier de type 0 construit à la main', () => {
    const r = importMidi(buf(TYPE0));
    expect(r.bpm).toBe(100);
    expect(r.channels.map(c => [c.name, c.instrument.type])).toEqual([['Piano (canal 1)', 'trio'], ['Piano (canal 10)', 'frappe']]);
    const [piano, batterie] = r.channels.map(c => r.pattern.notes[c.id]!);
    expect(piano!.map(n => [n.tick, n.length, n.pitch, Math.round(n.velocity * 127)])).toEqual([
      [0, 96, 60, 100], [0, 96, 64, 127], [144, 96, 67, 50],
    ]);
    expect(batterie!.map(n => [n.tick, n.length, n.pitch])).toEqual([[96, 48, 36]]);
    expect(r.pattern.lengthTicks).toBe(1536);
  });

  it('refuse proprement les fichiers abîmés', () => {
    const cas = [
      [1, 2, 3],
      [...chunk('RIFF', [0, 0, 0, 1, 0, 96])],
      TYPE0.slice(0, TYPE0.length - 10),
      [...chunk('MThd', [0, 2, 0, 1, 0, 96]), ...chunk('MTrk', [0, 0xff, 0x2f, 0])],
      [...chunk('MThd', [0, 0, 0, 1, 0xe7, 0x28]), ...chunk('MTrk', [0, 0xff, 0x2f, 0])],
      [...chunk('MThd', [0, 0, 0, 1, 0, 96]), ...chunk('MTrk', [0, 0xff, 0x2f, 0])],
      [...chunk('MThd', [0, 0, 0, 1, 0, 96]), ...chunk('MTrk', [0, 60, 100])],
    ];
    for (const c of cas) expect(() => importMidi(buf(c))).toThrow(FrequenceError);
  });
});

describe('export MIDI', () => {
  it('aller-retour : type 1, tempo, une piste par canal, vélocités', () => {
    const p = newProject();
    p.bpm = 124;
    const [kick, , , synth] = p.channels;
    const pat = p.patterns[0]!;
    pat.notes[kick!.id] = [0, 4, 8, 12].map(s => stepNote(s, kick!.rootPitch, 1));
    pat.notes[synth!.id] = [{ id: 'a', tick: 0, length: 192, pitch: 60, velocity: 0.5 }, { id: 'b', tick: 192, length: 96, pitch: 67, velocity: 0.25 }];
    const bytes = exportMidi(p);
    const head = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    expect(head.getUint16(8)).toBe(1);
    expect(head.getUint16(10)).toBe(5);              // tempo + 4 canaux
    expect(head.getUint16(12)).toBe(96);
    const r = importMidi(bytes.buffer as ArrayBuffer);
    expect(r.bpm).toBe(124);
    expect(r.channels.map(c => c.name)).toEqual(['Grosse caisse', 'Trio']);
    expect(r.channels[0]!.instrument.type).toBe('frappe');
    const notes = r.pattern.notes[r.channels[1]!.id]!;
    expect(notes.map(n => [n.tick, n.length, n.pitch, Math.round(n.velocity * 127)])).toEqual([[0, 192, 60, 64], [192, 96, 67, 32]]);
    expect(r.pattern.notes[r.channels[0]!.id]!.map(n => n.tick)).toEqual([0, 96, 192, 288]);
  });

  it('batterie : les 12 voix de Frappe font l’aller-retour, les sons GM voisins sont rapprochés, l’accent passe par la vélocité', () => {
    const p = newProject();
    const kick = p.channels[0]!;
    const voix = [36, 37, 38, 39, 41, 42, 45, 46, 47, 49, 51, 56];
    p.patterns[0]!.notes[kick.id] = voix.map((pitch, i) => ({ id: `v${i}`, tick: i * 24, length: 24, pitch, velocity: i % 2 ? 0.5 : 1 }));
    const r = importMidi(exportMidi(p).buffer as ArrayBuffer);
    const relues = r.pattern.notes[r.channels[0]!.id]!;
    expect(relues.map(n => n.pitch)).toEqual(voix);
    expect(relues.map(n => n.velocity >= 0.8)).toEqual(voix.map((_, i) => i % 2 === 0));   // accents

    // Un fichier GM venu d'ailleurs : grosse caisse 35, pédale 44, conga 63, ride 2 (59), crash 2 (57).
    const gm = [35, 44, 63, 59, 57];
    const p2 = newProject();
    p2.patterns[0]!.notes[p2.channels[0]!.id] = gm.map((pitch, i) => ({ id: `g${i}`, tick: i * 24, length: 24, pitch, velocity: 0.9 }));
    const r2 = importMidi(exportMidi(p2).buffer as ArrayBuffer);
    expect(r2.pattern.notes[r2.channels[0]!.id]!.map(n => n.pitch)).toEqual([36, 42, 47, 51, 49]);
  });

  it('aplatit l’arrangement : répétition, décalage, coupure en fin de clip, piste muette', () => {
    const p = newProject();
    const pat = p.patterns[0]!;
    pat.lengthTicks = 384;
    const ch = p.channels[3]!;
    pat.notes[ch.id] = [{ id: 'a', tick: 0, length: 96, pitch: 60, velocity: 1 }, { id: 'b', tick: 288, length: 192, pitch: 62, velocity: 1 }];
    const [t1, t2] = p.arrangement.tracks;
    p.arrangement.clips = [
      { id: 'c1', trackId: t1!.id, patternId: pat.id, start: 0, length: 800, offset: 0 },
      { id: 'c2', trackId: t2!.id, patternId: pat.id, start: 2000, length: 384, offset: 0 },
    ];
    t2!.mute = true;
    const flat = flattenNotes(p).get(ch.id)!;
    expect(flat.map(n => [n.tick, n.length, n.pitch])).toEqual([[0, 96, 60], [288, 192, 62], [384, 96, 60], [672, 128, 62], [768, 32, 60]]);
    const seul = flattenNotes(p, pat.id).get(ch.id)!;
    expect(seul).toHaveLength(2);
    const offset = { ...p, arrangement: { ...p.arrangement, clips: [{ id: 'c3', trackId: t1!.id, patternId: pat.id, start: 1000, length: 200, offset: 288 }] } };
    expect(flattenNotes(offset).get(ch.id)!.map(n => [n.tick, n.length])).toEqual([[1000, 192], [1096, 96]]);
  });
});
