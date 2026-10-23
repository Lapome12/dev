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

// ---------- Piano roll ----------

/** Voix de Frappe selon la hauteur (§D.2, précision du Manager). */
export const VOIX_FRAPPE: Record<number, string> = {
  36: 'Grosse caisse', 37: 'Rimshot', 38: 'Caisse claire', 39: 'Clap', 41: 'Tom grave',
  42: 'Charley fermé', 45: 'Tom medium', 46: 'Charley ouvert', 49: 'Crash', 56: 'Cloche',
};

const NOMS_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
/** 60 -> « C4 », 69 -> « A4 ». */
export const nomNote = (h: number): string => `${NOMS_NOTES[((h % 12) + 12) % 12]}${Math.floor(h / 12) - 1}`;
export const estNoire = (h: number): boolean => [1, 3, 6, 8, 10].includes(((h % 12) + 12) % 12);

/** Ramène un tick sur la grille (arrondi) ; grille 0 ou 1 = pas d'aimant. */
export function aimanter(tick: number, grille: number, mode: 'arrondi' | 'bas' = 'arrondi'): number {
  if (grille <= 1) return Math.round(tick);
  return (mode === 'bas' ? Math.floor(tick / grille) : Math.round(tick / grille)) * grille;
}

/** Quantifie le début des notes (et la longueur si elle est plus courte que la grille). */
export function quantifier(notes: Note[], grille: number, ids?: ReadonlySet<Id>): void {
  if (grille <= 1) return;
  for (const n of notes) {
    if (ids && !ids.has(n.id)) continue;
    n.tick = Math.max(0, aimanter(n.tick, grille));
    n.length = Math.max(grille, aimanter(n.length, grille));
  }
  notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
}

/** Coupe une note en deux à `tick` ; renvoie la nouvelle note (la seconde moitié) ou null. */
export function decouper(notes: Note[], id: Id, tick: number): Note | null {
  const n = notes.find(x => x.id === id);
  if (!n || tick <= n.tick || tick >= n.tick + n.length) return null;
  const seconde: Note = { ...n, id: nouvelId(), tick, length: n.tick + n.length - tick };
  n.length = tick - n.tick;
  notes.push(seconde);
  notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
  return seconde;
}

/** Notes copiées, décalées de `decalage` ticks, avec de nouveaux identifiants. */
export function copierNotes(notes: readonly Note[], decalage: number, transposition = 0): Note[] {
  return notes.map(n => ({ ...n, id: nouvelId(), tick: n.tick + decalage, pitch: Math.min(127, Math.max(0, n.pitch + transposition)) }));
}

/** Étendue [début, fin) d'un ensemble de notes, arrondie à la grille. */
export function etendue(notes: readonly Note[], grille: number): { debut: number; fin: number } {
  if (!notes.length) return { debut: 0, fin: 0 };
  const debut = Math.min(...notes.map(n => n.tick));
  const fin = Math.max(...notes.map(n => n.tick + n.length));
  const g = Math.max(1, grille);
  return { debut: Math.floor(debut / g) * g, fin: Math.ceil(fin / g) * g };
}

/** Longueur de pattern (multiple d'une mesure) qui couvre toutes les notes. */
export function longueurCouvrante(lengthTicks: number, notes: Iterable<Note>): number {
  let fin = lengthTicks;
  for (const n of notes) fin = Math.max(fin, n.tick + n.length);
  return Math.ceil(fin / 384) * 384;
}
