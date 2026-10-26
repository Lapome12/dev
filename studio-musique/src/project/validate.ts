// Validation stricte d'un projet venu de l'extérieur (fichier ouvert, sauvegarde automatique) (étape 2.7).
// Structure invalide → FrequenceError (message en français). Valeurs hors bornes → ramenées dans les bornes.
// Références cassées (note d'un canal inconnu, clip d'un pattern disparu) → retirées.
import { CHANNEL_COLORS, MAX_EFFECTS, MIXER_TRACKS, newMixerTrack } from './defaults';
import { FrequenceError } from './errors';
import { clampParam } from '../engine/params';
import { paramDefs } from './plugin-params';
import type {
  ArrangementTrack, Channel, Clip, EffectSlot, EffectType, Id, InstrumentType, MixerTrack, Note,
  ParamValue, Pattern, Project, SampleRef,
} from './types';

export const LIMITS = {
  channels: 256,
  patterns: 999,
  notesPerPattern: 100_000,
  tracks: 199,
  clips: 20_000,
  samples: 256,
  params: 256,
  text: 200,
  maxTick: 384 * 9999,                          // 9 999 mesures
  sampleSec: 120,
} as const;

export const INSTRUMENT_TYPES: readonly InstrumentType[] = ['trio', 'prisme', 'frappe', 'corde', 'echantillon', 'acide', 'accord'];
export const EFFECT_TYPES: readonly EffectType[] = [
  'eq', 'reverbe', 'delai', 'compresseur', 'distorsion', 'filtre', 'chorus', 'limiteur', 'pompe', 'bitcrusher',
  'sidechain', 'phaser', 'autofiltre', 'saturation', 'porte',
];
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

type Obj = Record<string, unknown>;

const fail = (where: string, what: string): never => { throw new FrequenceError(`Fichier invalide : ${where} ${what}.`); };

function obj(v: unknown, where: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(where, 'devrait être un objet');
  return v as Obj;
}

function arr(v: unknown, where: string, max: number): unknown[] {
  if (!Array.isArray(v)) fail(where, 'devrait être une liste');
  const a = v as unknown[];
  if (a.length > max) fail(where, `contient trop d'éléments (${a.length}, au plus ${max})`);
  return a;
}

function num(v: unknown, where: string, min: number, max: number, fallback?: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    if (fallback !== undefined) return fallback;
    return fail(where, 'devrait être un nombre');
  }
  return Math.min(max, Math.max(min, v));
}

const int = (v: unknown, where: string, min: number, max: number, fallback?: number) =>
  Math.round(num(v, where, min, max, fallback));

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function text(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v.slice(0, LIMITS.text) : fallback;
}

function id(v: unknown, where: string): Id {
  if (typeof v !== 'string' || v.length === 0 || v.length > 64 || FORBIDDEN_KEYS.has(v)) fail(where, 'a un identifiant invalide');
  return v as Id;
}

