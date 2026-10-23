// Ce que l'interface attend du moteur (sous-ensemble de §D.3, src/engine/index.ts de Dev 1).
// Le vrai moteur le satisfait tel quel ; en attendant, moteurFactice() fait avancer le temps
// sans produire de son, pour développer et tester l'écran.

import { PPQ, type Id, type InstrumentType, type ParamValue, type Project } from '../project/types';

export type PlayMode = { kind: 'pattern'; patternId: Id } | { kind: 'morceau' };

export interface MoteurUi {
  resume(): Promise<void>;
  sync(project: Project): void;
  play(mode: PlayMode, fromTick?: number): void;
  stop(): void;
  pause(): void;
  isPlaying(): boolean;
  seek(tick: number): void;
  setMetronome(on: boolean): void;
  onPosition(cb: (tick: number) => void): () => void;
  noteOn(channelId: Id, pitch: number, velocity: number): void;
  noteOff(channelId: Id, pitch: number): void;
  levels(): { track: number; left: number; right: number; peakHold: number }[];
  spectrum?(track: number, out: Float32Array): void;
  frequencyResponse?(track: number, slotId: Id, freqs: Float32Array, magDb: Float32Array): void;
  gainReduction?(track: number, slotId: Id): number;
  /** Écoute d'un preset hors projet (navigateur). */
  preview?(type: InstrumentType, params: Record<string, ParamValue>, pitch: number, velocity: number, durationSec: number): void;
}

/** Fin du morceau en ticks : boucle si définie, sinon fin du dernier clip (au moins une mesure). */
export function finMorceau(p: Readonly<Project>): number {
  if (p.arrangement.loop) return p.arrangement.loop.end;
  let fin = 0;
  for (const c of p.arrangement.clips) fin = Math.max(fin, c.start + c.length);
  return Math.max(PPQ * 4, fin);
}

export function moteurFactice(): MoteurUi {
  let projet: Project | null = null;
  let mode: PlayMode = { kind: 'morceau' };
  let lecture = false;
  let origine = 0;      // performance.now() du tick 0 virtuel
  let position = 0;
  let raf = 0;
  const ecouteurs = new Set<(t: number) => void>();
  const ticksParMs = () => ((projet?.bpm ?? 130) * PPQ) / 60000;

  const longueur = (): { debut: number; fin: number } => {
    if (!projet) return { debut: 0, fin: PPQ * 16 };
    if (mode.kind === 'pattern') {
      const id = mode.patternId;
      return { debut: 0, fin: projet.patterns.find(pt => pt.id === id)?.lengthTicks ?? PPQ * 16 };
    }
    const boucle = projet.arrangement.loop;
    return boucle ? { debut: boucle.start, fin: boucle.end } : { debut: 0, fin: finMorceau(projet) };
  };
  const emettre = () => { for (const e of ecouteurs) e(position); };
  const boucle = () => {
    const { debut, fin } = longueur();
    let t = (performance.now() - origine) * ticksParMs();
    if (t >= fin) {
      const l = Math.max(1, fin - debut);
      t = debut + ((t - debut) % l);
      origine = performance.now() - t / ticksParMs();
    }
    position = t;
    emettre();
    raf = requestAnimationFrame(boucle);
  };

  return {
    resume: async () => undefined,
    sync(p) {
      // Garde la position quand le tempo change.
      if (lecture && projet && projet.bpm !== p.bpm) { projet = p; origine = performance.now() - position / ticksParMs(); return; }
      projet = p;
    },
    play(m, depuis) {
      mode = m;
      position = depuis ?? position;
      origine = performance.now() - position / ticksParMs();
      lecture = true;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(boucle);
    },
    stop() { lecture = false; cancelAnimationFrame(raf); position = mode.kind === 'morceau' && projet?.arrangement.loop ? projet.arrangement.loop.start : 0; emettre(); },
    pause() { lecture = false; cancelAnimationFrame(raf); emettre(); },
    isPlaying: () => lecture,
    seek(t) { position = Math.max(0, t); origine = performance.now() - position / ticksParMs(); emettre(); },
    setMetronome: () => undefined,
    onPosition(cb) { ecouteurs.add(cb); return () => { ecouteurs.delete(cb); }; },
    noteOn: () => undefined,
    noteOff: () => undefined,
    levels: () => Array.from({ length: 13 }, (_, track) => ({ track, left: 0, right: 0, peakHold: 0 })),
  };
}
