// Petit outil pour écrire des morceaux dans le code (démo et modèles de projet, étape 3.4).
import { STEP_TICKS, colorAt, newChannel, newEffect, newMixerTrack, newPattern } from './defaults';
import { newId } from './ids';
import { PPQ, type Channel, type EffectType, type Id, type InstrumentType, type Note, type ParamValue, type Project, type SampleRef } from './types';

export const BAR = PPQ * 4;
const S = STEP_TICKS;

/** [pas de départ, durée en pas, hauteur, vélocité], en doubles-croches depuis la mesure barOffset. */
export type NoteSpec = [step: number, steps: number, pitch: number, velocity?: number];

export function notes(specs: NoteSpec[], barOffset = 0): Note[] {
  return specs.map(([step, steps, pitch, velocity = 0.8]) => ({
    id: newId(), tick: barOffset * BAR + step * S, length: steps * S, pitch, velocity,
  }));
}

/** Répète une mesure de pas ([pas, vélocité]) sur plusieurs mesures. */
export function everyBar(steps: [number, number?][], pitch: number, bars = 4): Note[] {
  const out: Note[] = [];
  for (let b = 0; b < bars; b++) out.push(...notes(steps.map(([s, v]) => [s, 1, pitch, v ?? 0.85]), b));
  return out;
}

/** Une mesure par accord : f reçoit l'accord et rend ses notes dans la mesure. */
export function perBar<T>(chords: T[], f: (c: T, bar: number) => NoteSpec[]): Note[] {
  return chords.flatMap((c, bar) => notes(f(c, bar), bar));
}

/** Chaîne de maître commune : colle douce puis limiteur à -1 dBFS ; gain d'entrée réglé par morceau. */
export function masterChain(gain: number, before: [EffectType, number, Record<string, ParamValue>?][] = []): [EffectType, number, Record<string, ParamValue>?][] {
  return [
    ...before,
    ['compresseur', 1, { seuil: -14, ratio: 2, attaque: 30, relachement: 300, genou: 10, gain: 1 }],
    ['limiteur', 1, { gain, plafond: -1, relachement: 150 }],
  ];
}

export interface ChannelSpec {
  key: string; name: string; type: InstrumentType; preset?: string;
  rootPitch?: number; volume: number; pan?: number; params?: Record<string, ParamValue>;
  effects?: [EffectType, number, Record<string, ParamValue>?][];   // type, mix, réglages
}

export interface SongSpec {
  name: string; bpm: number; swing?: number;
  channels: ChannelSpec[];
  patterns: { name: string; bars?: number; parts: Partial<Record<string, () => Note[]>> }[];
  clips: [track: number, pattern: string, bar: number, bars?: number][];
  trackNames?: string[];
  master?: [EffectType, number, Record<string, ParamValue>?][];
  samples?: { ref: SampleRef; data: ArrayBuffer }[];
}

export interface Song { project: Project; samples: Map<Id, ArrayBuffer> }

export function buildSong(spec: SongSpec): Song {
  const byKey = new Map<string, Channel>();
  const channels = spec.channels.map((c, i) => {
    const ch = newChannel(c.type, c.preset);
    Object.assign(ch.instrument.params, c.params ?? {});
    Object.assign(ch, { name: c.name, color: colorAt(i), rootPitch: c.rootPitch ?? 60, volume: c.volume, pan: c.pan ?? 0, mixerTrack: i + 1 });
    byKey.set(c.key, ch);
    return ch;
  });

  const patterns = spec.patterns.map((p, i) => {
    const pat = newPattern(p.name, colorAt(i + 4));
    pat.lengthTicks = (p.bars ?? 4) * BAR;
    for (const c of channels) pat.notes[c.id] = [];
    for (const [key, make] of Object.entries(p.parts)) {
      const ch = byKey.get(key);
      if (!ch || !make) throw new Error(`Canal inconnu dans ${p.name} : ${key}`);
      pat.notes[ch.id] = make();
    }
    return pat;
  });

  const effect = ([type, mix, params]: [EffectType, number, Record<string, ParamValue>?]) => {
    const e = newEffect(type);
    e.mix = mix;
    Object.assign(e.params, params ?? {});
    return e;
  };
  const mixer = Array.from({ length: 13 }, (_, i) => newMixerTrack(i));
  spec.channels.forEach((c, i) => {
    const t = mixer[i + 1]!;
    t.name = c.name; t.color = colorAt(i);
    t.effects = (c.effects ?? []).map(effect);
  });
  mixer[0]!.effects = (spec.master ?? []).map(effect);

  const names = spec.trackNames ?? [];
  const tracks = Array.from({ length: 8 }, (_, i) => ({ id: newId(), name: names[i] ?? `Piste ${i + 1}`, color: colorAt(i), mute: false, height: 48 }));
  const clips = spec.clips.map(([track, name, bar, bars]) => {
    const pat = patterns.find(p => p.name === name);
    if (!pat) throw new Error(`Pattern inconnu : ${name}`);
    return { id: newId(), trackId: tracks[track]!.id, patternId: pat.id, start: bar * BAR, length: (bars ?? pat.lengthTicks / BAR) * BAR, offset: 0 };
  });

  const project: Project = {
    format: 'frequence', version: 1,
    name: spec.name, bpm: spec.bpm, swing: spec.swing ?? 0, masterPitch: 0,
    channels, patterns,
    arrangement: { tracks, clips, loop: null },
    mixer,
    samples: (spec.samples ?? []).map(s => s.ref),
  };
  return { project, samples: new Map((spec.samples ?? []).map(s => [s.ref.id, s.data])) };
}
