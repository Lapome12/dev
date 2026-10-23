// Barre de transport (étape 2.3) : menu Projet, annuler/rétablir, lecture, PAT/MORCEAU, tempo,
// swing, position, métronome, piano au clavier, onglets des vues, vu-mètre du maître.

import { aide } from '../aide';
import { bouton } from '../components/button';
import { icone } from '../components/icons';
import { boutonRotatif } from '../components/knob';
import { boutonMenu, type ElementMenu } from '../components/menu';
import { vuMetre } from '../components/meter';
import { champNombre } from '../components/number';
import { interrupteur } from '../components/toggle';
import type { Contexte } from '../contexte';
import { h } from '../dom';
import { arreter, basculerLecture, basculerMode, formaterPosition, pause } from '../lecture';
import type { Vue } from '../ui-state';

export const VUES: { id: Vue; nom: string; touche: string }[] = [
  { id: 'rack', nom: 'Rack', touche: 'Alt+1' },
  { id: 'piano', nom: 'Piano roll', touche: 'Alt+2' },
  { id: 'arrangement', nom: 'Arrangement', touche: 'Alt+3' },
  { id: 'console', nom: 'Console', touche: 'Alt+4' },
];

export interface OptionsTransport {
  /** Éléments du menu Projet (fournis par l'application, étape 3.5). */
  menuProjet: () => ElementMenu[];
}

