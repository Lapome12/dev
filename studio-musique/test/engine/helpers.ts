// Projet de test minimal pour les tests du moteur (indépendant de defaults.ts).
import type { Channel, Note, Project } from '../../src/project/types';

let n = 0;
export const uid = (): string => `id-${++n}`;

export function channel(id: string, extra: Partial<Channel> = {}): Channel {
  return {
    id, name: id, color: '#3DDCB1', instrument: { type: 'trio', params: {} }, rootPitch: 60,
    mixerTrack: 0, volume: 0.8, pan: 0, mute: false, solo: false, ...extra,
  };
}

export function note(tick: number, pitch = 60, length = 24, velocity = 0.8): Note {
  return { id: uid(), tick, length, pitch, velocity };
}

export function project(extra: Partial<Project> = {}): Project {
  return {
    format: 'frequence', version: 1, name: 'Test', bpm: 120, swing: 0, masterPitch: 0,
    channels: [channel('a')],
    patterns: [{ id: 'p1', name: 'Motif 1', color: '#3DDCB1', lengthTicks: 384, notes: { a: [note(0), note(96), note(192), note(288)] } }],
    arrangement: { tracks: [{ id: 't1', name: 'Piste 1', color: '#fff', mute: false, height: 48 }], clips: [], loop: null },
    mixer: Array.from({ length: 13 }, (_, i) => ({
      index: i, name: i === 0 ? 'Maître' : `Tranche ${i}`, color: '#fff', volume: 1, pan: 0, mute: false, solo: false, effects: [],
    })),
    samples: [],
    ...extra,
  };
}
