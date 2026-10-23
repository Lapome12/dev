// Commandes de lecture partagées par la barre de transport et les raccourcis.

import { PPQ } from '../project/types';
import type { Contexte } from './contexte';
import type { PlayMode } from './moteur';

export function modeCourant(ctx: Contexte): PlayMode {
  const u = ctx.ui.get();
  return u.mode === 'pattern' ? { kind: 'pattern', patternId: u.patternId } : { kind: 'morceau' };
}

/** Espace : lance, ou arrête et revient au début. */
export function basculerLecture(ctx: Contexte): void {
  void ctx.moteur.resume();
  if (ctx.moteur.isPlaying()) ctx.moteur.stop();
  else ctx.moteur.play(modeCourant(ctx));
}

export function pause(ctx: Contexte): void {
  if (ctx.moteur.isPlaying()) ctx.moteur.pause();
  else { void ctx.moteur.resume(); ctx.moteur.play(modeCourant(ctx)); }
}

export function arreter(ctx: Contexte): void { ctx.moteur.stop(); }

export function basculerMode(ctx: Contexte): void {
  const lecture = ctx.moteur.isPlaying();
  ctx.ui.set({ mode: ctx.ui.get().mode === 'pattern' ? 'morceau' : 'pattern' });
  if (lecture) { ctx.moteur.stop(); ctx.moteur.play(modeCourant(ctx), 0); }
}

/** Relance la lecture du pattern courant quand on en change pendant la lecture en mode pattern. */
export function suivrePattern(ctx: Contexte): void {
  if (ctx.moteur.isPlaying() && ctx.ui.get().mode === 'pattern') ctx.moteur.play(modeCourant(ctx));
}

/** Position en « mesure:temps:pas » (1.1.1 au début), 4/4. */
export function formaterPosition(tick: number): string {
  const t = Math.max(0, Math.floor(tick));
  const mesure = Math.floor(t / (PPQ * 4)) + 1;
  const temps = Math.floor((t % (PPQ * 4)) / PPQ) + 1;
  const pas = Math.floor((t % PPQ) / (PPQ / 4)) + 1;
  return `${String(mesure).padStart(3, ' ')}:${temps}:${pas}`;
}
