import { describe, expect, it } from 'vitest';
import { encodeWav, peakOf } from '../../src/engine/wav';

describe('WAV', () => {
  it('en-tête RIFF de 44 octets, PCM 16 bits entrelacé', () => {
    const w = encodeWav([new Float32Array([0, 1, -1]), new Float32Array([0.5, -0.5, 2])], 44100, 16);
    const v = new DataView(w.buffer);
    const s = (o: number) => String.fromCharCode(...w.slice(o, o + 4));
    expect(s(0)).toBe('RIFF');
    expect(s(8)).toBe('WAVE');
    expect(s(12)).toBe('fmt ');
    expect(s(36)).toBe('data');
    expect(v.getUint32(4, true)).toBe(w.length - 8);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(28, true)).toBe(44100 * 4);
    expect(v.getUint16(32, true)).toBe(4);
    expect(v.getUint32(40, true)).toBe(12);
    expect([0, 1, 2, 3, 4, 5].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 16384, 32767, -16383, -32767, 32767]);
  });

  it('24 bits, petit-boutiste, valeurs écrêtées', () => {
    const w = encodeWav([new Float32Array([1, -1, 0.5, NaN])], 48000, 24);
    const v = new DataView(w.buffer);
    const read = (i: number) => v.getUint8(44 + i * 3) | (v.getUint8(45 + i * 3) << 8) | (v.getInt8(46 + i * 3) << 16);
    expect(v.getUint16(34, true)).toBe(24);
    expect([0, 1, 2, 3].map(read)).toEqual([8388607, -8388607, 4194304, 0]);
  });

  it('crête', () => {
    expect(peakOf([new Float32Array([0.1, -0.7]), new Float32Array([0.3])])).toBeCloseTo(0.7, 6);
  });
});
