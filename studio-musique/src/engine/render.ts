// Export WAV : rejoue le projet dans un OfflineAudioContext avec exactement le même moteur
// que la lecture (instruments, console, effets, ordonnanceur).
import type { Id, Project } from '../project/types';
import { AudioEngine } from './index';
import { loopRange, secondsPerTick, songEnd, type PlayMode } from './transport';
import { encodeWav, peakOf } from './wav';

export interface RenderOptions { mode: PlayMode; sampleRate: 44100 | 48000; bitDepth: 16 | 24; tailSec: number; normalize: boolean }

/** Crête visée par la normalisation : -0,3 dBFS. */
export const NORMALIZE_PEAK = Math.pow(10, -0.3 / 20);
const PROGRESS_STEPS = 20;

/** Longueur musicale exportée, en ticks : le pattern une fois, ou le morceau jusqu'à la fin du dernier clip. */
export function renderTicks(project: Readonly<Project>, mode: PlayMode): number {
  return mode.kind === 'pattern' ? loopRange(project, mode).end : songEnd(project);
}

/** Rend le projet en audio (sans encodage). */
export async function renderBuffer(
  project: Project, samples: Map<Id, AudioBuffer>, o: RenderOptions, onProgress?: (ratio: number) => void,
): Promise<AudioBuffer> {
  // L'export couvre tout le morceau : la boucle de l'arrangement ne sert qu'à l'écoute.
  const p: Project = { ...project, arrangement: { ...project.arrangement, loop: null } };
  const musicSec = renderTicks(p, o.mode) * secondsPerTick(p.bpm);
  const totalSec = musicSec + Math.max(0, o.tailSec);
  const length = Math.max(1, Math.ceil(totalSec * o.sampleRate));
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate: o.sampleRate });
  const engine = new AudioEngine(ctx, { safetyLimiter: !o.normalize, realtime: false, startDelay: 0 });
  for (const [id, buf] of samples) engine.setSampleAudio(id, buf);
  engine.sync(p);
  engine.play(o.mode, 0);
  // Tout est programmé d'avance, en s'arrêtant juste avant la fin : pas de deuxième tour de boucle.
  engine.scheduleUntil(musicSec - 1e-6);

  if (onProgress) {
    for (let k = 1; k < PROGRESS_STEPS; k++) {
      const t = (totalSec * k) / PROGRESS_STEPS;
      ctx.suspend(t).then(() => {
        onProgress(k / PROGRESS_STEPS);
        void ctx.resume();
      }, () => undefined);
    }
  }
  const out = await ctx.startRendering();
  engine.dispose();
  onProgress?.(1);
  return out;
}

export async function renderWav(
  project: Project, samples: Map<Id, AudioBuffer>, o: RenderOptions, onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const buf = await renderBuffer(project, samples, o, onProgress);
  const channels = [buf.getChannelData(0), buf.getChannelData(1)];
  if (o.normalize) {
    const peak = peakOf(channels);
    if (peak > 0) {
      const g = NORMALIZE_PEAK / peak;
      for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] = (ch[i] ?? 0) * g;
    }
  }
  return new Blob([encodeWav(channels, o.sampleRate, o.bitDepth)], { type: 'audio/wav' });
}
