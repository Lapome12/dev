// Interface commune des instruments et voix génériques faites de nœuds Web Audio.
import type { ParamValue } from '../../project/types';
import type { PluginDef } from '../params';
import { scheduleAttack, scheduleRelease, type Adsr, type Voice } from '../voices';

export interface NoteRequest {
  pitch: number;       // numéro MIDI de la note jouée
  transpose: number;   // demi-tons ajoutés (hauteur générale du projet)
  velocity: number;    // 0..1
  time: number;        // instant de départ (horloge du contexte)
  glideFrom?: number;  // hauteur de la voix précédente (portamento en mode mono)
  legato?: boolean;    // mono : la note précédente est encore tenue (les deux notes se chevauchent)
}

export interface InstrumentHost {
  readonly ctx: BaseAudioContext;
  sample(id: string): AudioBuffer | undefined;
}

export interface Instrument {
  readonly output: AudioNode;
  /** Réglages déjà ramenés dans les bornes et complétés (resolveParams). */
  setParams(p: Record<string, ParamValue>): void;
  /** 16 en polyphonique, 1 en mono. */
  polyphony(): number;
  noteOn(n: NoteRequest): Voice;
  dispose(): void;
}

export interface InstrumentModule {
  def: PluginDef;
  create(host: InstrumentHost): Instrument;
}

interface EnvTarget { param: AudioParam; env: Adsr; peak: number; base: number; t0: number }

/**
 * Voix générique : des sources, des nœuds, des enveloppes, et une sortie dont le gain
 * sert uniquement au fondu de coupure (vol de voix, arrêt).
 */
export class NodeVoice implements Voice {
  end = Infinity;
  private stopAt = Infinity;
  private envs: EnvTarget[] = [];
  private disposed = false;
  private cleanups: (() => void)[] = [];
  readonly out: GainNode;

  constructor(
    ctx: BaseAudioContext,
    readonly pitch: number,
    readonly start: number,
    destination: AudioNode,
    private sources: AudioScheduledSourceNode[] = [],
    private nodes: AudioNode[] = [],
  ) {
    this.out = ctx.createGain();
    this.out.connect(destination);
  }

  addSource(s: AudioScheduledSourceNode, offset = 0): void {
    this.sources.push(s);
    if (s instanceof AudioBufferSourceNode) s.start(this.start, offset);
    else s.start(this.start);
  }

  addNodes(...n: AudioNode[]): void {
    this.nodes.push(...n);
  }

  /** Action à la libération (ex. débrancher un LFO partagé de cette voix). */
  onDispose(fn: () => void): void {
    this.cleanups.push(fn);
  }

  /** Enveloppe ADSR sur un paramètre : attaque programmée tout de suite, relâchement à la fin de la note. */
  envelope(param: AudioParam, env: Adsr, peak: number, base = 0, t0 = this.start): void {
    scheduleAttack(param, t0, env, peak, base);
    this.envs.push({ param, env, peak, base, t0 });
  }

  /** Voix sans relâchement (percussions) : se termine seule à `end`. */
  endAt(time: number): void {
    this.end = time;
    this.stopSources(time + 0.01);
  }

  release(time: number): void {
    if (this.end !== Infinity && this.envs.length === 0) return;
    let end = time;
    for (const e of this.envs) end = Math.max(end, scheduleRelease(e.param, e.t0, time, e.env, e.peak, e.base));
    if (this.envs.length === 0) end = time + 0.01;
    this.end = Math.min(this.end, end);
    this.stopSources(this.end + 0.01);
  }

  kill(time: number, fade: number): void {
    const t = Math.max(time, this.start);
    if (t >= this.end) return;
    this.out.gain.setValueAtTime(1, t);
    this.out.gain.linearRampToValueAtTime(0, t + fade);
    this.end = t + fade;
    this.stopSources(this.end + 0.005);
  }

  private stopSources(time: number): void {
    if (time >= this.stopAt) return;
    this.stopAt = time;
    for (const s of this.sources) {
      try {
        s.stop(Math.max(time, this.start));
      } catch {
        // source déjà arrêtée
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // déjà arrêtée
      }
      s.disconnect();
    }
    for (const n of this.nodes) n.disconnect();
    for (const fn of this.cleanups) fn();
    this.out.disconnect();
  }
}

export function safeDisconnect(from: AudioNode, to: AudioParam | AudioNode): void {
  try {
    from.disconnect(to as AudioParam);
  } catch {
    // déjà débranché
  }
}
