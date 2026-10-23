import { describe, expect, it } from 'vitest';
import { adsrValueAt, VoicePool, type Voice } from '../../src/engine/voices';

class FakeVoice implements Voice {
  end = Infinity;
  killed: number | null = null;
  disposed = false;
  constructor(readonly pitch: number, readonly start: number) {}
  release(t: number) { this.end = Math.min(this.end, t + 0.1); }
  kill(t: number, fade: number) { this.killed = t; this.end = Math.min(this.end, t + fade); }
  dispose() { this.disposed = true; }
}

describe('polyphonie', () => {
  it('vole la plus ancienne voix au-delà de 16', () => {
    const pool = new VoicePool(16);
    const voices = Array.from({ length: 17 }, (_, k) => new FakeVoice(60 + k, k * 0.01));
    voices.forEach((v) => pool.add(v, v.start));
    expect(voices[0]!.killed).toBeCloseTo(0.16, 9);
    expect(voices.slice(1).every((v) => v.killed === null)).toBe(true);
  });

  it('ne vole pas une voix déjà terminée ou programmée plus tard', () => {
    const pool = new VoicePool(2);
    const a = new FakeVoice(60, 0); a.release(0.5);
    const b = new FakeVoice(62, 1);
    const c = new FakeVoice(64, 1.2);
    [a, b, c].forEach((v) => pool.add(v, v.start));
    expect(a.killed).toBeNull();
    expect(b.killed).toBeNull();
  });

  it('mode mono : chaque note coupe la précédente', () => {
    const pool = new VoicePool(1);
    const a = new FakeVoice(60, 0);
    const b = new FakeVoice(62, 0.2);
    pool.add(a, 0);
    expect(pool.latest(0.2)).toBe(a);
    pool.add(b, 0.2);
    expect(a.killed).toBeCloseTo(0.2, 9);
  });

  it('10 000 notes : les voix terminées sont libérées', () => {
    const pool = new VoicePool(16);
    const all: FakeVoice[] = [];
    for (let k = 0; k < 10000; k++) {
      const t = k * 0.01;
      const v = new FakeVoice(60, t);
      v.release(t + 0.05);
      pool.add(v, t);
      all.push(v);
      pool.prune(t);
    }
    expect(pool.size).toBeLessThan(40);
    expect(all.filter((v) => v.disposed).length).toBeGreaterThan(9950);
  });
});

describe('enveloppe', () => {
  it('monte, descend vers le maintien', () => {
    const env = { a: 0.01, d: 0.3, s: 0.5, r: 0.2 };
    expect(adsrValueAt(env, 0)).toBe(0);
    expect(adsrValueAt(env, 0.005)).toBeCloseTo(0.5, 9);
    expect(adsrValueAt(env, 0.01)).toBeCloseTo(1, 9);
    expect(adsrValueAt(env, 0.31)).toBeCloseTo(0.5 + 0.5 * Math.exp(-3), 6);
    expect(adsrValueAt(env, 5)).toBeCloseTo(0.5, 6);
  });
});
