// Console audio : canal → tranche (effets, fader, pan, mute/solo) → maître → limiteur de sécurité.
import type { Channel, EffectSlot, Id, MixerTrack } from '../project/types';
import { clamp, compressorMakeupCompensation, smoothSet } from './context';
import type { Effect, EffectHost, TransportInfo } from './effects/effect';
import { StereoMeter } from './meters';
import { resolveParams } from './params';
import { EFFECTS } from './registry';

export const TRACK_COUNT = 13;     // maître + 12 tranches
export const MAX_EFFECTS = 8;

/** Emplacement d'effet : mélange sec/humide et contournement sans clic. */
class SlotRuntime {
  readonly input: GainNode;
  readonly output: GainNode;
  private dry: GainNode;
  private wet: GainNode;
  private paramsKey = '';

  constructor(private ctx: BaseAudioContext, readonly id: Id, readonly type: EffectSlot['type'], readonly effect: Effect) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.gain.value = 0;
    this.input.connect(this.dry).connect(this.output);
    this.input.connect(effect.input);
    effect.output.connect(this.wet).connect(this.output);
  }

  update(slot: EffectSlot, first: boolean): void {
    const mix = slot.bypass ? 0 : clamp(slot.mix, 0, 1);
    const t = this.ctx.currentTime;
    // Mélange : à 50 %, le son sec et l'effet passent tous deux à plein volume.
    const wet = Math.min(1, 2 * mix);
    const dry = Math.min(1, 2 * (1 - mix));
    if (first) {
      this.wet.gain.value = wet;
      this.dry.gain.value = dry;
    } else {
      smoothSet(this.wet.gain, wet, t);
      smoothSet(this.dry.gain, dry, t);
    }
    const key = JSON.stringify(slot.params);
    if (key !== this.paramsKey) {
      this.paramsKey = key;
      const mod = EFFECTS[this.type];
      if (mod) this.effect.setParams(resolveParams(mod.def, slot.params));
    }
  }

  dispose(): void {
    this.input.disconnect();
    this.dry.disconnect();
    this.wet.disconnect();
    this.output.disconnect();
    this.effect.dispose();
  }
}

/** Effet neutre pour un type inconnu (fichier venu d'une version plus récente). */
function passThrough(ctx: BaseAudioContext): Effect {
  const node = ctx.createGain();
  return { input: node, output: node, setParams() {}, dispose: () => node.disconnect() };
}

export class TrackStrip {
  readonly input: GainNode;
  readonly out: GainNode;
  private fader: GainNode;
  private panner: StereoPannerNode;
  private muter: GainNode;
  private slots = new Map<Id, SlotRuntime>();
  private order: Id[] = [];
  readonly meter: StereoMeter;
  private analyser: AnalyserNode | null = null;
  private initialised = false;

  constructor(private ctx: BaseAudioContext, readonly index: number, private host: EffectHost) {
    this.input = ctx.createGain();
    this.fader = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.muter = ctx.createGain();
    this.out = ctx.createGain();
    this.fader.connect(this.panner).connect(this.muter).connect(this.out);
    this.input.connect(this.fader);
    this.meter = new StereoMeter(ctx, this.out);
  }

  sync(track: MixerTrack | undefined, audible: boolean): void {
    const t = this.ctx.currentTime;
    const vol = clamp(track?.volume ?? 1, 0, 2);
    const pan = clamp(track?.pan ?? 0, -1, 1);
    const mute = audible ? 1 : 0;
    if (!this.initialised) {
      this.fader.gain.value = vol;
      this.panner.pan.value = pan;
      this.muter.gain.value = mute;
    } else {
      smoothSet(this.fader.gain, vol, t);
      smoothSet(this.panner.pan, pan, t);
      smoothSet(this.muter.gain, mute, t);
    }
    this.syncEffects((track?.effects ?? []).slice(0, MAX_EFFECTS));
    this.initialised = true;
  }

  private syncEffects(effects: EffectSlot[]): void {
    const ids = effects.map((e) => e.id);
    for (const [id, rt] of this.slots) {
      const e = effects.find((x) => x.id === id);
      if (!e || e.type !== rt.type) {
        rt.dispose();
        this.slots.delete(id);
      }
    }
    const created = new Set<Id>();
    for (const e of effects) {
      if (this.slots.has(e.id)) continue;
      const mod = EFFECTS[e.type];
      const effect = mod ? mod.create(this.host) : passThrough(this.ctx);
      this.slots.set(e.id, new SlotRuntime(this.ctx, e.id, e.type, effect));
      created.add(e.id);
    }
    for (const e of effects) this.slots.get(e.id)?.update(e, created.has(e.id));
    if (ids.join('|') !== this.order.join('|')) this.rewire(ids);
  }

  private rewire(ids: Id[]): void {
    this.input.disconnect();
    for (const rt of this.slots.values()) rt.output.disconnect();
    let prev: AudioNode = this.input;
    for (const id of ids) {
      const rt = this.slots.get(id);
      if (!rt) continue;
      prev.connect(rt.input);
      prev = rt.output;
    }
    prev.connect(this.fader);
    this.order = ids;
  }

  effect(slotId: Id): Effect | undefined {
    return this.slots.get(slotId)?.effect;
  }

