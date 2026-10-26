// Fichiers MIDI standard (étape 3.3) : export SMF type 1 (une piste par canal) et import des types 0 et 1.
// C'est la porte d'échange avec les autres logiciels de musique.
import { DEFAULT_PATTERN_TICKS, colorAt, newChannel, newPattern } from './defaults';
import { FrequenceError } from './errors';
import { newId } from './ids';
import { PPQ, type Channel, type Id, type Note, type Pattern, type Project } from './types';
import { LIMITS } from './validate';

export const MAX_MIDI_BYTES = 10 * 1024 * 1024;
const DRUM_CHANNEL = 9;   // canal 10 en numérotation humaine

/**
 * Batterie General MIDI vers les 12 voix de Frappe (36 à 56, déjà aux numéros GM) : chaque son GM
 * sans voix à lui va vers la plus proche (pédale de charley vers le charley fermé, congas vers la
 * percu, ride 2 vers la ride…). Les autres notes passent telles quelles.
 */
const GM_VERS_FRAPPE: Record<number, number> = {
  35: 36, 40: 38, 43: 41, 44: 42, 48: 45, 50: 45, 52: 49, 55: 49, 57: 49, 53: 51, 59: 51,
  54: 56, 58: 56, 67: 56, 68: 56, 60: 47, 61: 47, 62: 47, 63: 47, 64: 47, 65: 47, 66: 47,
  69: 42, 70: 42, 75: 37, 76: 37, 77: 37,
};
const BAR = PPQ * 4;

// ---------------------------------------------------------------- export

class Writer {
  bytes: number[] = [];
  u8(...v: number[]) { for (const x of v) this.bytes.push(x & 0xff); }
  u16(v: number) { this.u8(v >> 8, v); }
  u32(v: number) { this.u8(v >>> 24, v >>> 16, v >>> 8, v); }
  varlen(v: number) {
    const out = [v & 0x7f];
    while ((v >>>= 7) > 0) out.unshift((v & 0x7f) | 0x80);
    this.u8(...out);
  }
  text(s: string) { const b = new TextEncoder().encode(s); this.varlen(b.length); this.u8(...b); }
}

interface TimedEvent { tick: number; order: number; write(w: Writer): void }

function trackChunk(events: TimedEvent[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const w = new Writer();
  let last = 0;
  for (const e of events) {
    w.varlen(e.tick - last);
    last = e.tick;
    e.write(w);
  }
  w.varlen(0); w.u8(0xff, 0x2f, 0x00);
  const head = new Writer();
  head.u8(...new TextEncoder().encode('MTrk'));
  head.u32(w.bytes.length);
  return [...head.bytes, ...w.bytes];
}

const nameEvent = (name: string): TimedEvent => ({ tick: 0, order: -2, write: w => { w.u8(0xff, 0x03); w.text(name); } });

/** Notes de chaque canal, à plat dans le temps du morceau (arrangement) ou d'un pattern seul. */
export function flattenNotes(p: Project, patternId?: Id): Map<Id, Note[]> {
  const out = new Map<Id, Note[]>(p.channels.map(c => [c.id, []]));
  const push = (chId: Id, n: Note) => out.get(chId)?.push(n);
  const patterns = new Map(p.patterns.map(x => [x.id, x]));
  const single = patternId ? patterns.get(patternId) : undefined;
  const mutedTracks = new Set(p.arrangement.tracks.filter(t => t.mute).map(t => t.id));
  const clips = p.arrangement.clips.filter(c => !mutedTracks.has(c.trackId) && patterns.has(c.patternId));

  if (single || clips.length === 0) {
    const pat = single ?? p.patterns[0];
    if (pat) for (const [chId, notes] of Object.entries(pat.notes)) for (const n of notes) push(chId, { ...n });
    return out;
  }
  for (const clip of clips) {
    const pat = patterns.get(clip.patternId)!;
    const len = Math.max(1, pat.lengthTicks);
    const end = clip.start + clip.length;
    const firstRep = Math.floor(clip.offset / len);
    const lastRep = Math.floor((clip.offset + clip.length - 1) / len);
    for (let r = firstRep; r <= lastRep; r++) {
      const base = clip.start - clip.offset + r * len;
      for (const [chId, notes] of Object.entries(pat.notes)) {
        for (const n of notes) {
          if (n.tick >= len) continue;
          const tick = base + n.tick;
          if (tick < clip.start || tick >= end) continue;
          push(chId, { ...n, tick, length: Math.min(n.length, end - tick) });
        }
      }
    }
  }
  return out;
}

function midiChannels(channels: Channel[]): Map<Id, number> {
  const map = new Map<Id, number>();
  let next = 0;
  for (const c of channels) {
    if (c.instrument.type === 'frappe') { map.set(c.id, DRUM_CHANNEL); continue; }
    map.set(c.id, next);
    next = (next + 1) % 16;
    if (next === DRUM_CHANNEL) next++;
  }
  return map;
}

/** §D.4 : SMF type 1, une piste de tempo puis une piste par canal. Sans patternId : le morceau. */
export function exportMidi(p: Project, o: { patternId?: Id } = {}): Uint8Array {
  const notes = flattenNotes(p, o.patternId);
  const chans = midiChannels(p.channels);
  const tracks: number[][] = [];

  const usPerQuarter = Math.round(60_000_000 / p.bpm);
  tracks.push(trackChunk([
    nameEvent(p.name),
    { tick: 0, order: -1, write: w => { w.u8(0xff, 0x51, 0x03, usPerQuarter >> 16, usPerQuarter >> 8, usPerQuarter); } },
    { tick: 0, order: -1, write: w => { w.u8(0xff, 0x58, 0x04, 4, 2, 24, 8); } },
  ]));

  for (const c of p.channels) {
    const ch = chans.get(c.id)!;
    const transpose = c.instrument.type === 'frappe' ? 0 : p.masterPitch;
    const events: TimedEvent[] = [nameEvent(c.name)];
    if (ch !== DRUM_CHANNEL) events.push({ tick: 0, order: -1, write: w => { w.u8(0xc0 | ch, 0); } });
    for (const n of notes.get(c.id) ?? []) {
      const pitch = Math.max(0, Math.min(127, n.pitch + transpose));
      const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)));
      // À tick égal, les fins de note passent avant les débuts (order 0 < 1).
      events.push({ tick: n.tick, order: 1, write: w => { w.u8(0x90 | ch, pitch, vel); } });
      events.push({ tick: n.tick + Math.max(1, n.length), order: 0, write: w => { w.u8(0x80 | ch, pitch, 0); } });
    }
    tracks.push(trackChunk(events));
  }

  const head = new Writer();
  head.u8(...new TextEncoder().encode('MThd'));
  head.u32(6); head.u16(1); head.u16(tracks.length); head.u16(PPQ);
  return new Uint8Array([...head.bytes, ...tracks.flat()]);
}

