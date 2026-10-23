// Voix, polyphonie (16 voix par canal, vol de la plus ancienne) et enveloppes ADSR sans clic.

/** Durées minimales imposées par le §E du plan. */
export const MIN_EDGE_SEC = 0.003;
export const STEAL_FADE_SEC = 0.005;
export const STOP_FADE_SEC = 0.015;
export const MAX_VOICES = 16;

export interface Voice {
  readonly pitch: number;
  readonly start: number;
  /** Instant où la voix se tait complètement (Infinity tant qu'elle n'est pas relâchée). */
  readonly end: number;
  /** Relâche la note à `time` (phase de relâchement de l'enveloppe). */
  release(time: number): void;
  /** Coupe la voix par un fondu de `fade` secondes à partir de `time` (vol de voix, arrêt). */
  kill(time: number, fade: number): void;
  /** Déconnecte tous les nœuds de la voix. */
  dispose(): void;
}

/**
 * Ensemble des voix d'un canal. Les voix sont programmées à l'avance : une voix « occupe »
 * l'intervalle [start, end[, et le vol ne concerne que les voix qui se chevauchent à l'instant donné.
 */
export class VoicePool {
  private voices: Voice[] = [];

  constructor(public max: number = MAX_VOICES) {}

  get size(): number {
    return this.voices.length;
  }

  /** Ajoute une voix démarrant à `time`, en volant la plus ancienne si la limite est atteinte. */
  add(voice: Voice, time: number): void {
    const overlapping = this.voices.filter((v) => v.start <= time && v.end > time);
    overlapping.sort((a, b) => a.start - b.start);
    let excess = overlapping.length + 1 - this.max;
    for (const v of overlapping) {
      if (excess <= 0) break;
      v.kill(time, STEAL_FADE_SEC);
      excess--;
    }
    this.voices.push(voice);
  }

  /** La dernière voix ajoutée encore active à `time` (pour le portamento en mode mono). */
  latest(time: number): Voice | undefined {
    let best: Voice | undefined;
    for (const v of this.voices) if (v.start <= time && v.end > time && (!best || v.start >= best.start)) best = v;
    return best;
  }

  /** Libère les voix terminées avant `now` (évite la fuite de nœuds). */
  prune(now: number, margin = 0.05): void {
    const keep: Voice[] = [];
    for (const v of this.voices) {
      if (v.end + margin < now) v.dispose();
      else keep.push(v);
    }
    this.voices = keep;
  }

  /** Coupe toutes les voix (arrêt, pause, saut). */
  killAll(time: number, fade = STOP_FADE_SEC): void {
    for (const v of this.voices) if (v.end > time) v.kill(time, fade);
  }

  disposeAll(): void {
    for (const v of this.voices) v.dispose();
    this.voices = [];
  }
}

export interface Adsr { a: number; d: number; s: number; r: number } // secondes, s entre 0 et 1

/** Lit une ADSR décrite en millisecondes dans des réglages (préfixe « a », « d », « s », « r »). */
export function adsrFrom(p: Record<string, unknown>, prefix: string): Adsr {
  const ms = (k: string, def: number): number => {
    const v = p[prefix + k];
    return (typeof v === 'number' ? v : def) / 1000;
  };
  const s = p[prefix + 's'];
  return {
    a: Math.max(MIN_EDGE_SEC, ms('a', 5)),
    d: Math.max(0.001, ms('d', 200)),
    s: typeof s === 'number' ? Math.min(1, Math.max(0, s)) : 0.8,
    r: Math.max(MIN_EDGE_SEC, ms('r', 100)),
  };
}

/** Valeur de l'enveloppe `dt` secondes après le début (sans relâchement). */
export function adsrValueAt(env: Adsr, dt: number): number {
  if (dt <= 0) return 0;
  if (dt < env.a) return dt / env.a;
  return env.s + (1 - env.s) * Math.exp(-(dt - env.a) / (env.d / 3));
}

/** Programme l'attaque et le déclin : de `base` à `base + peak`, puis vers `base + peak * s`. */
export function scheduleAttack(param: AudioParam, t0: number, env: Adsr, peak: number, base = 0): void {
  param.setValueAtTime(base, t0);
  param.linearRampToValueAtTime(base + peak, t0 + env.a);
  param.setTargetAtTime(base + peak * env.s, t0 + env.a, env.d / 3);
}

/**
 * Programme le relâchement à `tr` et renvoie l'instant où le son est éteint (~ -60 dB).
 * `t0` est le début de la note (sert à calculer la valeur atteinte si le navigateur ne sait pas « tenir »).
 */
export function scheduleRelease(param: AudioParam, t0: number, tr: number, env: Adsr, peak: number, base = 0): number {
  const at = Math.max(tr, t0);
  const p = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof p.cancelAndHoldAtTime === 'function') {
    p.cancelAndHoldAtTime(at);
  } else {
    param.cancelScheduledValues(at);
    param.setValueAtTime(base + peak * adsrValueAt(env, at - t0), at);
  }
  param.setTargetAtTime(base, at, env.r / 7);
  return at + env.r;
}
