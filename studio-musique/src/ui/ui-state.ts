// État de l'interface (hors projet, donc hors annulation) : pattern et canal courants, vue,
// mode de lecture, outils. Observable simple ; se répare quand le projet change (annuler, ouvrir).

import type { Id, Project } from '../project/types';

export type Vue = 'rack' | 'piano' | 'arrangement' | 'console';
export type OutilPiano = 'crayon' | 'gomme' | 'selection' | 'decoupe';

export interface EtatUi {
  vue: Vue;
  patternId: Id;
  canalId: Id | null;
  mode: 'pattern' | 'morceau';
  metronome: boolean;
  /** Piano au clavier de l'ordinateur actif. */
  clavier: boolean;
  outilPiano: OutilPiano;
  /** Pas de la grille du piano roll, en ticks (24 = 1/16). */
  grillePiano: number;
  outilArrangement: 'crayon' | 'gomme' | 'selection' | 'decoupe';
  grilleArrangement: number;
  navigateur: boolean;
}

export interface MagasinUi {
  get(): Readonly<EtatUi>;
  set(changement: Partial<EtatUi>): void;
  subscribe(fn: (e: Readonly<EtatUi>, avant: Readonly<EtatUi>) => void): () => void;
  /** Ramène pattern et canal sur des éléments qui existent encore dans le projet. */
  reparer(p: Readonly<Project>): void;
}

export function etatInitial(p: Readonly<Project>): EtatUi {
  return {
    vue: 'rack',
    patternId: p.patterns[0]?.id ?? '',
    canalId: p.channels[0]?.id ?? null,
    mode: 'pattern',
    metronome: false,
    clavier: false,
    outilPiano: 'crayon',
    grillePiano: 24,
    outilArrangement: 'crayon',
    grilleArrangement: 384,
    navigateur: true,
  };
}

export function creerEtatUi(initial: EtatUi): MagasinUi {
  let etat = { ...initial };
  const ecouteurs = new Set<(e: Readonly<EtatUi>, avant: Readonly<EtatUi>) => void>();
  const set = (c: Partial<EtatUi>) => {
    const avant = etat;
    const suivant = { ...etat, ...c };
    if ((Object.keys(c) as (keyof EtatUi)[]).every(k => avant[k] === suivant[k])) return;
    etat = suivant;
    for (const fn of [...ecouteurs]) fn(etat, avant);
  };
  return {
    get: () => etat,
    set,
    subscribe(fn) { ecouteurs.add(fn); return () => { ecouteurs.delete(fn); }; },
    reparer(p) {
      const c: Partial<EtatUi> = {};
      if (!p.patterns.some(pt => pt.id === etat.patternId)) c.patternId = p.patterns[0]?.id ?? '';
      if (etat.canalId !== null && !p.channels.some(ch => ch.id === etat.canalId)) c.canalId = p.channels[0]?.id ?? null;
      if (etat.canalId === null && p.channels[0]) c.canalId = p.channels[0].id;
      set(c);
    },
  };
}
