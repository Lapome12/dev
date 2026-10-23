// Moteur audio de Fréquence (contrat §D.3 du plan). Il lit le projet (sync) et ne le modifie jamais.
import type { Id, InstrumentType, Project } from '../project/types';
import { createAudioContext } from './context';
import type { EffectHost } from './effects/effect';
import type { Instrument, InstrumentHost } from './instruments/instrument';
import { ChannelStrip, Mixer, TRACK_COUNT } from './mixer';
import { resolveParams } from './params';
import { INSTRUMENTS } from './registry';
import { audibleChannels, TIMER_MS, Transport, type NoteEvent, type PlayMode } from './transport';
import { STOP_FADE_SEC, VoicePool, type Voice } from './voices';

export type { PlayMode } from './transport';

export interface Engine {
  readonly context: BaseAudioContext;
  resume(): Promise<void>;
  sync(project: Project): void;
  setSampleAudio(id: Id, audio: AudioBuffer): void;
  decodeSample(data: ArrayBuffer): Promise<AudioBuffer>;
  play(mode: PlayMode, fromTick?: number): void;
  stop(): void;
  pause(): void;
  isPlaying(): boolean;
  seek(tick: number): void;
  setMetronome(on: boolean): void;
  onPosition(cb: (tick: number) => void): () => void;
  noteOn(channelId: Id, pitch: number, velocity: number): void;
  noteOff(channelId: Id, pitch: number): void;
  levels(): { track: number; left: number; right: number; peakHold: number }[];
  spectrum(track: number, out: Float32Array): void;
  frequencyResponse(track: number, slotId: Id, freqs: Float32Array, magDb: Float32Array): void;
  gainReduction(track: number, slotId: Id): number;
  dispose(): void;
}

/** Délai entre l'appel à play() et le premier son : laisse le temps de programmer sans retard. */
const START_DELAY_SEC = 0.03;

interface ChannelRuntime {
  type: InstrumentType;
  instrument: Instrument;
  strip: ChannelStrip;
  pool: VoicePool;
  paramsKey: string;
  live: Map<number, Voice>;
  lastPitch?: number;
}

/** Options internes (rendu hors ligne). */
export interface EngineOptions { safetyLimiter?: boolean; realtime?: boolean }

export class AudioEngine implements Engine {
  readonly context: BaseAudioContext;
  private project: Project | null = null;
  private mixer: Mixer;
  private channels = new Map<Id, ChannelRuntime>();
  private samples = new Map<Id, AudioBuffer>();
  readonly transport: Transport;
  private timer: ReturnType<typeof setInterval> | null = null;
  private positionCbs = new Set<(tick: number) => void>();
  private raf: number | null = null;
  private realtime: boolean;

  constructor(context?: BaseAudioContext, opts: EngineOptions = {}) {
    this.context = context ?? createAudioContext();
    this.realtime = opts.realtime ?? !(typeof OfflineAudioContext !== 'undefined' && this.context instanceof OfflineAudioContext);
    const host: EffectHost = { ctx: this.context, bpm: () => this.project?.bpm ?? 120 };
    this.mixer = new Mixer(this.context, host, opts.safetyLimiter ?? true);
    this.transport = new Transport({
      now: () => this.context.currentTime,
      project: () => this.requireProject(),
      note: (ev, time, duration) => this.scheduleNote(ev, time, duration),
      click: (time, accent) => this.click(time, accent),
    });
  }

  private requireProject(): Project {
    if (!this.project) throw new Error('Moteur : aucun projet (appeler sync avant play)');
    return this.project;
  }

  async resume(): Promise<void> {
    const ctx = this.context as AudioContext;
    if (typeof ctx.resume === 'function' && ctx.state !== 'running') await ctx.resume();
  }

  // ---------- Projet ----------