  forEachEffect(fn: (e: Effect) => void): void {
    for (const rt of this.slots.values()) fn(rt.effect);
  }

  spectrum(out: Float32Array<ArrayBuffer>): void {
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.75;
      this.out.connect(this.analyser);
    }
    if (out.length === this.analyser.frequencyBinCount) {
      this.analyser.getFloatFrequencyData(out);
      return;
    }
    const tmp = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatFrequencyData(tmp);
    for (let i = 0; i < out.length; i++) out[i] = tmp[Math.floor((i * tmp.length) / out.length)] ?? -Infinity;
  }

  dispose(): void {
    for (const rt of this.slots.values()) rt.dispose();
    this.slots.clear();
    this.input.disconnect();
    this.fader.disconnect();
    this.panner.disconnect();
    this.muter.disconnect();
    this.out.disconnect();
    this.analyser?.disconnect();
    this.meter.dispose();
  }
}

/** Courbe de sécurité : transparente jusqu'à 0,9, puis arrondie vers 0,99 (-0,1 dBFS) au plus. */
function safetyCurve(): Float32Array<ArrayBuffer> {
  const n = 8193;
  const curve = new Float32Array(n);
  const knee = 0.9;
  const ceil = 0.99;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/** Entrée d'un canal de la console : volume, pan et mute/solo du canal (rampes de 10 ms). */
export class ChannelStrip {
  readonly input: GainNode;
  private panner: StereoPannerNode;
  private target = -1;
  private initialised = false;

  constructor(private ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.input.connect(this.panner);
  }

  sync(ch: Channel, audible: boolean, mixer: Mixer): void {
    const vol = audible ? clamp(ch.volume, 0, 1.25) : 0;
    const pan = clamp(ch.pan, -1, 1);
    if (!this.initialised) {
      this.input.gain.value = vol;
      this.panner.pan.value = pan;
      this.initialised = true;
    } else {
      smoothSet(this.input.gain, vol, this.ctx.currentTime);
      smoothSet(this.panner.pan, pan, this.ctx.currentTime);
    }
    const track = Number.isInteger(ch.mixerTrack) && ch.mixerTrack >= 0 && ch.mixerTrack < TRACK_COUNT ? ch.mixerTrack : 0;
    if (track !== this.target) {
      if (this.target >= 0) this.panner.disconnect();
      this.panner.connect(mixer.track(track).input);
      this.target = track;
    }
  }

  dispose(): void {
    this.input.disconnect();
    this.panner.disconnect();
  }
}

export class Mixer {
  private tracks: TrackStrip[] = [];
  private limiter: DynamicsCompressorNode;
  private clipper: WaveShaperNode;
  private bypassNode: GainNode;
  /** Point d'entrée après le maître (métronome, aperçus) : passe par la sécurité. */
  readonly post: GainNode;
  readonly output: GainNode;

  constructor(ctx: BaseAudioContext, host: EffectHost, safety = true) {
    for (let i = 0; i < TRACK_COUNT; i++) this.tracks.push(new TrackStrip(ctx, i, host));
    const master = this.track(0);
    for (let i = 1; i < TRACK_COUNT; i++) this.track(i).out.connect(master.input);

    this.post = ctx.createGain();
    this.output = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;
    const compensation = ctx.createGain();
    compensation.gain.value = compressorMakeupCompensation(-1, 20);
    this.clipper = ctx.createWaveShaper();
    this.clipper.curve = safetyCurve();
    this.bypassNode = ctx.createGain();
    master.out.connect(this.post);
    if (safety) this.post.connect(this.limiter).connect(compensation).connect(this.clipper).connect(this.output);
    else this.post.connect(this.bypassNode).connect(this.output);
    this.output.connect(ctx.destination);
  }

  track(i: number): TrackStrip {
    const t = this.tracks[i] ?? this.tracks[0];
    if (!t) throw new Error('Console non initialisée');
    return t;
  }

  sync(tracks: MixerTrack[]): void {
    const byIndex = new Map(tracks.map((t) => [t.index, t]));
    const anySolo = tracks.some((t) => t.index > 0 && t.solo);
    for (const strip of this.tracks) {
      const tr = byIndex.get(strip.index);
      const audible = strip.index === 0 ? !tr?.mute : !tr?.mute && (!anySolo || !!tr?.solo);
      strip.sync(tr, audible);
    }
  }

  setTempo(bpm: number): void {
    for (const t of this.tracks) t.forEachEffect((e) => e.setTempo?.(bpm));
  }

  onTransport(info: TransportInfo): void {
    for (const t of this.tracks) t.forEachEffect((e) => e.onTransport?.(info));
  }

  levels(now: number): { track: number; left: number; right: number; peakHold: number }[] {
    return this.tracks.map((t) => ({ track: t.index, ...t.meter.read(now) }));
  }

  /** Réduction de gain du limiteur de sécurité (dB, valeur négative ou nulle). */
  safetyReduction(): number {
    return this.limiter.reduction;
  }

  dispose(): void {
    for (const t of this.tracks) t.dispose();
    this.post.disconnect();
    this.limiter.disconnect();
    this.clipper.disconnect();
    this.bypassNode.disconnect();
    this.output.disconnect();
  }
}

