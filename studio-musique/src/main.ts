// Point d'entrée de Fréquence : crée le projet, le store, le moteur et monte l'interface.
// Câblage (§C) : store.subscribe(p => engine.sync(p)) ; l'interface lit la position via onPosition.

import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/views.css';
import { createEngine } from './engine/index';
import { newProject } from './project/defaults';
import { createStore } from './project/store';
import { installerBulles } from './ui/components/bulle';
import { toast } from './ui/components/toast';
import type { Contexte } from './ui/contexte';
import { installerRaccourcis } from './ui/shortcuts';
import { creerEtatUi, etatInitial } from './ui/ui-state';
import { monterApplication } from './ui/views/app';
import { ouvrirPlugin } from './ui/views/plugin-window';

const racine = document.getElementById('app');
if (!racine) throw new Error('#app introuvable');

const store = createStore(newProject());
const moteur = createEngine();
moteur.sync(store.get());
store.subscribe(p => moteur.sync(p));

const ui = creerEtatUi(etatInitial(store.get()));
store.subscribe(p => ui.reparer(p));

const ctx: Contexte = {
  store, moteur, ui,
  actions: {
    ouvrirInstrument: canalId => ouvrirPlugin(ctx, { kind: 'instrument', canalId }),
    ouvrirEffet: (piste, slotId) => ouvrirPlugin(ctx, { kind: 'effet', piste, slotId }),
  },
};

// Le navigateur n'autorise le son qu'après un geste de l'utilisateur.
const reveil = () => { void moteur.resume(); };
document.addEventListener('pointerdown', reveil, { once: true, capture: true });
document.addEventListener('keydown', reveil, { once: true, capture: true });

installerBulles();
installerRaccourcis(ctx, {
  enregistrer: () => toast('Enregistrer : bientôt (étape 3.5).'),
  exporter: () => toast('Export WAV : bientôt (étape 3.5).'),
  aide: () => toast('Raccourcis : bientôt (étape 3.5).'),
});
monterApplication(racine, ctx, {
  menuProjet: () => [
    { texte: 'Annuler', raccourci: 'Ctrl+Z', desactive: !store.canUndo(), action: () => store.undo() },
    { texte: 'Rétablir', raccourci: 'Ctrl+Maj+Z', desactive: !store.canRedo(), action: () => store.redo() },
  ],
});
