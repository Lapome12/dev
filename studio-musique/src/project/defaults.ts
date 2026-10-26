// Projet neuf, canaux et effets neufs (§D.4, étape 1.4).
import { newId } from './ids';
import { defaultParams } from './plugin-params';
import { findPreset } from './presets';
import type { Channel, EffectSlot, EffectType, InstrumentType, MixerTrack, Note, Pattern, Project } from './types';

// 12 couleurs de canaux, choisies dans l'ordre à la création (les mêmes que tokens.css de Dev 2).
export const CHANNEL_COLORS = [
  '#5FB4F5', '#F27E9B', '#F5C46B', '#7ED67F', '#B28BF5', '#F59E6B',
  '#5ED6D6', '#E58BE0', '#C3D66B', '#8B9DF5', '#F5876B', '#6BD6A8',
] as const;
export const colorAt = (i: number): string => CHANNEL_COLORS[((i % 12) + 12) % 12]!;

export const MIXER_TRACKS = 13;               // maître + 12
export const MAX_EFFECTS = 8;
export const DEFAULT_PATTERN_TICKS = 1536;    // 4 mesures
export const STEP_TICKS = 24;                 // double-croche

// Hauteurs des voix de Frappe, façon General MIDI (contrat validé, PLAN.md avant §D.3).
export const DRUM = { grosseCaisse: 36, rimshot: 37, caisseClaire: 38, clap: 39, tomGrave: 41, charleyFerme: 42, tomMedium: 45, charleyOuvert: 46, percu: 47, crash: 49, ride: 51, cloche: 56 } as const;

const NAMES: Record<InstrumentType, string> = { trio: 'Trio', prisme: 'Prisme', frappe: 'Frappe', corde: 'Corde', echantillon: 'Échantillon', acide: 'Acide', accord: 'Accord' };

function presetParams(type: InstrumentType | EffectType, presetId?: string) {
  const params = defaultParams(type);
  if (presetId) {
    const preset = findPreset(presetId);
    if (!preset || preset.type !== type) throw new Error(`Preset inconnu pour ${type} : ${presetId}`);
    Object.assign(params, structuredClone(preset.params));
  }
  return params;
}

export function newChannel(type: InstrumentType, presetId?: string): Channel {
  const preset = presetId ? findPreset(presetId) : undefined;
  return {
    id: newId(),
    name: preset?.name ?? NAMES[type],
    color: colorAt(0),
    instrument: { type, params: presetParams(type, presetId) },
    rootPitch: 60,
    mixerTrack: 0,
    volume: 0.8, pan: 0,
    mute: false, solo: false,
  };
}

export function newEffect(type: EffectType, presetId?: string): EffectSlot {
  return { id: newId(), type, bypass: false, mix: 1, params: presetParams(type, presetId) };
}

export function newPattern(name: string, color = colorAt(0)): Pattern {
  return { id: newId(), name, color, lengthTicks: DEFAULT_PATTERN_TICKS, notes: {} };
}

export function newMixerTrack(index: number): MixerTrack {
  return {
    index, name: index === 0 ? 'Maître' : `Tranche ${index}`, color: index === 0 ? '#E7EAF0' : colorAt(index - 1),
    volume: 1, pan: 0, mute: false, solo: false, effects: [],
  };
}

/** Une note de pas : 24 ticks à la hauteur de base du canal. */
export function stepNote(step: number, pitch: number, velocity = 0.8): Note {
  return { id: newId(), tick: step * STEP_TICKS, length: STEP_TICKS, pitch, velocity };
}

export function newProject(): Project {
  const kick = { ...newChannel('frappe'), name: 'Grosse caisse', rootPitch: DRUM.grosseCaisse };
  const snare = { ...newChannel('frappe'), name: 'Caisse claire', rootPitch: DRUM.caisseClaire };
  const hat = { ...newChannel('frappe'), name: 'Charley', rootPitch: DRUM.charleyFerme };
  const synth = newChannel('trio');
  const channels = [kick, snare, hat, synth].map((c, i) => ({ ...c, color: colorAt(i), mixerTrack: i + 1 }));
  const pattern = newPattern('Pattern 1');
  for (const c of channels) pattern.notes[c.id] = [];
  return {
    format: 'frequence', version: 1,
    name: 'Sans titre', bpm: 130, swing: 0, masterPitch: 0,
    channels,
    patterns: [pattern],
    arrangement: {
      tracks: Array.from({ length: 8 }, (_, i) => ({ id: newId(), name: `Piste ${i + 1}`, color: colorAt(i), mute: false, height: 48 })),
      clips: [],
      loop: null,
    },
    mixer: Array.from({ length: MIXER_TRACKS }, (_, i) => {
      const t = newMixerTrack(i);
      const c = channels[i - 1];
      return c ? { ...t, name: c.name, color: c.color } : t;
    }),
    samples: [],
  };
}
