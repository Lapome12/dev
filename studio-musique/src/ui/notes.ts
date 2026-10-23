// Opérations pures sur les notes et les pas (Rack, piano roll). Testées dans test/ui/notes.test.ts.

import type { Id, Note, Pattern } from '../project/types';

export const TICKS_PAS = 24;

export const nouvelId = (): Id => crypto.randomUUID();

/** Notes du canal qui commencent dans le pas donné. */
export function notesDuPas(notes: readonly Note[] | undefined, pas: number): Note[] {
  if (!notes) return [];
  const debut = pas * TICKS_PAS;
  return notes.filter(n => n.tick >= debut && n.tick < debut + TICKS_PAS);
}

export const pasAllume = (notes: readonly Note[] | undefined, pas: number): boolean => notesDuPas(notes, pas).length > 0;

/** Allume ou éteint un pas dans un brouillon de pattern. Renvoie true si quelque chose a changé. */
export function definirPas(pattern: Pattern, canalId: Id, pas: number, allume: boolean, hauteur: number, velocite = 0.8): boolean {
  const notes = pattern.notes[canalId] ?? (pattern.notes[canalId] = []);
  const debut = pas * TICKS_PAS;
  const existe = notes.some(n => n.tick >= debut && n.tick < debut + TICKS_PAS);
  if (allume === existe) return false;
  if (allume) {
    notes.push({ id: nouvelId(), tick: debut, length: TICKS_PAS, pitch: hauteur, velocity: velocite });
    notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
  } else {
    pattern.notes[canalId] = notes.filter(n => !(n.tick >= debut && n.tick < debut + TICKS_PAS));
  }
  return true;
}

/** Nombre de pas affichés dans le Rack pour un pattern (16, 32 ou 64). */
export function nombrePas(pattern: Pattern): number {
  const n = Math.round(pattern.lengthTicks / TICKS_PAS);
  return n <= 16 ? 16 : n <= 32 ? 32 : 64;
}

/** Copie profonde d'un pattern avec de nouveaux identifiants de notes. */
export function copierPattern(p: Pattern, id: Id, nom: string): Pattern {
  const notes: Record<Id, Note[]> = {};
  for (const [canal, liste] of Object.entries(p.notes)) notes[canal] = liste.map(n => ({ ...n, id: nouvelId() }));
  return { ...p, id, name: nom, notes };
}

/** Nom libre « Pattern N » qui n'existe pas encore. */
export function nomLibre(base: string, existants: readonly string[]): string {
  const pris = new Set(existants);
  for (let i = 1; ; i++) if (!pris.has(`${base} ${i}`)) return `${base} ${i}`;
}
