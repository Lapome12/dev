// Page de test du rendu hors ligne (chargée dans Chromium par render.spec.ts).
import { renderBuffer, renderWav } from '../../src/engine/render';
import { defaultParams } from '../../src/engine/params';
import { findTemplate } from '../../src/project/templates';
import type { EffectSlot, EffectType, InstrumentType, Project } from '../../src/project/types';
import { channel, note, project } from './helpers';

function fx(id: string, type: EffectType, mix = 1, params = {}): EffectSlot {
  return { id, type, bypass: false, mix, params: { ...defaultParams(type), ...params } };
}

/** Projet de test : les 5 instruments sur 5 tranches, les 10 effets, 2 clips dans l'arrangement. */
export function testProject() {
  const types: InstrumentType[] = ['frappe', 'trio', 'prisme', 'corde', 'echantillon'];
  const p = project({
    bpm: 128, swing: 0.2,
    channels: types.map((t, i) => channel(`c${i}`, { instrument: { type: t, params: defaultParams(t) }, mixerTrack: i + 1, volume: 0.8 })),
  });
  const pat = p.patterns[0]!;
  pat.lengthTicks = 768;
  pat.notes = {
    c0: [0, 192, 384, 576].map((t) => note(t, 36)).concat([96, 288, 480, 672].map((t) => note(t, 38)), Array.from({ length: 16 }, (_, k) => note(k * 48, 42, 24, 0.6))),
    c1: [note(0, 36, 180), note(192, 36, 180), note(384, 43, 180), note(576, 41, 180)],
    c2: [note(0, 72, 90), note(96, 76, 90), note(192, 79, 90), note(288, 84, 90)],
    c3: [note(384, 60, 48), note(432, 64, 48), note(480, 67, 48), note(528, 72, 48)],
    c4: [note(0, 60, 380), note(384, 67, 380)],
  };
  p.mixer[1]!.effects = [fx('f1', 'compresseur'), fx('f2', 'eq', 1, { b1gain: 3 })];
  p.mixer[2]!.effects = [fx('f3', 'filtre', 1, { lfoquantite: 1.5 }), fx('f4', 'distorsion', 0.3), fx('f5', 'pompe')];
  p.mixer[3]!.effects = [fx('f6', 'chorus', 0.5), fx('f7', 'delai', 0.3)];
  p.mixer[4]!.effects = [fx('f8', 'reverbe', 0.35)];
  p.mixer[5]!.effects = [fx('f9', 'bitcrusher', 0.5, { bits: 8 })];
  p.mixer[0]!.effects = [fx('f10', 'limiteur')];
  p.arrangement.clips = [
    { id: 'k1', trackId: 't1', patternId: 'p1', start: 0, length: 768, offset: 0 },
    { id: 'k2', trackId: 't1', patternId: 'p1', start: 768, length: 1152, offset: 0 },
  ];
  return p;
}

async function analyse(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const v = new DataView(bytes.buffer);
  const bits = v.getUint16(34, true);
  const sampleRate = v.getUint32(24, true);
  const dataSize = v.getUint32(40, true);
  const n = dataSize / (bits / 8);
  let peak = 0;
  let sum = 0;
  const samples = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const o = 44 + i * (bits / 8);
    const s = bits === 16 ? v.getInt16(o, true) / 32768 : ((v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16)) / 8388608);
    samples[i] = Math.round(s * (bits === 16 ? 32768 : 8388608));
    peak = Math.max(peak, Math.abs(s));
    sum += s * s;
  }
  return { samples, bits, sampleRate, seconds: n / 2 / sampleRate, peak, rms: Math.sqrt(sum / n), riff: String.fromCharCode(...bytes.slice(0, 4)), type: blob.type };
}

declare global {
  interface Window {
    frequenceRender: (o: { mode: 'pattern' | 'morceau'; bitDepth: 16 | 24; sampleRate: 44100 | 48000; normalize: boolean }) => Promise<unknown>;
    frequenceBuffer: (p: Project, tailSec: number) => Promise<number[][]>;
    frequenceTemplate: (id: string) => Promise<{ mean: number[]; peak: number; seconds: number }>;
  }
}

window.frequenceRender = async (o) => {
  const progress: number[] = [];
  const once = async () => analyse(await renderWav(testProject(), new Map(), {
    mode: o.mode === 'pattern' ? { kind: 'pattern', patternId: 'p1' } : { kind: 'morceau' },
    sampleRate: o.sampleRate, bitDepth: o.bitDepth, tailSec: 1.5, normalize: o.normalize,
  }, (r) => progress.push(r)));
  const a = await once();
  const b = await once();
  // Écart entre deux rendus, en pas de quantification (voir render.spec.ts).
  let maxDiff = 0;
  let sameLength = a.samples.length === b.samples.length;
  for (let i = 0; sameLength && i < a.samples.length; i++) maxDiff = Math.max(maxDiff, Math.abs((a.samples[i] ?? 0) - (b.samples[i] ?? 0)));
  const { samples: _ignored, ...rest } = a;
  return { ...rest, progress, sameLength, maxDiff };
};

/** Rendu brut (sans limiteur de sécurité) du pattern p1 d'un projet construit côté test. */
window.frequenceBuffer = async (p, tailSec) => {
  const b = await renderBuffer(p, new Map(), {
    mode: { kind: 'pattern', patternId: 'p1' }, sampleRate: 44100, bitDepth: 16, tailSec, normalize: true,
  });
  return [Array.from(b.getChannelData(0)), Array.from(b.getChannelData(1))];
};

/** Rendu d'un modèle de projet en entier (morceau, sons compris) : moyenne par canal et crête. */
window.frequenceTemplate = async (id) => {
  // Les modèles créent des identifiants avec crypto.randomUUID, absent d'une page about:blank.
  if (typeof crypto.randomUUID !== 'function') {
    let n = 0;
    crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` as ReturnType<Crypto['randomUUID']>;
  }
  const song = findTemplate(id)!.create();
  const decoder = new OfflineAudioContext(1, 1, 44100);
  const samples = new Map<string, AudioBuffer>();
  for (const [sid, data] of song.samples) samples.set(sid, await decoder.decodeAudioData(data.slice(0)));
  const b = await renderBuffer(song.project, samples, { mode: { kind: 'morceau' }, sampleRate: 44100, bitDepth: 16, tailSec: 2, normalize: false });
  const mean: number[] = [];
  let peak = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    let sum = 0;
    for (let i = 0; i < d.length; i++) {
      sum += d[i]!;
      peak = Math.max(peak, Math.abs(d[i]!));
    }
    mean.push(sum / d.length);
  }
  return { mean, peak, seconds: b.length / b.sampleRate };
};