// ---------------------------------------------------------------- import

const bad = (what: string): never => { throw new FrequenceError(`Fichier MIDI invalide : ${what}.`); };

class Reader {
  pos = 0;
  constructor(readonly v: DataView, readonly end = v.byteLength) {}
  need(n: number) { if (this.pos + n > this.end) bad('fichier tronqué'); }
  u8() { this.need(1); return this.v.getUint8(this.pos++); }
  u16() { this.need(2); const x = this.v.getUint16(this.pos); this.pos += 2; return x; }
  u32() { this.need(4); const x = this.v.getUint32(this.pos); this.pos += 4; return x; }
  tag() { return String.fromCharCode(this.u8(), this.u8(), this.u8(), this.u8()); }
  varlen() {
    let x = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.u8();
      x = (x << 7) | (b & 0x7f);
      if (!(b & 0x80)) return x;
    }
    return bad('durée mal codée');
  }
  bytes(n: number) { this.need(n); const b = new Uint8Array(this.v.buffer, this.v.byteOffset + this.pos, n); this.pos += n; return b; }
}

interface RawNote { tick: number; length: number; pitch: number; velocity: number }
interface Voice { name: string; channel: number; notes: RawNote[] }

export interface MidiImport { channels: Channel[]; pattern: Pattern; bpm: number | null }

