// Raccourcis clavier globaux (§F). Ignorés pendant la saisie de texte et dans les boîtes de dialogue.
// Les vues ajoutent les leurs (piano roll : Q, B, E, S, C…) via ajouterRaccourcis().

import type { Contexte } from './contexte';
import { basculerLecture, basculerMode, pause } from './lecture';
import { VUES } from './views/transport';

export type GestionnaireTouche = (e: KeyboardEvent) => boolean;
const supplementaires = new Set<GestionnaireTouche>();

/** Ajoute un gestionnaire (renvoie true s'il a traité la touche). Renvoie un désabonnement. */
export function ajouterRaccourcis(g: GestionnaireTouche): () => void {
  supplementaires.add(g);
  return () => supplementaires.delete(g);
}

export function enSaisie(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  if (t.closest('dialog[open]')) return true;
  if (t instanceof HTMLInputElement) return !['checkbox', 'radio', 'range', 'button'].includes(t.type);
  return t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable;
}

export interface ActionsRaccourcis {
  enregistrer(): void;
  exporter(): void;
  aide(): void;
}

export function installerRaccourcis(ctx: Contexte, a: ActionsRaccourcis): () => void {
  const surTouche = (e: KeyboardEvent) => {
    if (e.defaultPrevented || enSaisie(e)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const touche = e.key.toLowerCase();
    let fait = true;
    if (e.code === 'Space' && ctrl) pause(ctx);
    else if (e.code === 'Space' && !e.altKey) basculerLecture(ctx);
    else if (ctrl && touche === 'z' && !e.shiftKey) ctx.store.undo();
    else if (ctrl && ((touche === 'z' && e.shiftKey) || touche === 'y')) ctx.store.redo();
    else if (ctrl && touche === 's') a.enregistrer();
    else if (ctrl && touche === 'e') a.exporter();
    else if (e.altKey && !ctrl && /^Digit[1-4]$/.test(e.code)) {
      const v = VUES[Number(e.code.slice(5)) - 1];
      if (v) ctx.ui.set({ vue: v.id });
    } else if (!ctrl && !e.altKey && e.key === '?') a.aide();
    else if (!ctrl && !e.altKey && !e.shiftKey && e.code === 'KeyL' && !ctx.ui.get().clavier) basculerMode(ctx);
    else {
      fait = false;
      for (const g of supplementaires) if (g(e)) { fait = true; break; }
    }
    if (fait) e.preventDefault();
  };
  document.addEventListener('keydown', surTouche);
  return () => document.removeEventListener('keydown', surTouche);
}
