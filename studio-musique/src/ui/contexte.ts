// Ce que chaque vue reçoit : le store du projet, le moteur, l'état de l'interface, et les actions
// qui traversent les vues (ouvrir une fenêtre de plugin, aller au piano roll…).

import type { Store } from '../project/store';
import type { Id } from '../project/types';
import type { MoteurUi } from './moteur';
import type { MagasinUi } from './ui-state';

export interface ActionsUi {
  /** Ouvre la fenêtre de l'instrument d'un canal (étape 2.6). */
  ouvrirInstrument(canalId: Id): void;
  /** Ouvre la fenêtre d'un effet de la console (étape 2.6). */
  ouvrirEffet(piste: number, slotId: Id): void;
}

export interface Contexte {
  store: Store;
  moteur: MoteurUi;
  ui: MagasinUi;
  actions: ActionsUi;
}
