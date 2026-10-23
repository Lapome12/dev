// Réponse impulsionnelle générée pour la réverbe : bruit stéréo à décroissance exponentielle,
// de plus en plus sombre avec le temps. Graine fixe : deux rendus sont identiques.
import { seededRandom } from './context';

export interface ImpulseOptions { seconds: number; brillance: number }

/** Calcule les deux canaux (exporté pour les tests). */
export function impulseData(sampleRate: number, o: ImpulseOptions): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const length = Math.max(1, Math.round(sampleRate * Math.min(12, o.seconds * 1.1)));
  const out: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] = [new Float32Array(length), new Float32Array(length)];
  // Coupure du filtre qui se ferme pendant la queue : d'environ 18 kHz (brillant) à 1 kHz (sombre).
  const startHz = 3000 + 15000 * o.brillance;
  const endHz = 400 + 4000 * o.brillance;
  for (let c = 0; c < 2; c++) {
    const rnd = seededRandom(0x4e7b + c * 7919);
    const data = out[c]!;
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const progress = Math.min(1, t / o.seconds);
      const hz = startHz * Math.pow(endHz / startHz, progress);
      const a = 1 - Math.exp((-2 * Math.PI * hz) / sampleRate);
      lp += a * (rnd() * 2 - 1 - lp);
      const decay = Math.exp((-6.91 * t) / o.seconds);       // -60 dB au bout de « taille » secondes
      const fadeIn = Math.min(1, t / 0.004);
      data[i] = lp * decay * fadeIn;
    }
    const fade = Math.min(length, Math.round(sampleRate * 0.05));
    for (let i = 0; i < fade; i++) data[length - 1 - i] = (data[length - 1 - i] ?? 0) * (i / fade);
  }
  return out;
}

export function createImpulse(ctx: BaseAudioContext, o: ImpulseOptions): AudioBuffer {
  const [l, r] = impulseData(ctx.sampleRate, o);
  const buf = ctx.createBuffer(2, l.length, ctx.sampleRate);
  buf.copyToChannel(l, 0);
  buf.copyToChannel(r, 1);
  return buf;
}
