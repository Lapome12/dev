// Horloge à deux temps (§E) : un minuteur réveille l'ordonnanceur toutes les 25 ms, qui programme
// à l'avance (100 ms) les notes sur l'horloge précise du contexte audio. Aucune note n'est jouée
// depuis un minuteur. Ce fichier ne touche pas à Web Audio : tout y est testable sans navigateur.
import { PPQ, type Id, type Pattern, type Project } from '../project/types';

export const STEP_TICKS = PPQ / 4;          // double-croche
export const BAR_TICKS = PPQ * 4;           // mesure 4/4
export const LOOKAHEAD_SEC = 0.1;
export const TIMER_MS = 25;

export type PlayMode = { kind: 'pattern'; patternId: Id } | { kind: 'morceau' };

export interface NoteEvent { channelId: Id; tick: number; length: number; pitch: number; velocity: number }

export function secondsPerTick(bpm: number): number {
  return 60 / (bpm * PPQ);
}

/**
 * Swing : déforme le temps à l'intérieur de chaque croche pour retarder la double-croche paire.
 * À swing = 1, la 2e double-croche tombe à mi-chemin entre sa place et la croche suivante.
 * La déformation est continue et croissante : l'ordre et la durée des notes sont préservés.
 */
export function swingTick(tick: number, swing: number): number {
  if (swing <= 0) return tick;
  const eighth = STEP_TICKS * 2;
  const base = Math.floor(tick / eighth) * eighth;
  const p = tick - base;
  const mid = STEP_TICKS + swing * (STEP_TICKS / 2);
  const warped = p < STEP_TICKS ? (p * mid) / STEP_TICKS : mid + ((p - STEP_TICKS) * (eighth - mid)) / (eighth - STEP_TICKS);
  return base + warped;
}

/** Fin du morceau : fin du dernier clip, arrondie à la mesure (au moins une mesure). */
export function songEnd(project: Readonly<Project>): number {
  let end = 0;
  for (const c of project.arrangement.clips) end = Math.max(end, c.start + c.length);
  return Math.max(BAR_TICKS, Math.ceil(end / BAR_TICKS) * BAR_TICKS);
}

/** Zone jouée en boucle selon le mode. */
export function loopRange(project: Readonly<Project>, mode: PlayMode): { start: number; end: number } {
  if (mode.kind === 'pattern') {
    const pat = project.patterns.find((p) => p.id === mode.patternId);
    return { start: 0, end: Math.max(STEP_TICKS, pat?.lengthTicks ?? BAR_TICKS) };
  }
  const loop = project.arrangement.loop;
  if (loop && loop.end > loop.start) return { start: loop.start, end: loop.end };
  return { start: 0, end: songEnd(project) };
}

/** Canaux audibles (mute et solo). */
export function audibleChannels(project: Readonly<Project>): Set<Id> {
  const anySolo = project.channels.some((c) => c.solo);
  return new Set(project.channels.filter((c) => (anySolo ? c.solo : !c.mute)).map((c) => c.id));
}

function pushPatternNotes(
  out: NoteEvent[], pattern: Pattern, audible: Set<Id>,
  origin: number, from: number, to: number, clipStart: number, clipEnd: number,
): void {
  const len = pattern.lengthTicks;
  if (len <= 0) return;
  const lo = Math.max(from, clipStart);
  const hi = Math.min(to, clipEnd);
  if (hi <= lo) return;
  for (const [channelId, notes] of Object.entries(pattern.notes)) {
    if (!audible.has(channelId)) continue;
    for (const n of notes) {
      if (n.tick < 0 || n.tick >= len) continue;
      let k = Math.ceil((lo - origin - n.tick) / len);
      for (let t = origin + k * len + n.tick; t < hi; k++, t = origin + k * len + n.tick) {
        if (t < lo) continue;
        out.push({ channelId, tick: t, length: Math.max(1, Math.min(n.length, clipEnd - t)), pitch: n.pitch, velocity: n.velocity });
      }
    }
  }
}

/** Notes qui commencent dans [from, to[ (ticks du morceau ou du pattern), triées par position. */
export function collectEvents(project: Readonly<Project>, mode: PlayMode, from: number, to: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  const audible = audibleChannels(project);
  if (mode.kind === 'pattern') {
    const pat = project.patterns.find((p) => p.id === mode.patternId);
    if (pat) pushPatternNotes(out, pat, audible, 0, from, to, 0, Infinity);
  } else {
    const muted = new Set(project.arrangement.tracks.filter((t) => t.mute).map((t) => t.id));
    for (const c of project.arrangement.clips) {
      if (muted.has(c.trackId) || c.length <= 0) continue;
      const pat = project.patterns.find((p) => p.id === c.patternId);
      if (pat) pushPatternNotes(out, pat, audible, c.start - c.offset, from, to, c.start, c.start + c.length);
    }
  }
  out.sort((a, b) => a.tick - b.tick);
  return out;
}

