// Vu-mètres : crête gauche/droite par tranche, avec maintien de la crête pendant 1,5 s.

export const PEAK_HOLD_SEC = 1.5;
const PEAK_FALL_PER_SEC = 0.6;     // descente de la crête maintenue, en amplitude par seconde

export class StereoMeter {
  private splitter: ChannelSplitterNode;
  private left: AnalyserNode;
  private right: AnalyserNode;
  private buf: Float32Array<ArrayBuffer>;
  private hold = 0;
  private holdTime = 0;
  private lastTime = 0;

  constructor(ctx: BaseAudioContext, source: AudioNode) {
    this.splitter = ctx.createChannelSplitter(2);
    this.left = ctx.createAnalyser();
    this.right = ctx.createAnalyser();
    this.left.fftSize = this.right.fftSize = 1024;
    this.buf = new Float32Array(1024);
    source.connect(this.splitter);
    this.splitter.connect(this.left, 0);
    this.splitter.connect(this.right, 1);
  }

  private peak(a: AnalyserNode): number {
    a.getFloatTimeDomainData(this.buf);
    let m = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = Math.abs(this.buf[i] ?? 0);
      if (v > m) m = v;
    }
    return m;
  }

  read(now: number): { left: number; right: number; peakHold: number } {
    const left = this.peak(this.left);
    const right = this.peak(this.right);
    const top = Math.max(left, right);
    const dt = Math.max(0, now - this.lastTime);
    this.lastTime = now;
    if (top >= this.hold) {
      this.hold = top;
      this.holdTime = now;
    } else if (now - this.holdTime > PEAK_HOLD_SEC) {
      this.hold = Math.max(top, this.hold - PEAK_FALL_PER_SEC * dt);
    }
    return { left, right, peakHold: this.hold };
  }

  dispose(): void {
    this.splitter.disconnect();
    this.left.disconnect();
    this.right.disconnect();
  }
}
