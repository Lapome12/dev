// LFO synchronisé au tempo et calé sur les temps du morceau (filtre, pompe).
import { PPQ } from '../../project/types';
import type { TransportInfo } from './effect';

export class SyncedLfo {
  /** Sortie à brancher (via un gain de profondeur) sur un paramètre audio. */
  readonly output: GainNode;
  private osc: OscillatorNode | null = null;
  private beats = 1;
  private bpm = 120;
  private type: OscillatorType = 'sine';
  private wave: PeriodicWave | null = null;

  constructor(private ctx: BaseAudioContext) {
    this.output = ctx.createGain();
    this.restart(ctx.currentTime);
  }

  private freq(): number {
    return this.bpm / 60 / this.beats;
  }

  /** Démarre un nouvel oscillateur à l'instant `at` (phase 0) et arrête l'ancien au même instant. */
  private restart(at: number): void {
    const old = this.osc;
    const osc = this.ctx.createOscillator();
    if (this.wave) osc.setPeriodicWave(this.wave);
    else osc.type = this.type;
    osc.frequency.value = this.freq();
    osc.connect(this.output);
    osc.start(at);
    if (old) {
      old.stop(at);
      old.onended = () => old.disconnect();
    }
    this.osc = osc;
  }

  setShape(type: OscillatorType | PeriodicWave): void {
    if (typeof type === 'string') {
      const t = type as OscillatorType;
      if (t === this.type && !this.wave) return;
      this.type = t;
      this.wave = null;
      if (this.osc) this.osc.type = t;
    } else {
      this.wave = type;
      this.osc?.setPeriodicWave(type);
    }
  }

  /** Durée d'un cycle, en noires. */
  setBeats(beats: number): void {
    this.beats = Math.max(1 / 16, beats);
    this.osc?.frequency.setTargetAtTime(this.freq(), this.ctx.currentTime, 0.01);
  }

  setTempo(bpm: number): void {
    this.bpm = bpm;
    this.osc?.frequency.setTargetAtTime(this.freq(), this.ctx.currentTime, 0.01);
  }

  /** À la mise en lecture, recale la phase sur le prochain début de cycle du morceau. */
  onTransport(t: TransportInfo): void {
    this.bpm = t.bpm;
    if (!t.playing) return;
    const beatSec = 60 / t.bpm;
    const posBeats = t.anchorTick / PPQ;
    const toNext = (this.beats - (posBeats % this.beats)) % this.beats;
    let at = t.anchorTime + toNext * beatSec;
    const now = this.ctx.currentTime;
    while (at < now) at += this.beats * beatSec;
    this.restart(at);
  }

  dispose(): void {
    try {
      this.osc?.stop();
    } catch {
      // déjà arrêté
    }
    this.osc?.disconnect();
    this.output.disconnect();
  }
}