export interface TransportHooks {
  now(): number;
  project(): Readonly<Project>;
  /** Programme une note : départ et durée en secondes sur l'horloge du contexte. */
  note(ev: NoteEvent, time: number, duration: number): void;
  /** Clic du métronome (accent sur le premier temps de la mesure). */
  click?(time: number, accent: boolean): void;
}

interface Segment { time: number; tick: number; bpm: number }

/**
 * Ordonnanceur. La position est un repère (instant, tick) : les instants des notes sont toujours
 * calculés depuis ce repère, jamais par accumulation, donc pas de dérive.
 */
export class Transport {
  playing = false;
  mode: PlayMode = { kind: 'morceau' };
  metronome = false;
  private anchorTime = 0;
  private anchorTick = 0;
  private bpm = 120;
  private cursor = 0;            // prochain tick à programmer
  private pausedTick = 0;
  private segments: Segment[] = [];

  constructor(private hooks: TransportHooks) {}

  get anchor(): { time: number; tick: number; bpm: number } {
    return { time: this.anchorTime, tick: this.anchorTick, bpm: this.bpm };
  }

  /** Démarre à `at` (instant du contexte) depuis `fromTick`. */
  start(mode: PlayMode, fromTick: number, at: number): void {
    this.mode = mode;
    this.bpm = this.hooks.project().bpm;
    const loop = loopRange(this.hooks.project(), mode);
    const tick = fromTick >= loop.end ? loop.start : Math.max(0, fromTick);
    this.anchorTime = at;
    this.anchorTick = tick;
    this.cursor = tick;
    this.segments = [{ time: at, tick, bpm: this.bpm }];
    this.playing = true;
    this.schedule();
  }

  /** Arrête la programmation et retient la position. */
  halt(): number {
    const pos = this.position(this.hooks.now());
    this.playing = false;
    this.pausedTick = pos;
    return pos;
  }

  setPausedTick(tick: number): void {
    this.pausedTick = tick;
  }

  /** Change de tempo sans saut : le repère est déplacé sur le prochain tick à programmer. */
  setBpm(bpm: number): void {
    if (bpm === this.bpm) return;
    if (this.playing) {
      const t = this.timeOfLinear(this.cursor);
      this.anchorTime = t;
      this.anchorTick = this.cursor;
      this.segments.push({ time: t, tick: this.cursor, bpm });
    }
    this.bpm = bpm;
  }

  private timeOfLinear(tick: number): number {
    return this.anchorTime + (tick - this.anchorTick) * secondsPerTick(this.bpm);
  }

  /** Instant de jeu d'un tick du segment courant, swing compris. */
  timeOf(tick: number): number {
    const swing = this.hooks.project().swing;
    return this.anchorTime + (swingTick(tick, swing) - swingTick(this.anchorTick, swing)) * secondsPerTick(this.bpm);
  }

  /** Position (tick) entendue à l'instant `time`. */
  position(time: number): number {
    if (!this.playing) return this.pausedTick;
    let seg = this.segments[0];
    if (!seg) return this.pausedTick;
    for (const s of this.segments) if (s.time <= time) seg = s;
    return seg.tick + Math.max(0, time - seg.time) / secondsPerTick(seg.bpm);
  }

  /** Programme tout ce qui tombe avant `untilTime` (par défaut : maintenant + anticipation). */
  schedule(untilTime = this.hooks.now() + LOOKAHEAD_SEC): void {
    if (!this.playing) return;
    const project = this.hooks.project();
    // Plusieurs tours de boucle peuvent tenir dans la fenêtre (boucle très courte, rendu hors ligne).
    for (let guard = 0; guard < 100000; guard++) {
      const loop = loopRange(project, this.mode);
      if (this.cursor >= loop.end) this.wrap(this.cursor, loop.start);
      const horizon = this.anchorTick + (untilTime - this.anchorTime) / secondsPerTick(this.bpm);
      const segEnd = Math.min(horizon, loop.end);
      if (segEnd <= this.cursor) return;
      this.emit(project, this.cursor, segEnd);
      this.cursor = segEnd;
      if (segEnd < loop.end) return;
      this.wrap(loop.end, loop.start);
    }
  }

  private wrap(atTick: number, toTick: number): void {
    const t = this.timeOfLinear(atTick);
    this.anchorTime = t;
    this.anchorTick = toTick;
    this.cursor = toTick;
    this.segments.push({ time: t, tick: toTick, bpm: this.bpm });
    // Garder un historique court (la position ne regarde que le passé proche).
    if (this.segments.length > 64) this.segments.splice(0, this.segments.length - 64);
  }

  private emit(project: Readonly<Project>, from: number, to: number): void {
    for (const ev of collectEvents(project, this.mode, from, to)) {
      const t = this.timeOf(ev.tick);
      this.hooks.note(ev, t, this.timeOf(ev.tick + ev.length) - t);
    }
    if (this.metronome && this.hooks.click) {
      for (let b = Math.ceil(from / PPQ) * PPQ; b < to; b += PPQ) this.hooks.click(this.timeOfLinear(b), b % BAR_TICKS === 0);
    }
  }
}