export function barreTransport(ctx: Contexte, o: OptionsTransport): HTMLElement {
  const { store, moteur, ui } = ctx;

  // --- Projet, annuler, rétablir ---
  const btnProjet = boutonMenu(bouton({ texte: 'Projet', icone: 'menu', variante: 'discret', aide: 'Nouveau, ouvrir, enregistrer, exporter en WAV ou MIDI, importer un son.' }), o.menuProjet, 'Projet');
  const btnAnnuler = bouton({ icone: 'annuler', libelle: 'Annuler', raccourci: 'Ctrl+Z', variante: 'discret', surClic: () => store.undo() });
  const btnRetablir = bouton({ icone: 'retablir', libelle: 'Rétablir', raccourci: 'Ctrl+Maj+Z', variante: 'discret', surClic: () => store.redo() });

  // --- Lecture ---
  const btnLecture = bouton({ icone: 'lecture', libelle: 'Lecture', raccourci: 'Espace', classe: 'tr-lecture', aide: 'Lecture / arrêt (Espace). Ctrl+Espace met en pause.', surClic: () => basculerLecture(ctx) });
  const btnPause = bouton({ icone: 'pause', libelle: 'Pause', raccourci: 'Ctrl+Espace', variante: 'discret', surClic: () => pause(ctx) });
  const btnArret = bouton({ icone: 'arret', libelle: 'Arrêt', variante: 'discret', aide: 'Arrête la lecture et revient au début.', surClic: () => arreter(ctx) });

  const segPat = h('button', { type: 'button', class: 'seg', role: 'radio' }, 'PAT');
  const segMorceau = h('button', { type: 'button', class: 'seg', role: 'radio' }, 'MORCEAU');
  const mode = aide(h('div', { class: 'segmente', role: 'radiogroup', 'aria-label': 'Mode de lecture', 'aria-keyshortcuts': 'L' }, segPat, segMorceau),
    'PAT joue le pattern courant en boucle, MORCEAU joue l\'arrangement (touche L).');
  segPat.addEventListener('click', () => { if (ui.get().mode !== 'pattern') basculerMode(ctx); });
  segMorceau.addEventListener('click', () => { if (ui.get().mode !== 'morceau') basculerMode(ctx); });
  mode.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); basculerMode(ctx); (ui.get().mode === 'pattern' ? segPat : segMorceau).focus(); }
  });

  // --- Tempo, swing, position ---
  const tempo = champNombre({
    libelle: 'Tempo', min: 40, max: 300, step: 0.1, defaut: 130, valeur: store.get().bpm, largeur: 'large',
    format: v => `${v.toFixed(v % 1 ? 1 : 0).replace('.', ',')}`,
    aide: 'en battements par minute. Glisser, molette, ou double-clic pour taper.',
    surEntree: v => store.update('Changer le tempo', d => { d.bpm = v; }, { merge: true }),
  });
  const swing = boutonRotatif({
    libelle: 'Swing', min: 0, max: 1, step: 0.01, defaut: 0, valeur: store.get().swing, taille: 'mini', sansEtiquette: true,
    format: v => `${Math.round(v * 100)} %`, aide: 'décale les doubles-croches paires pour un groove plus souple.',
    surEntree: v => store.update('Changer le swing', d => { d.swing = v; }, { merge: true }),
  });
  const position = h('output', { class: 'tr-position mono', 'aria-label': 'Position de lecture (mesure, temps, pas)' }, formaterPosition(0));
  aide(position, 'Position de lecture : mesure, temps, pas.');

  // --- Options ---
  const metronome = interrupteur({ libelle: 'Métronome', icone: 'metronome', actif: ui.get().metronome, aide: 'Fait entendre les temps pendant la lecture.', surChange: a => ui.set({ metronome: a }) });
  const clavier = interrupteur({ libelle: 'Piano au clavier', icone: 'clavier', actif: ui.get().clavier, aide: 'Joue le canal sélectionné avec les touches de l\'ordinateur (rangées Q…M et A…P, octave avec Z et X).', surChange: a => ui.set({ clavier: a }) });

  // --- Onglets des vues ---
  const onglets = VUES.map(v => {
    const b = h('button', { type: 'button', class: 'onglet', role: 'tab', id: `onglet-${v.id}`, 'aria-controls': `vue-${v.id}`, 'aria-keyshortcuts': v.touche, 'data-bulle': `${v.nom} (${v.touche})` }, v.nom);
    b.addEventListener('click', () => ui.set({ vue: v.id }));
    return b;
  });
  const listeOnglets = h('div', { class: 'onglets', role: 'tablist', 'aria-label': 'Vues' }, ...onglets);
  listeOnglets.addEventListener('keydown', e => {
    const i = VUES.findIndex(v => v.id === ui.get().vue);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % VUES.length;
    else if (e.key === 'ArrowLeft') n = (i + VUES.length - 1) % VUES.length;
    if (n < 0) return;
    e.preventDefault();
    const v = VUES[n];
    if (v) { ui.set({ vue: v.id }); onglets[n]?.focus(); }
  });

  const metre = vuMetre({ libelle: 'Niveau du maître', hauteur: 28, largeur: 10 });

  const el = h('header', { class: 'transport', role: 'toolbar', 'aria-label': 'Transport' },
    h('div', { class: 'tr-groupe' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, icone('haut_parleur')), h('span', { class: 'tr-nom' }, 'Fréquence'), btnProjet, btnAnnuler, btnRetablir),
    h('div', { class: 'tr-groupe' }, btnLecture, btnPause, btnArret, mode),
    h('div', { class: 'tr-groupe tr-affichages' },
      h('div', { class: 'tr-champ' }, tempo.el, h('span', { class: 'tr-legende', 'aria-hidden': 'true' }, 'BPM')),
      h('div', { class: 'tr-champ' }, swing.el, h('span', { class: 'tr-legende', 'aria-hidden': 'true' }, 'Swing')),
      position, metronome.el, clavier.el),
    listeOnglets,
    h('div', { class: 'tr-groupe tr-fin' }, metre.el));

  // --- Synchronisation ---
  const majProjet = () => {
    const p = store.get();
    tempo.definir(p.bpm);
    swing.definir(p.swing);
    const u = store.canUndo();
    const r = store.canRedo();
    btnAnnuler.disabled = !u;
    btnRetablir.disabled = !r;
    btnAnnuler.setAttribute('data-bulle', u ? `Annuler : ${u} (Ctrl+Z)` : 'Rien à annuler');
    btnRetablir.setAttribute('data-bulle', r ? `Rétablir : ${r} (Ctrl+Maj+Z)` : 'Rien à rétablir');
    btnAnnuler.setAttribute('aria-label', u ? `Annuler : ${u}` : 'Annuler');
    btnRetablir.setAttribute('aria-label', r ? `Rétablir : ${r}` : 'Rétablir');
  };
  const majUi = () => {
    const u = ui.get();
    segPat.setAttribute('aria-checked', String(u.mode === 'pattern'));
    segMorceau.setAttribute('aria-checked', String(u.mode === 'morceau'));
    segPat.tabIndex = u.mode === 'pattern' ? 0 : -1;
    segMorceau.tabIndex = u.mode === 'morceau' ? 0 : -1;
    metronome.definir(u.metronome);
    clavier.definir(u.clavier);
    moteur.setMetronome(u.metronome);
    for (const [i, b] of onglets.entries()) {
      const actif = VUES[i]?.id === u.vue;
      b.setAttribute('aria-selected', String(actif));
      b.tabIndex = actif ? 0 : -1;
    }
  };
  let enLecture = false;
  const majLecture = () => {
    const l = moteur.isPlaying();
    if (l === enLecture) return;
    enLecture = l;
    btnLecture.classList.toggle('en-cours', l);
    btnLecture.replaceChildren(icone(l ? 'arret' : 'lecture'));
    btnLecture.setAttribute('aria-label', l ? 'Arrêt' : 'Lecture');
    btnLecture.setAttribute('data-bulle', l ? 'Arrêt (Espace)' : 'Lecture (Espace)');
  };
  store.subscribe(majProjet);
  ui.subscribe(majUi);
  moteur.onPosition(t => { position.textContent = formaterPosition(t); majLecture(); });
  majProjet();
  majUi();

  // Vu-mètre du maître, rafraîchi à chaque image.
  const boucle = () => {
    const m = moteur.levels()[0];
    if (m) metre.maj(m.left, m.right, m.peakHold);
    majLecture();
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
  return el;
}