  sync(project: Project): void {
    const prev = this.project;
    this.project = project;
    if (!prev || prev.bpm !== project.bpm) {
      this.transport.setBpm(project.bpm);
      this.mixer.setTempo(project.bpm);
    }
    this.mixer.sync(project.mixer);

    const audible = audibleChannels(project);
    const seen = new Set<Id>();
    for (const ch of project.channels) {
      seen.add(ch.id);
      let rt = this.channels.get(ch.id);
      if (rt && rt.type !== ch.instrument.type) {
        this.disposeChannel(ch.id, rt);
        rt = undefined;
      }
      if (!rt) {
        rt = this.createChannel(ch.instrument.type);
        this.channels.set(ch.id, rt);
      }
      const key = JSON.stringify(ch.instrument.params);
      if (key !== rt.paramsKey) {
        rt.paramsKey = key;
        const mod = INSTRUMENTS[ch.instrument.type] ?? INSTRUMENTS.trio;
        if (mod) rt.instrument.setParams(resolveParams(mod.def, ch.instrument.params));
        rt.pool.max = rt.instrument.polyphony();
      }
      rt.strip.sync(ch, audible.has(ch.id), this.mixer);
    }
    for (const [id, rt] of this.channels) if (!seen.has(id)) this.disposeChannel(id, rt);
  }

  private createChannel(type: InstrumentType): ChannelRuntime {
    // Un type pas encore livré joue avec Trio plutôt que de rester muet.
    const mod = INSTRUMENTS[type] ?? INSTRUMENTS.trio;
    if (!mod) throw new Error('Aucun instrument disponible');
    const host: InstrumentHost = { ctx: this.context, sample: (id) => this.samples.get(id) };
    const instrument = mod.create(host);
    const strip = new ChannelStrip(this.context);
    instrument.output.connect(strip.input);
    return { type, instrument, strip, pool: new VoicePool(instrument.polyphony()), paramsKey: '', live: new Map() };
  }

  private disposeChannel(id: Id, rt: ChannelRuntime): void {
    this.channels.delete(id);
    const now = this.context.currentTime;
    rt.pool.killAll(now, STOP_FADE_SEC);
    const done = (): void => {
      rt.pool.disposeAll();
      rt.instrument.dispose();
      rt.strip.dispose();
    };
    if (this.realtime) setTimeout(done, 50);
    else done();
  }

  setSampleAudio(id: Id, audio: AudioBuffer): void {
    this.samples.set(id, audio);
  }

  decodeSample(data: ArrayBuffer): Promise<AudioBuffer> {
    return this.context.decodeAudioData(data.slice(0));
  }

  // ---------- Notes ----------

  private startVoice(channelId: Id, pitch: number, velocity: number, time: number): Voice | undefined {
    const rt = this.channels.get(channelId);
    if (!rt || !this.project) return undefined;
    const glideFrom = rt.pool.max === 1 ? rt.pool.latest(time)?.pitch ?? rt.lastPitch : undefined;
    const voice = rt.instrument.noteOn({
      pitch, velocity: Math.min(1, Math.max(0, velocity)), time, transpose: this.project.masterPitch,
      ...(glideFrom !== undefined ? { glideFrom } : {}),
    });
    rt.pool.add(voice, time);
    rt.lastPitch = pitch;
    return voice;
  }

  private scheduleNote(ev: NoteEvent, time: number, duration: number): void {
    const voice = this.startVoice(ev.channelId, ev.pitch, ev.velocity, time);
    voice?.release(time + Math.max(0.005, duration));
  }

  noteOn(channelId: Id, pitch: number, velocity: number): void {
    const rt = this.channels.get(channelId);
    if (!rt) return;
    const now = this.context.currentTime;
    rt.live.get(pitch)?.release(now);
    const v = this.startVoice(channelId, pitch, velocity, now);
    if (v) rt.live.set(pitch, v);
    rt.pool.prune(now);
  }

  noteOff(channelId: Id, pitch: number): void {
    const rt = this.channels.get(channelId);
    const v = rt?.live.get(pitch);
    if (!rt || !v) return;
    v.release(this.context.currentTime);
    rt.live.delete(pitch);
  }

  // ---------- Métronome ----------