function color(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

function uniqueIds<T extends { id: Id }>(items: T[], where: string): T[] {
  const seen = new Set<Id>();
  for (const it of items) {
    if (seen.has(it.id)) fail(where, `contient deux fois l'identifiant ${it.id}`);
    seen.add(it.id);
  }
  return items;
}

/** Réglages d'un plugin : bornés par sa description (PluginDef) quand le moteur la fournit. */
function params(v: unknown, type: InstrumentType | EffectType, where: string): Record<string, ParamValue> {
  const raw = obj(v ?? {}, where);
  const keys = Object.keys(raw);
  if (keys.length > LIMITS.params) fail(where, 'contient trop de réglages');
  const out: Record<string, ParamValue> = {};
  const defs = paramDefs(type);
  if (defs) {
    for (const d of defs) {
      const x = clampParam(d, raw[d.id] as ParamValue | undefined);
      out[d.id] = typeof x === 'string' ? x.slice(0, LIMITS.text) : x;
    }
    return out;
  }
  for (const k of keys) {
    const x = raw[k];
    if (FORBIDDEN_KEYS.has(k) || k.length > 64) continue;
    if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
    else if (typeof x === 'boolean') out[k] = x;
    else if (typeof x === 'string') out[k] = x.slice(0, LIMITS.text);
  }
  return out;
}

function channel(v: unknown, i: number): Channel {
  const where = `canal ${i + 1}`;
  const c = obj(v, where);
  const inst = obj(c.instrument, `${where}, instrument,`);
  if (!INSTRUMENT_TYPES.includes(inst.type as InstrumentType)) fail(where, `a un instrument inconnu (${String(inst.type)})`);
  const type = inst.type as InstrumentType;
  return {
    id: id(c.id, where),
    name: text(c.name, `Canal ${i + 1}`),
    color: color(c.color, CHANNEL_COLORS[i % 12]!),
    instrument: { type, params: params(inst.params, type, `${where}, réglages,`) },
    rootPitch: int(c.rootPitch, `${where}, hauteur`, 0, 127, 60),
    mixerTrack: int(c.mixerTrack, `${where}, tranche`, 0, MIXER_TRACKS - 1, 0),
    volume: num(c.volume, `${where}, volume`, 0, 1.25, 0.8),
    pan: num(c.pan, `${where}, pan`, -1, 1, 0),
    mute: bool(c.mute), solo: bool(c.solo),
  };
}

function note(v: unknown, where: string): Note {
  const n = obj(v, where);
  return {
    id: id(n.id, where),
    tick: int(n.tick, `${where}, position`, 0, LIMITS.maxTick),
    length: int(n.length, `${where}, durée`, 1, LIMITS.maxTick),
    pitch: int(n.pitch, `${where}, hauteur`, 0, 127),
    velocity: num(n.velocity, `${where}, vélocité`, 0, 1, 0.8),
  };
}

function pattern(v: unknown, i: number, channelIds: Set<Id>): Pattern {
  const where = `pattern ${i + 1}`;
  const p = obj(v, where);
  const rawNotes = obj(p.notes ?? {}, `${where}, notes,`);
  const notes: Record<Id, Note[]> = {};
  let total = 0;
  for (const [chId, list] of Object.entries(rawNotes)) {
    if (!channelIds.has(chId)) continue;
    const a = arr(list, `${where}, notes,`, LIMITS.notesPerPattern);
    total += a.length;
    if (total > LIMITS.notesPerPattern) fail(where, 'contient trop de notes');
    notes[chId] = uniqueIds(a.map((n, j) => note(n, `${where}, note ${j + 1}`)), where);
  }
  return {
    id: id(p.id, where),
    name: text(p.name, `Pattern ${i + 1}`),
    color: color(p.color, CHANNEL_COLORS[i % 12]!),
    lengthTicks: int(p.lengthTicks, `${where}, longueur`, 24, LIMITS.maxTick, 1536),
    notes,
  };
}

function effect(v: unknown, where: string): EffectSlot {
  const e = obj(v, where);
  if (!EFFECT_TYPES.includes(e.type as EffectType)) fail(where, `a un effet inconnu (${String(e.type)})`);
  const type = e.type as EffectType;
  return {
    id: id(e.id, where), type,
    bypass: bool(e.bypass),
    mix: num(e.mix, `${where}, mix`, 0, 1, 1),
    params: params(e.params, type, `${where}, réglages,`),
  };
}

function mixer(v: unknown): MixerTrack[] {
  const list = arr(v, 'la console', 64);
  const out = Array.from({ length: MIXER_TRACKS }, (_, i) => newMixerTrack(i));
  for (const raw of list) {
    const t = obj(raw, 'une tranche');
    const index = int(t.index, 'une tranche, numéro', 0, 1000);
    if (index >= MIXER_TRACKS) continue;
    const where = index === 0 ? 'le maître' : `la tranche ${index}`;
    const base = out[index]!;
    out[index] = {
      index,
      name: text(t.name, base.name), color: color(t.color, base.color),
      volume: num(t.volume, `${where}, volume`, 0, 1.25, 1),
      pan: num(t.pan, `${where}, pan`, -1, 1, 0),
      mute: bool(t.mute), solo: bool(t.solo),
      effects: uniqueIds(arr(t.effects ?? [], `${where}, effets,`, 64).slice(0, MAX_EFFECTS).map((e, j) => effect(e, `${where}, effet ${j + 1}`)), where),
    };
  }
  return out;
}

function track(v: unknown, i: number): ArrangementTrack {
  const where = `piste ${i + 1}`;
  const t = obj(v, where);
  return {
    id: id(t.id, where), name: text(t.name, `Piste ${i + 1}`), color: color(t.color, CHANNEL_COLORS[i % 12]!),
    mute: bool(t.mute), height: int(t.height, `${where}, hauteur`, 24, 200, 48),
  };
}

function clip(v: unknown, i: number): Clip {
  const where = `clip ${i + 1}`;
  const c = obj(v, where);
  return {
    id: id(c.id, where), trackId: id(c.trackId, where), patternId: id(c.patternId, where),
    start: int(c.start, `${where}, début`, 0, LIMITS.maxTick),
    length: int(c.length, `${where}, durée`, 1, LIMITS.maxTick),
    offset: int(c.offset, `${where}, décalage`, 0, LIMITS.maxTick, 0),
  };
}

function sample(v: unknown, i: number): SampleRef {
  const where = `échantillon ${i + 1}`;
  const s = obj(v, where);
  return { id: id(s.id, where), name: text(s.name, `Son ${i + 1}`), durationSec: num(s.durationSec, `${where}, durée`, 0, LIMITS.sampleSec, 0) };
}

/** Valide et nettoie un projet de version courante. */
export function sanitizeProject(v: unknown): Project {
  const p = obj(v, 'le projet');
  if (p.format !== 'frequence') throw new FrequenceError('Ce fichier n’est pas un projet Fréquence.');
  if (p.version !== 1) throw new FrequenceError(`Version de projet non prise en charge (${String(p.version)}).`);

  const channels = uniqueIds(arr(p.channels, 'les canaux', LIMITS.channels).map(channel), 'les canaux');
  const channelIds = new Set(channels.map(c => c.id));
  const patterns = uniqueIds(arr(p.patterns, 'les patterns', LIMITS.patterns).map((x, i) => pattern(x, i, channelIds)), 'les patterns');
  if (patterns.length === 0) fail('le projet', 'ne contient aucun pattern');
  const patternIds = new Set(patterns.map(x => x.id));

  const arrangement = obj(p.arrangement, 'l’arrangement');
  const tracks = uniqueIds(arr(arrangement.tracks, 'les pistes', LIMITS.tracks).map(track), 'les pistes');
  const trackIds = new Set(tracks.map(t => t.id));
  const clips = uniqueIds(arr(arrangement.clips, 'les clips', LIMITS.clips).map(clip), 'les clips')
    .filter(c => trackIds.has(c.trackId) && patternIds.has(c.patternId));
  let loop: Project['arrangement']['loop'] = null;
  if (arrangement.loop !== null && arrangement.loop !== undefined) {
    const l = obj(arrangement.loop, 'la boucle');
    const start = int(l.start, 'la boucle, début', 0, LIMITS.maxTick);
    const end = int(l.end, 'la boucle, fin', 0, LIMITS.maxTick);
    loop = end > start ? { start, end } : null;
  }

  return {
    format: 'frequence', version: 1,
    name: text(p.name, 'Sans titre'),
    bpm: num(p.bpm, 'le tempo', 40, 300, 130),
    swing: num(p.swing, 'le swing', 0, 1, 0),
    masterPitch: int(p.masterPitch, 'la transposition', -12, 12, 0),
    channels, patterns,
    arrangement: { tracks, clips, loop },
    mixer: mixer(p.mixer),
    samples: uniqueIds(arr(p.samples ?? [], 'les échantillons', LIMITS.samples).map(sample), 'les échantillons'),
  };
}