/** §D.4 : lit un SMF type 0 ou 1 ; un canal Fréquence par (piste, canal MIDI) qui contient des notes. */
export function importMidi(data: ArrayBuffer): MidiImport {
  if (data.byteLength > MAX_MIDI_BYTES) throw new FrequenceError('Fichier MIDI trop volumineux (10 Mo au plus).');
  const r = new Reader(new DataView(data));
  if (data.byteLength < 14 || r.tag() !== 'MThd') throw new FrequenceError('Ce fichier n’est pas un fichier MIDI.');
  const headLen = r.u32();
  if (headLen < 6) bad('en-tête trop court');
  const format = r.u16(), ntracks = r.u16(), division = r.u16();
  r.pos = 8 + headLen;
  if (format > 1) throw new FrequenceError('Fichier MIDI de type 2 non pris en charge (types 0 et 1 seulement).');
  if (division & 0x8000 || division === 0) throw new FrequenceError('Fichier MIDI en temps SMPTE non pris en charge.');
  const scale = PPQ / division;

  let bpm: number | null = null;
  const voices: Voice[] = [];
  let total = 0;

  for (let t = 0; t < ntracks && r.pos < data.byteLength; t++) {
    const tag = r.tag();
    const len = r.u32();
    const end = r.pos + len;
    if (end > data.byteLength) bad('piste tronquée');
    if (tag !== 'MTrk') { r.pos = end; t--; continue; }   // bloc inconnu : ignoré
    const tr = new Reader(r.v, end);
    tr.pos = r.pos;
    let tick = 0, running = 0, name = '';
    const byChannel = new Map<number, Voice>();
    const open = new Map<number, { tick: number; velocity: number }[]>();   // (canal << 7 | hauteur) → débuts en attente
    const close = (ch: number, pitch: number, at: number) => {
      const q = open.get((ch << 7) | pitch);
      const start = q?.shift();
      if (!start) return;
      let v = byChannel.get(ch);
      if (!v) { v = { name: '', channel: ch, notes: [] }; byChannel.set(ch, v); }
      if (++total > LIMITS.notesPerPattern) throw new FrequenceError('Fichier MIDI trop chargé (100 000 notes au plus).');
      v.notes.push({ tick: start.tick, length: Math.max(1, at - start.tick), pitch, velocity: start.velocity });
    };

    while (tr.pos < end) {
      tick += tr.varlen();
      let status = tr.u8();
      if (status < 0x80) {
        if (!running) bad('statut manquant');
        status = running; tr.pos--;
      }
      if (status === 0xff) {
        const type = tr.u8(), n = tr.varlen(), body = tr.bytes(n);
        if (type === 0x2f) break;
        if (type === 0x03 && !name) name = new TextDecoder().decode(body).trim().slice(0, 80);
        if (type === 0x51 && n === 3 && bpm === null) {
          const us = (body[0]! << 16) | (body[1]! << 8) | body[2]!;
          if (us > 0) bpm = Math.round(Math.min(300, Math.max(40, 60_000_000 / us)) * 100) / 100;
        }
        continue;
      }
      if (status === 0xf0 || status === 0xf7) { tr.bytes(tr.varlen()); continue; }
      if (status >= 0xf0) bad('message système inattendu');
      running = status;
      const kind = status & 0xf0, ch = status & 0x0f;
      const a = tr.u8() & 0x7f;
      const b = kind === 0xc0 || kind === 0xd0 ? 0 : tr.u8() & 0x7f;
      const at = Math.round(tick * scale);
      if (kind === 0x90 && b > 0) {
        const key = (ch << 7) | a;
        const q = open.get(key) ?? [];
        q.push({ tick: at, velocity: b / 127 });
        open.set(key, q);
      } else if (kind === 0x80 || kind === 0x90) {
        close(ch, a, at);
      }
    }
    const endTick = Math.round(tick * scale);
    for (const key of [...open.keys()]) while (open.get(key)?.length) close(key >> 7, key & 0x7f, endTick);
    for (const v of byChannel.values()) {
      v.name = name && byChannel.size === 1 ? name : name ? `${name} (canal ${v.channel + 1})` : '';
      voices.push(v);
    }
    r.pos = end;
  }

  const kept = voices.filter(v => v.notes.length > 0);
  if (kept.length === 0) throw new FrequenceError('Ce fichier MIDI ne contient aucune note.');
  if (kept.length > LIMITS.channels) throw new FrequenceError('Fichier MIDI trop chargé (256 canaux au plus).');

  const channels: Channel[] = [];
  const pattern = newPattern('Import MIDI');
  let maxEnd = 0;
  kept.forEach((v, i) => {
    const drums = v.channel === DRUM_CHANNEL;
    const c = newChannel(drums ? 'frappe' : 'trio');
    c.name = v.name || (drums ? 'Batterie MIDI' : `MIDI ${i + 1}`);
    c.color = colorAt(i);
    channels.push(c);
    pattern.notes[c.id] = v.notes
      .sort((x, y) => x.tick - y.tick || x.pitch - y.pitch)
      .map(n => {
        maxEnd = Math.max(maxEnd, n.tick + n.length);
        const pitch = drums ? GM_VERS_FRAPPE[n.pitch] ?? n.pitch : n.pitch;
        return { id: newId(), tick: n.tick, length: n.length, pitch, velocity: n.velocity };
      });
  });
  pattern.lengthTicks = Math.min(LIMITS.maxTick, Math.max(DEFAULT_PATTERN_TICKS, Math.ceil(maxEnd / BAR) * BAR));
  return { channels, pattern, bpm };
}