  private click(time: number, accent: boolean): void {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1320;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(accent ? 0.35 : 0.22, time + 0.003);
    g.gain.setTargetAtTime(0, time + 0.003, 0.012);
    osc.connect(g).connect(this.mixer.post);
    osc.start(time);
    osc.stop(time + 0.09);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  setMetronome(on: boolean): void {
    this.transport.metronome = on;
  }

  // ---------- Transport ----------

  play(mode: PlayMode, fromTick?: number): void {
    const project = this.requireProject();
    const now = this.context.currentTime;
    const from = fromTick ?? this.transport.position(now);
    if (this.transport.playing) this.silence(now);
    this.transport.start(mode, from, now + START_DELAY_SEC);
    this.mixer.setTempo(project.bpm);
    this.notifyTransport();
    if (this.realtime) this.startTimers();
  }

  /** Programme d'un coup jusqu'à `untilTime` (rendu hors ligne). */
  scheduleUntil(untilTime: number): void {
    this.transport.schedule(untilTime);
  }

  private notifyTransport(): void {
    const a = this.transport.anchor;
    this.mixer.onTransport({ playing: this.transport.playing, bpm: a.bpm, anchorTime: a.time, anchorTick: a.tick });
  }

  private silence(now: number): void {
    for (const rt of this.channels.values()) {
      rt.pool.killAll(now, STOP_FADE_SEC);
      rt.live.clear();
    }
  }

  pause(): void {
    if (!this.transport.playing) return;
    this.transport.halt();
    this.silence(this.context.currentTime);
    this.stopTimers();
    this.notifyTransport();
    this.emitPosition();
  }

  stop(): void {
    if (this.transport.playing) {
      this.transport.halt();
      this.silence(this.context.currentTime);
    }
    this.transport.setPausedTick(0);
    this.stopTimers();
    this.notifyTransport();
    this.emitPosition();
  }

  isPlaying(): boolean {
    return this.transport.playing;
  }

  seek(tick: number): void {
    const t = Math.max(0, tick);
    if (this.transport.playing) this.play(this.transport.mode, t);
    else {
      this.transport.setPausedTick(t);
      this.emitPosition();
    }
  }

  private startTimers(): void {
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.transport.schedule();
        const now = this.context.currentTime;
        for (const rt of this.channels.values()) rt.pool.prune(now);
      }, TIMER_MS);
    }
    if (this.raf === null && this.positionCbs.size > 0) this.loopPosition();
  }

  private stopTimers(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.raf !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
      else clearTimeout(this.raf);
    }
    this.raf = null;
  }

  private loopPosition(): void {
    const next = (): void => {
      this.emitPosition();
      if (!this.transport.playing) {
        this.raf = null;
        return;
      }
      this.raf = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(next)
        : (setTimeout(next, 16) as unknown as number);
    };
    next();
  }

  /** Position entendue (corrigée de la latence de sortie). */
  position(): number {
    const ctx = this.context as AudioContext;
    const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    return this.transport.position(this.context.currentTime - latency);
  }

  private emitPosition(): void {
    const pos = this.position();
    for (const cb of this.positionCbs) cb(pos);
  }

  onPosition(cb: (tick: number) => void): () => void {
    this.positionCbs.add(cb);
    if (this.transport.playing && this.raf === null && this.realtime) this.loopPosition();
    return () => this.positionCbs.delete(cb);
  }

  // ---------- Mesures ----------

  levels(): { track: number; left: number; right: number; peakHold: number }[] {
    return this.mixer.levels(this.context.currentTime);
  }

  spectrum(track: number, out: Float32Array): void {
    if (track < 0 || track >= TRACK_COUNT) return;
    this.mixer.track(track).spectrum(out as Float32Array<ArrayBuffer>);
  }

  frequencyResponse(track: number, slotId: Id, freqs: Float32Array, magDb: Float32Array): void {
    const fx = track >= 0 && track < TRACK_COUNT ? this.mixer.track(track).effect(slotId) : undefined;
    if (fx?.frequencyResponse) fx.frequencyResponse(freqs, magDb);
    else magDb.fill(0);
  }

  gainReduction(track: number, slotId: Id): number {
    const fx = track >= 0 && track < TRACK_COUNT ? this.mixer.track(track).effect(slotId) : undefined;
    return fx?.gainReduction?.() ?? 0;
  }

  dispose(): void {
    this.stopTimers();
    for (const [id, rt] of this.channels) {
      this.channels.delete(id);
      rt.pool.disposeAll();
      rt.instrument.dispose();
      rt.strip.dispose();
    }
    this.mixer.dispose();
    this.positionCbs.clear();
  }
}

export function createEngine(context?: BaseAudioContext): Engine {
  return new AudioEngine(context);
}
