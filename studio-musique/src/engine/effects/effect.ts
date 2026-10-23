// Interface commune des effets de la console.
import type { ParamValue } from '../../project/types';
import type { PluginDef } from '../params';

/** Repère de l'horloge, pour les effets synchronisés au tempo (pompe, LFO). */
export interface TransportInfo { playing: boolean; bpm: number; anchorTime: number; anchorTick: number }

export interface EffectHost {
  readonly ctx: BaseAudioContext;
  bpm(): number;
}

export interface Effect {
  readonly input: AudioNode;
  readonly output: AudioNode;
  /** Réglages déjà ramenés dans les bornes et complétés (resolveParams). */
  setParams(p: Record<string, ParamValue>): void;
  setTempo?(bpm: number): void;
  onTransport?(t: TransportInfo): void;
  frequencyResponse?(freqs: Float32Array, magDb: Float32Array): void;
  gainReduction?(): number;
  dispose(): void;
}

export interface EffectModule {
  def: PluginDef;
  create(host: EffectHost): Effect;
}
