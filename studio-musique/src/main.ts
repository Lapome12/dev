// Point d'entrée de Fréquence : crée le projet, le store, le moteur et monte l'interface.
// Câblage (§C) : store.subscribe(p => engine.sync(p)) ; l'interface lit la position via onPosition.

import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/views.css';
import { createEngine, renderWav } from './engine/index';
import { demoSong } from './project/demo-song';
import { newProject } from './project/defaults';
import { exportMidi, importMidi } from './project/midi-file';
import { openFile, saveFile } from './project/serialize';
import { autosave, autosaveSample, flushAutosave, restoreAutosave } from './project/storage';
import { createStore } from './project/store';
import { TEMPLATES } from './project/templates';
import { brancherClaviers } from './ui/claviers';
import { installerBulles } from './ui/components/bulle';
import type { Contexte } from './ui/contexte';
import { enregistrer, menuProjet, ouvrir } from './ui/projet';
import { Echantillons, type ServicesProjet } from './ui/services';
import { installerRaccourcis } from './ui/shortcuts';
import { creerEtatUi, etatInitial } from './ui/ui-state';
import { afficherAccueil } from './ui/views/accueil';
import { monterApplication } from './ui/views/app';
import { navigateur } from './ui/views/browser';
import { ouvrirExport } from './ui/views/export-dialog';
import { ouvrirPlugin } from './ui/views/plugin-window';
import { ouvrirRaccourcis } from './ui/views/raccourcis';
import { aPropos } from './ui/views/a-propos';

const racine = document.getElementById('app');
if (!racine) throw new Error('#app introuvable');

const store = createStore(newProject());
const moteur = createEngine();
moteur.sync(store.get());
store.subscribe(p => moteur.sync(p));

const ui = creerEtatUi(etatInitial(store.get()));
store.subscribe(p => ui.reparer(p));

// Services de fichiers, d'export, de modèles et de démo (Dev 1 et Dev 3), vus par l'interface.
const services: ServicesProjet = {
  saveFile, openFile, autosave, restoreAutosave, autosaveSample, renderWav, exportMidi, importMidi,
  decodeSample: data => moteur.decodeSample(data),
  setSampleAudio: (id, audio) => moteur.setSampleAudio(id, audio),
  modeles: TEMPLATES.map(t => ({ id: t.id, nom: t.name, description: t.description, creer: t.create })),
  demo: demoSong,
};
store.subscribe(p => autosave(p));
// Écrit la dernière version tout de suite quand l'onglet se ferme ou passe en arrière-plan.
addEventListener('pagehide', () => { void flushAutosave(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flushAutosave(); });

const ctx: Contexte = {
  store, moteur, ui, services,
  echantillons: new Echantillons(services),
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
brancherClaviers(ctx);
installerRaccourcis(ctx, {
  enregistrer: () => enregistrer(ctx),
  ouvrir: () => void ouvrir(ctx),
  exporter: () => ouvrirExport(ctx),
  aide: ouvrirRaccourcis,
});
monterApplication(racine, ctx, {
  menuProjet: () => menuProjet(ctx, { exporterWav: () => ouvrirExport(ctx), raccourcis: ouvrirRaccourcis, aPropos }),
  navigateur,
});
void afficherAccueil(ctx);
// Accès de débogage et de mesure (tests de performance), seulement en développement.
if (import.meta.env.DEV) Object.assign(window, { frequence: ctx });
