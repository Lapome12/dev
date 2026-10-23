// Store du projet (PLAN.md §D.4) : seule porte d'entrée pour modifier le projet.
// Chaque update() travaille sur une copie (structuredClone) : l'état précédent reste intact,
// ce qui rend l'annulation immédiate. Les échantillons audio restent hors du projet.
import type { Project } from './types';

export interface Store {
  get(): Readonly<Project>;
  update(label: string, change: (draft: Project) => void, o?: { merge?: boolean }): void;
  subscribe(fn: (p: Readonly<Project>) => void): () => void;
  undo(): void; redo(): void;
  canUndo(): string | null; canRedo(): string | null;
  replace(p: Project): void;
  /** Ferme l'étape fusionnée en cours : à appeler en fin de geste (souris relâchée, fin de molette). */
  endMerge(): void;
}

export const HISTORY_LIMIT = 200;

interface Step { label: string; project: Project }

export function createStore(initial: Project): Store {
  let current: Project = structuredClone(initial);
  let past: Step[] = [];
  let future: Step[] = [];
  // Label de la dernière étape ouverte en fusion : les update() suivants de même label s'y ajoutent.
  let mergeLabel: string | null = null;
  const listeners = new Set<(p: Readonly<Project>) => void>();

  const notify = () => { for (const fn of [...listeners]) fn(current); };

  return {
    get: () => current,

    update(label, change, o) {
      const draft = structuredClone(current);
      change(draft);
      const merge = o?.merge === true;
      if (!(merge && mergeLabel === label && past.length > 0)) {
        past.push({ label, project: current });
        if (past.length > HISTORY_LIMIT) past = past.slice(past.length - HISTORY_LIMIT);
      }
      mergeLabel = merge ? label : null;
      future = [];
      current = draft;
      notify();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },

    undo() {
      const step = past.pop();
      if (!step) return;
      future.push({ label: step.label, project: current });
      current = step.project;
      mergeLabel = null;
      notify();
    },

    redo() {
      const step = future.pop();
      if (!step) return;
      past.push({ label: step.label, project: current });
      current = step.project;
      mergeLabel = null;
      notify();
    },

    canUndo: () => past.at(-1)?.label ?? null,
    canRedo: () => future.at(-1)?.label ?? null,

    replace(p) {
      current = structuredClone(p);
      past = [];
      future = [];
      mergeLabel = null;
      notify();
    },

    endMerge() { mergeLabel = null; },
  };
}
