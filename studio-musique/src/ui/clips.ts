// Opérations pures sur les clips de l'arrangement. Testées dans test/ui/clips.test.ts.

import type { Clip, Id } from '../project/types';
import { nouvelId } from './notes';

/** Coupe un clip à `tick` ; renvoie la seconde moitié ou null si la coupe tombe hors du clip. */
export function decouperClip(clips: Clip[], id: Id, tick: number): Clip | null {
  const c = clips.find(x => x.id === id);
  if (!c || tick <= c.start || tick >= c.start + c.length) return null;
  const avance = tick - c.start;
  const seconde: Clip = { ...c, id: nouvelId(), start: tick, length: c.length - avance, offset: c.offset + avance };
  c.length = avance;
  clips.push(seconde);
  return seconde;
}

/** Rogne le début d'un clip : le contenu reste en place dans le temps (l'offset suit). */
export function rognerDebut(c: Clip, nouveauDebut: number, longueurMin: number): void {
  const fin = c.start + c.length;
  const debut = Math.min(Math.max(0, nouveauDebut, c.start - c.offset), fin - longueurMin);
  c.offset += debut - c.start;
  c.length = fin - debut;
  c.start = debut;
}

/** Position dans le pattern (modulo sa longueur) d'un tick absolu à l'intérieur d'un clip. */
export function tickDansPattern(c: Clip, tick: number, longueurPattern: number): number {
  const l = Math.max(1, longueurPattern);
  return (((tick - c.start + c.offset) % l) + l) % l;
}

/** Fin du dernier clip (0 s'il n'y en a pas). */
export const finDesClips = (clips: readonly Clip[]): number => clips.reduce((m, c) => Math.max(m, c.start + c.length), 0);
