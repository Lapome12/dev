// Utilitaires liés au contexte audio : création, conversions, bruit à graine fixe, rampes sans clic.

export function createAudioContext(): AudioContext {
  return new AudioContext({ latencyHint: 'interactive' });
}

export function midiToFreq(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(g: number): number {
  return g > 0 ? 20 * Math.log10(g) : -Infinity;
}

/** Générateur pseudo-aléatoire à graine fixe (mulberry32) : deux rendus donnent le même fichier. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** 2 s de bruit blanc stéréo, toujours le même pour un contexte donné (à lire en boucle). */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    const length = Math.floor(ctx.sampleRate * 2);
    buf = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const rnd = seededRandom(0x5eed + c);
      const data = buf.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = rnd() * 2 - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** Rampe douce (~10 ms) vers une valeur : volume, pan, mute… sans clic. */
export function smoothSet(param: AudioParam, value: number, time: number, durationSec = 0.01): void {
  param.setTargetAtTime(value, time, durationSec / 3);
}

/** Fixe une valeur tant que rien ne joue (création d'un nœud), sans automatisation. */
export function setNow(param: AudioParam, value: number): void {
  param.value = value;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
