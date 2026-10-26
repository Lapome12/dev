// Piano roll (étape 2.4) : clavier latéral cliquable, crayon, gomme, sélection, découpe,
// déplacer, étirer, dupliquer, aimant à la grille (1/4 à 1/32, triolets), quantifier, transposer,
// panneau de vélocités, zoom et défilement, notes « fantômes » des autres canaux.
// Tout est dessiné sur <canvas> (fluide avec des milliers de notes) ; la barre d'outils est en DOM.

import type { Channel, Id, Note, Pattern, Project } from '../../project/types';
import { aide, aideTemporaire } from '../aide';
import { bouton } from '../components/button';
import { boutonMenu } from '../components/menu';
import { liste } from '../components/select';
import { interrupteur } from '../components/toggle';
import type { Contexte } from '../contexte';
import { borner, h, jeton, preparerCanvas } from '../dom';
import { finGeste } from '../geste';
import {
  aimanter, copierNotes, decouper, estAccent, estNoire, etendue, liaisonsGlisse, longueurCouvrante, nomNote, nouvelId, quantifier, VOIX_FRAPPE,
} from '../notes';
import { ajouterRaccourcis } from '../shortcuts';
import type { OutilPiano } from '../ui-state';

export const GRILLES: { ticks: number; nom: string }[] = [
  { ticks: 96, nom: '1/4' }, { ticks: 48, nom: '1/8' }, { ticks: 32, nom: '1/8 triolet' },
  { ticks: 24, nom: '1/16' }, { ticks: 16, nom: '1/16 triolet' }, { ticks: 12, nom: '1/32' }, { ticks: 1, nom: 'Sans aimant' },
];
const OUTILS: { id: OutilPiano; nom: string; touche: string; icone: 'crayon' | 'gomme' | 'selection' | 'decoupe'; aide: string }[] = [
  { id: 'crayon', nom: 'Crayon', touche: 'B', icone: 'crayon', aide: 'Clic : poser une note (glisser pour l\'allonger). Glisser une note : la déplacer ; son bord droit : l\'étirer. Clic droit : supprimer. Ctrl+glisser : sélectionner.' },
  { id: 'gomme', nom: 'Gomme', touche: 'E', icone: 'gomme', aide: 'Cliquer ou glisser sur des notes pour les effacer.' },
  { id: 'selection', nom: 'Sélection', touche: 'S', icone: 'selection', aide: 'Glisser pour sélectionner un rectangle (Maj ajoute). Glisser la sélection pour la déplacer.' },
  { id: 'decoupe', nom: 'Découpe', touche: 'C', icone: 'decoupe', aide: 'Cliquer sur une note pour la couper en deux à la grille.' },
];

const LARGEUR_CLAVIER = 64;
const HAUTEUR_REGLE = 22;
const HAUTEUR_VELOCITES = 84;
const BORD = 6;          // px de la poignée d'étirement
const ACCENT = '#F5C46B'; // Acide : notes accentuées
const MESURE = 384;

type Geste =
  | { type: 'deplacer'; ancre: Id; x0: number; y0: number; origines: Map<Id, { tick: number; pitch: number }>; copie: boolean; bouge: boolean }
  | { type: 'etirer'; ancre: Id; x0: number; origines: Map<Id, number> }
  | { type: 'rectangle'; x0: number; y0: number; x1: number; y1: number; ajout: Set<Id> }
  | { type: 'gomme' }
  | { type: 'velocite' }
  | { type: 'clavier'; hauteur: number }
  | { type: 'regle' };

export function vuePianoRoll(ctx: Contexte): HTMLElement {
  const { store, ui, moteur } = ctx;

  // ---------- État local de la vue ----------
  let zoomX = 0.5;              // px par tick
  let rangee = 14;              // px par demi-ton
  let defX = 0;                 // défilement en px
  let defY = (127 - 76) * 14;   // E5 en haut au départ
  let selection = new Set<Id>();
  let longueurNote = 24;
  let fantomes = true;
  let geste: Geste | null = null;
  let survol: { x: number; y: number } | null = null;
  let presse: Clipboard | null = null;
  let tete = -1;
  let sale = true;
  let cle = '';                 // canal et pattern affichés, pour vider la sélection quand ils changent
  // Curseur clavier : sans sélection, les flèches le déplacent et Entrée pose une note (saisie pas à pas).
  const curseur = { tick: 0, pitch: 60, visible: false };
  interface Clipboard { notes: Note[]; debut: number }

  // ---------- Barre d'outils ----------
  const choixCanal = liste({ libelle: 'Canal édité', options: [], valeur: '', aide: 'le canal dont on écrit les notes.', surChange: v => ui.set({ canalId: v }) });
  const boutonsOutils = OUTILS.map(o => {
    const b = bouton({ icone: o.icone, libelle: o.nom, raccourci: o.touche, variante: 'outil', aide: `${o.nom} (${o.touche}) : ${o.aide}`, surClic: () => ui.set({ outilPiano: o.id }) });
    return b;
  });
  const choixGrille = liste({
    libelle: 'Grille', options: GRILLES.map(g => ({ value: String(g.ticks), label: g.nom })), valeur: String(ui.get().grillePiano),
    aide: 'aimant : les notes se calent sur cette division. Alt en glissant désactive l\'aimant.',
    surChange: v => ui.set({ grillePiano: Number(v) }),
  });
  const btnFantomes = interrupteur({ libelle: 'Notes des autres canaux', icone: 'pistes', actif: fantomes, aide: 'Affiche en transparence les notes des autres canaux du pattern.', surChange: a => { fantomes = a; sale = true; } });
  const btnQuantifier = bouton({ texte: 'Quantifier', aide: 'Cale le début des notes sélectionnées (ou de toutes) sur la grille (Q).', surClic: () => quantifierNotes() });
  const btnOutils = boutonMenu(bouton({ icone: 'reglages', libelle: 'Plus d\'actions', variante: 'discret' }), () => [
    { texte: 'Tout sélectionner', raccourci: 'Ctrl+A', action: () => toutSelectionner() },
    { texte: 'Copier', raccourci: 'Ctrl+C', action: () => copier() },
    { texte: 'Coller', raccourci: 'Ctrl+V', desactive: !presse, action: () => coller() },
    { texte: 'Dupliquer', raccourci: 'Ctrl+D', action: () => dupliquer() },
    { texte: 'Supprimer', raccourci: 'Suppr', action: () => supprimerSelection() },
    { separateur: true },
    { texte: 'Transposer d\'une octave vers le haut', raccourci: 'Maj+↑', action: () => transposer(12) },
    { texte: 'Transposer d\'une octave vers le bas', raccourci: 'Maj+↓', action: () => transposer(-12) },
    { texte: 'Quantifier', raccourci: 'Q', action: () => quantifierNotes() },
    { separateur: true },
    { texte: 'Effacer toutes les notes du canal', danger: true, action: () => modifier('Effacer les notes', n => { n.length = 0; }) },
  ], 'Actions du piano roll');
  const zoom = (f: number, ancreX?: number) => {
    const ax = ancreX ?? largeurNotes() / 2;
    const tick = (ax + defX) / zoomX;
    zoomX = borner(zoomX * f, 0.04, 4);
    defX = Math.max(0, tick * zoomX - ax);
    sale = true;
  };
  const barre = h('div', { class: 'pr-barre barre-vue', role: 'toolbar', 'aria-label': 'Outils du piano roll' },
    choixCanal.el,
    h('div', { class: 'groupe-outils', role: 'group', 'aria-label': 'Outil' }, ...boutonsOutils),
    choixGrille.el, btnQuantifier, btnFantomes.el,
    h('span', { class: 'espace' }),
    bouton({ icone: 'moins', libelle: 'Dézoomer', variante: 'discret', surClic: () => zoom(1 / 1.25) }),
    bouton({ icone: 'plus', libelle: 'Zoomer', variante: 'discret', surClic: () => zoom(1.25) }),
    btnOutils);

  // ---------- Zone de dessin ----------
  const cRegle = h('canvas', { class: 'pr-regle', 'aria-hidden': 'true' });
  const cClavier = h('canvas', { class: 'pr-clavier', 'aria-hidden': 'true' });
  const cNotes = h('canvas', { class: 'pr-notes', role: 'img', 'aria-label': 'Grille de notes' });
  const cVel = h('canvas', { class: 'pr-vel', 'aria-hidden': 'true' });
  const zoneNotes = h('div', { class: 'pr-zone-notes', tabindex: 0, 'aria-label': 'Grille de notes. Flèches : déplacer le curseur ; Entrée : poser une note ; Suppr : effacer. Avec une sélection, les flèches la transposent ou la déplacent ; Échap la vide.' }, cNotes);
  aide(zoneNotes, 'Molette : défiler. Maj+molette : défiler dans le temps. Ctrl+molette : zoom horizontal. Alt+molette : zoom vertical.');
  const zoneVel = h('div', { class: 'pr-zone-vel' }, cVel);
  aide(zoneVel, 'Vélocités : cliquer ou glisser pour régler la force des notes.');
  const zoneClavier = h('div', { class: 'pr-zone-clavier' }, cClavier);
  aide(zoneClavier, 'Clavier : cliquer pour écouter une note.');
  const zoneRegle = h('div', { class: 'pr-zone-regle' }, cRegle);
  aide(zoneRegle, 'Règle : cliquer pour placer la tête de lecture.');
  const grille = h('div', { class: 'pr-grille' },
    h('div', { class: 'pr-coin' }), zoneRegle,
    zoneClavier, zoneNotes,
    h('div', { class: 'pr-coin pr-legende-vel' }, 'Vélocité'), zoneVel);
  const vide = h('p', { class: 'pr-vide doux', hidden: true }, 'Ajoutez un canal dans le Rack pour écrire des notes.');
  const annonce = h('p', { class: 'lecteur', 'aria-live': 'polite' });
  const annoncer = (t: string) => { annonce.textContent = t; };
  const el = h('section', { class: 'vue vue-piano', id: 'vue-piano', role: 'tabpanel', 'aria-labelledby': 'onglet-piano' }, barre, grille, vide, annonce);

  const largeurNotes = () => zoneNotes.clientWidth;
  const hauteurNotes = () => zoneNotes.clientHeight;

  // ---------- Accès au projet ----------
  const courant = (p: Readonly<Project> = store.get()): { canal: Channel | undefined; pattern: Pattern | undefined; notes: readonly Note[] } => {
    const u = ui.get();
    const canal = p.channels.find(c => c.id === u.canalId);
    const pattern = p.patterns.find(x => x.id === u.patternId);
    return { canal, pattern, notes: (canal && pattern?.notes[canal.id]) || [] };
  };
  /** Modifie les notes du canal courant dans le pattern courant (étend le pattern si besoin). */
  const modifier = (label: string, f: (notes: Note[], pattern: Pattern) => void, merge = false) => {
    const { canal, pattern } = courant();
    if (!canal || !pattern) return;
    store.update(label, d => {
      const pt = d.patterns.find(x => x.id === pattern.id);
      if (!pt) return;
      const notes = pt.notes[canal.id] ?? (pt.notes[canal.id] = []);
      f(notes, pt);
      pt.notes[canal.id] = notes.filter(n => n.length > 0).sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
      pt.lengthTicks = longueurCouvrante(pt.lengthTicks, notes);
    }, merge ? { merge: true } : undefined);
  };
  const grilleCourante = (e?: { altKey: boolean }) => (e?.altKey ? 1 : ui.get().grillePiano);

  // ---------- Géométrie ----------
  const xDeTick = (t: number) => t * zoomX - defX;
  const tickDeX = (x: number) => (x + defX) / zoomX;
  const yDeHauteur = (hh: number) => (127 - hh) * rangee - defY;
  const hauteurDeY = (y: number) => borner(127 - Math.floor((y + defY) / rangee), 0, 127);
  const limiterDefilement = () => {
    defY = borner(defY, 0, Math.max(0, 128 * rangee - hauteurNotes()));
    defX = Math.max(0, defX);
  };
  const noteSous = (x: number, y: number): { note: Note; bord: boolean } | null => {
    const hh = hauteurDeY(y);
    const t = tickDeX(x);
    const notes = courant().notes;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (!n || n.pitch !== hh || t < n.tick || t > n.tick + n.length) continue;
      const fin = xDeTick(n.tick + n.length);
      return { note: n, bord: fin - x <= BORD && (fin - xDeTick(n.tick)) > BORD * 1.5 };
    }
    return null;
  };
  const position = (e: PointerEvent | MouseEvent, cible: HTMLElement) => {
    const r = cible.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // ---------- Écoute ----------
  let ecoute: { canal: Id; hauteur: number } | null = null;
  const jouer = (hh: number, v = 0.8) => {
    const c = courant().canal;
    if (!c) return;
    arreterEcoute();
    void moteur.resume();
    moteur.noteOn(c.id, hh, v);
    ecoute = { canal: c.id, hauteur: hh };
  };
  const arreterEcoute = () => { if (ecoute) { moteur.noteOff(ecoute.canal, ecoute.hauteur); ecoute = null; } };

  // ---------- Commandes ----------
  const selectionnees = (): Note[] => courant().notes.filter(n => selection.has(n.id));
  const cibles = (): Note[] => (selection.size ? selectionnees() : [...courant().notes]);
  const supprimerSelection = () => {
    if (!selection.size) return;
    const ids = new Set(selection);
    modifier(ids.size > 1 ? `Supprimer ${ids.size} notes` : 'Supprimer une note', n => { const r = n.filter(x => !ids.has(x.id)); n.length = 0; n.push(...r); });
    selection.clear();
  };
  const transposer = (dh: number) => {
    const ids = new Set(cibles().map(n => n.id));
    if (!ids.size) return;
    modifier('Transposer', n => { for (const x of n) if (ids.has(x.id)) x.pitch = borner(x.pitch + dh, 0, 127); }, true);
    finGeste(store);
  };
  const decaler = (dt: number) => {
    const ids = new Set(selection);
    if (!ids.size) return;
    const min = Math.min(...selectionnees().map(n => n.tick));
    const d = Math.max(-min, dt);
    modifier('Déplacer des notes', n => { for (const x of n) if (ids.has(x.id)) x.tick += d; }, true);
    finGeste(store);
  };
  const quantifierNotes = () => {
    const g = ui.get().grillePiano;
    if (g <= 1) return;
    const ids = selection.size ? new Set(selection) : undefined;
    modifier('Quantifier', n => quantifier(n, g, ids));
  };
  const toutSelectionner = () => { selection = new Set(courant().notes.map(n => n.id)); sale = true; };
  const copier = () => {
    const s = selectionnees();
    if (s.length) presse = { notes: s.map(n => ({ ...n })), debut: etendue(s, ui.get().grillePiano).debut };
  };
  const coller = () => {
    if (!presse) return;
    const g = Math.max(1, ui.get().grillePiano);
    // Colle à la tête de lecture si elle est visible, sinon juste après la sélection actuelle.
    const s = selectionnees();
    const ou = s.length ? etendue(s, g).fin : tete >= 0 ? aimanter(tete, g, 'bas') : presse.debut;
    const nouvelles = copierNotes(presse.notes, ou - presse.debut);
    modifier('Coller des notes', n => { n.push(...nouvelles); });
    selection = new Set(nouvelles.map(n => n.id));
  };
  const dupliquer = () => {
    const s = selectionnees();
    if (!s.length) return;
    const { debut, fin } = etendue(s, Math.max(1, ui.get().grillePiano));
    const nouvelles = copierNotes(s, fin - debut);
    modifier('Dupliquer des notes', n => { n.push(...nouvelles); });
    selection = new Set(nouvelles.map(n => n.id));
  };

  // ---------- Curseur clavier ----------
  const decrireCurseur = () => {
    const t = curseur.tick;
    return `${nomNote(curseur.pitch)}, mesure ${Math.floor(t / MESURE) + 1}, temps ${Math.floor((t % MESURE) / 96) + 1}${t % 96 ? `, pas ${Math.floor((t % 96) / 24) + 1}` : ''}`;
  };
  const montrerCurseur = () => {
    const x = xDeTick(curseur.tick); const y = yDeHauteur(curseur.pitch);
    if (x < 0 || x > largeurNotes() - 40) defX = Math.max(0, curseur.tick * zoomX - largeurNotes() / 3);
    if (y < 0 || y > hauteurNotes() - rangee) defY = (127 - curseur.pitch) * rangee - hauteurNotes() / 2;
    limiterDefilement();
    sale = true;
  };
  const bougerCurseur = (dt: number, dh: number) => {
    curseur.visible = true;
    curseur.tick = Math.max(0, curseur.tick + dt);
    curseur.pitch = borner(curseur.pitch + dh, 0, 127);
    montrerCurseur();
    annoncer(decrireCurseur());
    if (dh) { jouer(curseur.pitch); setTimeout(arreterEcoute, 150); }
  };
  const noteAuCurseur = () => courant().notes.find(n => n.pitch === curseur.pitch && curseur.tick >= n.tick && curseur.tick < n.tick + n.length);
  const poserAuCurseur = () => {
    if (!courant().canal) return;
    const note: Note = { id: nouvelId(), tick: curseur.tick, length: longueurNote, pitch: curseur.pitch, velocity: 0.8 };
    modifier('Ajouter une note', n => { n.push(note); });
    jouer(note.pitch); setTimeout(arreterEcoute, 180);
    annoncer(`Note ${nomNote(note.pitch)} posée.`);
    curseur.tick += note.length;
    montrerCurseur();
  };
  zoneNotes.addEventListener('focus', () => { if (zoneNotes.matches(':focus-visible')) { curseur.visible = true; sale = true; } });
  zoneNotes.addEventListener('blur', () => { curseur.visible = false; sale = true; });

  // ---------- Souris : grille de notes ----------
  zoneNotes.addEventListener('contextmenu', e => e.preventDefault());
  zoneNotes.addEventListener('pointerdown', e => {
    if (!courant().canal) return;
    const { x, y } = position(e, zoneNotes);
    zoneNotes.focus({ preventScroll: true });
    zoneNotes.setPointerCapture(e.pointerId);
    curseur.visible = false;
    curseur.tick = Math.max(0, aimanter(tickDeX(x), grilleCourante(e), 'bas'));
    curseur.pitch = hauteurDeY(y);
    const outil = ui.get().outilPiano;
    const sous = noteSous(x, y);
    const g = grilleCourante(e);

    if (e.button === 2 || outil === 'gomme') {
      geste = { type: 'gomme' };
      if (sous) effacerSous(x, y);
      return;
    }
    if (e.button !== 0) return;
    if (outil === 'decoupe') {
      if (sous) {
        const t = aimanter(tickDeX(x), g);
        modifier('Couper une note', n => { decouper(n, sous.note.id, t); });
      }
      return;
    }
    const rectangle = outil === 'selection' ? !sous : (e.ctrlKey || e.metaKey);
    if (rectangle) {
      geste = { type: 'rectangle', x0: x, y0: y, x1: x, y1: y, ajout: e.shiftKey ? new Set(selection) : new Set() };
      if (!e.shiftKey) selection.clear();
      sale = true;
      return;
    }
    if (sous) {
      if (e.shiftKey && outil === 'selection') {
        if (selection.has(sous.note.id)) selection.delete(sous.note.id); else selection.add(sous.note.id);
      } else if (!selection.has(sous.note.id)) selection = new Set([sous.note.id]);
      const notes = selectionnees();
      if (sous.bord) {
        geste = { type: 'etirer', ancre: sous.note.id, x0: x, origines: new Map(notes.map(n => [n.id, n.length])) };
      } else {
        geste = { type: 'deplacer', ancre: sous.note.id, x0: x, y0: y, origines: new Map(notes.map(n => [n.id, { tick: n.tick, pitch: n.pitch }])), copie: e.shiftKey && outil === 'crayon', bouge: false };
        jouer(sous.note.pitch, sous.note.velocity);
      }
      longueurNote = sous.note.length;
      sale = true;
      return;
    }
    // Crayon sur une case vide : nouvelle note, puis glisser pour l'allonger.
    const hh = hauteurDeY(y);
    const tick = Math.max(0, aimanter(tickDeX(x), g, 'bas'));
    const note: Note = { id: nouvelId(), tick, length: longueurNote, pitch: hh, velocity: 0.8 };
    modifier('Ajouter une note', n => { n.push(note); });
    selection = new Set([note.id]);
    geste = { type: 'etirer', ancre: note.id, x0: x, origines: new Map([[note.id, note.length]]) };
    jouer(hh);
  });

  const effacerSous = (x: number, y: number) => {
    const s = noteSous(x, y);
    if (!s) return;
    selection.delete(s.note.id);
    modifier('Effacer des notes', n => { const i = n.findIndex(z => z.id === s.note.id); if (i >= 0) n.splice(i, 1); }, true);
  };

  zoneNotes.addEventListener('pointermove', e => {
    const { x, y } = position(e, zoneNotes);
    survol = { x, y };
    if (!geste) {
      const s = noteSous(x, y);
      const outil = ui.get().outilPiano;
      zoneNotes.dataset['curseur'] = outil === 'gomme' ? 'gomme' : outil === 'decoupe' ? 'decoupe' : s?.bord ? 'etirer' : s ? 'deplacer' : outil === 'selection' ? 'selection' : 'crayon';
      sale = true;
      return;
    }
    const g = grilleCourante(e);
    if (geste.type === 'gomme') effacerSous(x, y);
    else if (geste.type === 'rectangle') {
      geste.x1 = x; geste.y1 = y;
      const t0 = tickDeX(Math.min(geste.x0, x)); const t1 = tickDeX(Math.max(geste.x0, x));
      const hHaut = hauteurDeY(Math.min(geste.y0, y)); const hBas = hauteurDeY(Math.max(geste.y0, y));
      selection = new Set(geste.ajout);
      for (const n of courant().notes) if (n.tick < t1 && n.tick + n.length > t0 && n.pitch <= hHaut && n.pitch >= hBas) selection.add(n.id);
      sale = true;
    } else if (geste.type === 'deplacer') {
      const ancre = geste.origines.get(geste.ancre);
      if (!ancre) return;
      if (!geste.bouge && Math.abs(x - geste.x0) < 3 && Math.abs(y - geste.y0) < 3) return;
      const origines = geste.origines;
      if (!geste.bouge && geste.copie) {
        // Maj+glisser : on laisse une copie à la place d'origine.
        const copies = copierNotes(selectionnees(), 0);
        modifier('Dupliquer des notes', n => { n.push(...copies); }, true);
      }
      geste.bouge = true;
      const minTick = Math.min(...[...origines.values()].map(o => o.tick));
      const pitches = [...origines.values()].map(o => o.pitch);
      let dt = aimanter(ancre.tick + (x - geste.x0) / zoomX, g) - ancre.tick;
      dt = Math.max(-minTick, dt);
      let dh = Math.round(-(y - geste.y0) / rangee);
      dh = borner(dh, -Math.min(...pitches), 127 - Math.max(...pitches));
      const label = geste.copie ? 'Dupliquer des notes' : origines.size > 1 ? `Déplacer ${origines.size} notes` : 'Déplacer une note';
      modifier(label, n => {
        for (const z of n) { const o = origines.get(z.id); if (o) { z.tick = o.tick + dt; z.pitch = o.pitch + dh; } }
      }, true);
      const nouvelle = ancre.pitch + dh;
      if (ecoute && ecoute.hauteur !== nouvelle) jouer(nouvelle);
      aideTemporaire(`${nomNote(nouvelle)} · ${(dt / 96 >= 0 ? '+' : '')}${(dt / 96).toFixed(2).replace('.', ',')} temps`);
    } else if (geste.type === 'etirer') {
      const ancre = geste.origines.get(geste.ancre);
      const n0 = courant().notes.find(n => n.id === (geste as { ancre: Id }).ancre);
      if (ancre === undefined || !n0) return;
      const finAncre = aimanter(n0.tick + ancre + (x - geste.x0) / zoomX, g);
      const dl = finAncre - (n0.tick + ancre);
      const min = Math.max(1, g > 1 ? g : 6);
      const origines = geste.origines;
      modifier(origines.size > 1 ? 'Étirer des notes' : 'Étirer une note', n => {
        for (const z of n) { const o = origines.get(z.id); if (o !== undefined) z.length = Math.max(min, o + dl); }
      }, true);
      longueurNote = Math.max(min, ancre + dl);
    }
  });
  const finirGeste = () => {
    if (!geste) return;
    geste = null;
    arreterEcoute();
    aideTemporaire(null);
    finGeste(store);
    sale = true;
  };
  zoneNotes.addEventListener('pointerup', finirGeste);
  zoneNotes.addEventListener('pointercancel', finirGeste);
  zoneNotes.addEventListener('pointerleave', () => { survol = null; sale = true; });

  // ---------- Défilement et zoom ----------
  const molette = (e: WheelEvent) => {
    e.preventDefault();
    const zone = zoneNotes.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - zone.left);
    else if (e.altKey) {
      const centre = (hauteurNotes() / 2 + defY) / rangee;
      rangee = borner(rangee + (e.deltaY < 0 ? 2 : -2), 8, 32);
      defY = centre * rangee - hauteurNotes() / 2;
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) defX += e.shiftKey ? e.deltaY : e.deltaX;
    else defY += e.deltaY;
    limiterDefilement();
    sale = true;
  };
  zoneNotes.addEventListener('wheel', molette, { passive: false });
  zoneClavier.addEventListener('wheel', molette, { passive: false });
  zoneVel.addEventListener('wheel', e => { e.preventDefault(); defX += e.deltaX || e.deltaY; limiterDefilement(); sale = true; }, { passive: false });
  zoneRegle.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - zoneRegle.getBoundingClientRect().left); }, { passive: false });

  // ---------- Clavier latéral ----------
  zoneClavier.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    zoneClavier.setPointerCapture(e.pointerId);
    const hh = hauteurDeY(position(e, zoneClavier).y);
    geste = { type: 'clavier', hauteur: hh };
    jouer(hh);
    sale = true;
  });
  zoneClavier.addEventListener('pointermove', e => {
    if (geste?.type !== 'clavier') return;
    const hh = hauteurDeY(position(e, zoneClavier).y);
    if (hh !== geste.hauteur) { geste.hauteur = hh; jouer(hh); sale = true; }
  });
  const finClavier = () => { if (geste?.type === 'clavier') { geste = null; arreterEcoute(); sale = true; } };
  zoneClavier.addEventListener('pointerup', finClavier);
  zoneClavier.addEventListener('pointercancel', finClavier);

  // ---------- Règle ----------
  zoneRegle.addEventListener('pointerdown', e => {
    const t = Math.max(0, aimanter(tickDeX(position(e, zoneRegle).x), MESURE / 4, 'bas'));
    if (ui.get().mode !== 'pattern') ui.set({ mode: 'pattern' });
    moteur.seek(t);
    if (!moteur.isPlaying()) { tete = t; sale = true; }
  });

  // ---------- Vélocités ----------
  const regleVelocite = (e: PointerEvent) => {
    const { x, y } = position(e, zoneVel);
    const v = borner(1 - (y - 6) / (zoneVel.clientHeight - 12), 0.02, 1);
    const t = tickDeX(x);
    const tol = 4 / zoomX;
    const sous = courant().notes.filter(n => Math.abs(n.tick - t) <= tol || (t >= n.tick && t <= n.tick + Math.min(n.length, 8 / zoomX)));
    if (!sous.length) return;
    const restreint = sous.some(n => selection.has(n.id)) ? sous.filter(n => selection.has(n.id)) : sous;
    const ids = new Set(restreint.map(n => n.id));
    modifier('Changer la vélocité', n => { for (const z of n) if (ids.has(z.id)) z.velocity = Math.round(v * 100) / 100; }, true);
    aideTemporaire(`Vélocité : ${Math.round(v * 100)} %`);
  };
  zoneVel.addEventListener('pointerdown', e => { if (e.button !== 0) return; zoneVel.setPointerCapture(e.pointerId); geste = { type: 'velocite' }; regleVelocite(e); });
  zoneVel.addEventListener('pointermove', e => { if (geste?.type === 'velocite') regleVelocite(e); });
  zoneVel.addEventListener('pointerup', finirGeste);
  zoneVel.addEventListener('pointercancel', finirGeste);

  // ---------- Raccourcis (seulement quand le piano roll est affiché) ----------
  ajouterRaccourcis(e => {
    if (ui.get().vue !== 'piano' || ui.get().clavier && !e.ctrlKey && !e.metaKey && /^Key|^Digit/.test(e.code)) return false;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 'a') toutSelectionner();
    else if (ctrl && k === 'c') copier();
    else if (ctrl && k === 'v') coller();
    else if (ctrl && k === 'd') dupliquer();
    else if (ctrl && k === 'x') { copier(); supprimerSelection(); }
    else if (ctrl) return false;
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !selection.size && document.activeElement === zoneNotes) {
      const n = noteAuCurseur();
      if (n) { modifier('Supprimer une note', l => { const i = l.findIndex(z => z.id === n.id); if (i >= 0) l.splice(i, 1); }); annoncer(`Note ${nomNote(n.pitch)} supprimée.`); }
    }
    else if (e.key === 'Delete' || e.key === 'Backspace') { const k = selection.size; supprimerSelection(); annoncer(`${k} note${k > 1 ? 's' : ''} supprimée${k > 1 ? 's' : ''}.`); }
    else if (e.key === 'Escape') { selection.clear(); sale = true; }
    else if (document.activeElement === zoneNotes && /^Arrow/.test(e.key) && !selection.size) {
      const g = Math.max(1, ui.get().grillePiano);
      bougerCurseur(e.key === 'ArrowRight' ? g : e.key === 'ArrowLeft' ? -g : 0, e.key === 'ArrowUp' ? (e.shiftKey ? 12 : 1) : e.key === 'ArrowDown' ? (e.shiftKey ? -12 : -1) : 0);
    }
    else if (document.activeElement === zoneNotes && (e.key === 'Enter' || e.key === 'Insert')) poserAuCurseur();
    else if (e.key === 'ArrowUp' && document.activeElement === zoneNotes) transposer(e.shiftKey ? 12 : 1);
    else if (e.key === 'ArrowDown' && document.activeElement === zoneNotes) transposer(e.shiftKey ? -12 : -1);
    else if (e.key === 'ArrowRight' && document.activeElement === zoneNotes) decaler(Math.max(1, ui.get().grillePiano));
    else if (e.key === 'ArrowLeft' && document.activeElement === zoneNotes) decaler(-Math.max(1, ui.get().grillePiano));
    else if (e.code === 'KeyQ' && !e.altKey) quantifierNotes();
    else if (e.code === 'KeyB' && !e.altKey) ui.set({ outilPiano: 'crayon' });
    else if (e.code === 'KeyE' && !e.altKey) ui.set({ outilPiano: 'gomme' });
    else if (e.code === 'KeyS' && !e.altKey) ui.set({ outilPiano: 'selection' });
    else if (e.code === 'KeyC' && !e.altKey) ui.set({ outilPiano: 'decoupe' });
    else return false;
    sale = true;
    return true;
  });

  // ---------- Dessin ----------
  let couleurs: Record<string, string> | null = null;
  const dessiner = () => {
    sale = false;
    const p = store.get();
    const { canal, pattern, notes } = courant(p);
    vide.hidden = !!canal;
    grille.hidden = !canal;
    if (!canal || !pattern) return;
    const L = largeurNotes();
    const H = hauteurNotes();
    if (L <= 0 || H <= 0) return;
    couleurs ??= { fond: jeton('fond'), panneau: jeton('panneau'), releve: jeton('releve'), filet: jeton('filet'), filetFort: jeton('filet-fort'), texte: jeton('texte'), doux: jeton('texte-doux'), faible: jeton('texte-faible'), accent: jeton('accent'), lecture: jeton('lecture') };
    const C = couleurs;
    const g = Math.max(1, ui.get().grillePiano);
    const t0 = tickDeX(0);
    const t1 = tickDeX(L);
    const hHaut = hauteurDeY(0);
    const hBas = hauteurDeY(H);
    const frappe = canal.instrument.type === 'frappe';
    const acide = canal.instrument.type === 'acide';

    // Grille de notes
    const cx = preparerCanvas(cNotes, L, H);
    cx.fillStyle = '#1b1e26';
    cx.fillRect(0, 0, L, H);
    for (let hh = hBas; hh <= hHaut; hh++) {
      const y = yDeHauteur(hh);
      if (estNoire(hh)) { cx.fillStyle = '#16181f'; cx.fillRect(0, y, L, rangee); }
      if (frappe && VOIX_FRAPPE[hh]) { cx.fillStyle = 'rgba(61,220,177,.05)'; cx.fillRect(0, y, L, rangee); }
      if (hh % 12 === 0) { cx.fillStyle = C.filetFort ?? ''; cx.fillRect(0, Math.round(y + rangee) - 1, L, 1); }
    }
    const pasGrille = g * zoomX >= 6 ? g : 24 * zoomX >= 6 ? 24 : 96;
    for (let t = Math.floor(t0 / pasGrille) * pasGrille; t <= t1; t += pasGrille) {
      const x = Math.round(xDeTick(t)) + 0.5;
      cx.fillStyle = t % MESURE === 0 ? '#3b4252' : t % 96 === 0 ? '#2c313d' : '#232731';
      cx.fillRect(x - 0.5, 0, 1, H);
    }
    // Au-delà de la fin du pattern
    const xFin = xDeTick(pattern.lengthTicks);
    if (xFin < L) { cx.fillStyle = 'rgba(0,0,0,.35)'; cx.fillRect(Math.max(0, xFin), 0, L - Math.max(0, xFin), H); cx.fillStyle = C.filetFort ?? ''; cx.fillRect(xFin, 0, 1, H); }

    // Fantômes
    if (fantomes) {
      cx.globalAlpha = 0.22;
      for (const c of p.channels) {
        if (c.id === canal.id) continue;
        cx.fillStyle = c.color;
        for (const n of pattern.notes[c.id] ?? []) {
          if (n.tick > t1 || n.tick + n.length < t0 || n.pitch < hBas || n.pitch > hHaut) continue;
          cx.fillRect(xDeTick(n.tick), yDeHauteur(n.pitch) + 2, Math.max(2, n.length * zoomX), rangee - 4);
        }
      }
      cx.globalAlpha = 1;
    }
    // Notes du canal
    cx.font = `${Math.min(11, rangee - 3)}px ${getComputedStyle(document.body).fontFamily}`;
    cx.textBaseline = 'middle';
    for (const n of notes) {
      if (n.tick > t1 || n.tick + n.length < t0 || n.pitch < hBas || n.pitch > hHaut) continue;
      const x = xDeTick(n.tick);
      const y = yDeHauteur(n.pitch);
      const w = Math.max(3, n.length * zoomX - 1);
      const sel = selection.has(n.id);
      cx.globalAlpha = 0.45 + 0.55 * n.velocity;
      cx.fillStyle = canal.color;
      cx.fillRect(x, y + 1, w, rangee - 2);
      cx.globalAlpha = 1;
      if (sel) { cx.strokeStyle = '#ffffff'; cx.lineWidth = 1.5; cx.strokeRect(x + 0.75, y + 1.75, w - 1.5, rangee - 3.5); }
      else { cx.fillStyle = 'rgba(0,0,0,.35)'; cx.fillRect(x, y + rangee - 2, w, 1); }
      // Acide : l'accent se voit (liseré clair en haut et marque « > »).
      if (acide && estAccent(n)) {
        cx.fillStyle = ACCENT;
        cx.fillRect(x, y + 1, w, Math.max(2, Math.round(rangee / 5)));
        if (w > 12 && rangee >= 10) { cx.fillStyle = '#0b0d11'; cx.fillText('>', x + w - 9, y + rangee / 2 + 0.5); }
      }
      if (w > 30 && rangee >= 12) { cx.fillStyle = '#0b0d11'; cx.fillText(frappe ? (VOIX_FRAPPE[n.pitch] ?? nomNote(n.pitch)) : nomNote(n.pitch), x + 4, y + rangee / 2 + 0.5, w - (acide && estAccent(n) ? 16 : 6)); }
    }
    // Acide : liaison dessinée entre deux notes qui se chevauchent (glissé).
    if (acide) {
      cx.strokeStyle = '#ffffff';
      cx.lineWidth = 2;
      cx.lineCap = 'round';
      for (const [a, b] of liaisonsGlisse(notes)) {
        if (b.tick > t1 || a.tick + a.length < t0) continue;
        const xb = xDeTick(b.tick);
        const ya = yDeHauteur(a.pitch) + rangee / 2;
        const yb = yDeHauteur(b.pitch) + rangee / 2;
        cx.beginPath();
        cx.moveTo(xb - Math.min(18, 6 * zoomX), ya);
        cx.bezierCurveTo(xb, ya, xb - 4, yb, xb + 4, yb);
        cx.stroke();
      }
      cx.lineCap = 'butt';
    }
    // Survol (crayon) : fantôme de la note qui serait posée
    if (survol && !geste && ui.get().outilPiano === 'crayon' && !noteSous(survol.x, survol.y)) {
      const t = Math.max(0, aimanter(tickDeX(survol.x), g, 'bas'));
      cx.strokeStyle = 'rgba(231,234,240,.35)';
      cx.lineWidth = 1;
      cx.strokeRect(xDeTick(t) + 0.5, yDeHauteur(hauteurDeY(survol.y)) + 1.5, Math.max(3, longueurNote * zoomX - 1), rangee - 3);
    }
    // Curseur clavier
    if (curseur.visible) {
      cx.strokeStyle = C.lecture ?? '';
      cx.lineWidth = 2;
      cx.strokeRect(xDeTick(curseur.tick) + 1, yDeHauteur(curseur.pitch) + 1, Math.max(6, longueurNote * zoomX - 2), rangee - 2);
    }
    // Rectangle de sélection
    if (geste?.type === 'rectangle') {
      const x = Math.min(geste.x0, geste.x1); const y = Math.min(geste.y0, geste.y1);
      cx.fillStyle = 'rgba(61,220,177,.08)';
      cx.fillRect(x, y, Math.abs(geste.x1 - geste.x0), Math.abs(geste.y1 - geste.y0));
      cx.strokeStyle = C.accent ?? '';
      cx.setLineDash([4, 3]);
      cx.strokeRect(x + 0.5, y + 0.5, Math.abs(geste.x1 - geste.x0), Math.abs(geste.y1 - geste.y0));
      cx.setLineDash([]);
    }
    // Tête de lecture
    if (tete >= 0) { const x = Math.round(xDeTick(tete)); cx.fillStyle = C.lecture ?? ''; cx.fillRect(x, 0, 1.5, H); }

    // Clavier
    const ck = preparerCanvas(cClavier, LARGEUR_CLAVIER, H);
    ck.fillStyle = C.panneau ?? '';
    ck.fillRect(0, 0, LARGEUR_CLAVIER, H);
    ck.font = `10px ${getComputedStyle(document.body).fontFamily}`;
    ck.textBaseline = 'middle';
    const enfoncee = geste?.type === 'clavier' ? geste.hauteur : ecoute?.hauteur ?? -1;
    for (let hh = hBas; hh <= hHaut; hh++) {
      const y = yDeHauteur(hh);
      const noire = estNoire(hh);
      ck.fillStyle = hh === enfoncee ? (C.accent ?? '') : noire ? '#0f1116' : '#d9dce3';
      ck.fillRect(noire ? 0 : 0, y, noire ? LARGEUR_CLAVIER * 0.62 : LARGEUR_CLAVIER, rangee);
      if (!noire) { ck.fillStyle = '#9aa0ad'; ck.fillRect(0, Math.round(y + rangee) - 1, LARGEUR_CLAVIER, 1); }
      const voix = frappe ? VOIX_FRAPPE[hh] : undefined;
      if (voix && rangee >= 10) {
        ck.fillStyle = 'rgba(18,20,25,.85)'; ck.fillRect(0, y, LARGEUR_CLAVIER, rangee);
        ck.fillStyle = C.accent ?? ''; ck.fillText(voix, 3, y + rangee / 2, LARGEUR_CLAVIER - 5);
      } else if (hh % 12 === 0 && rangee >= 9) { ck.fillStyle = '#3a3f4b'; ck.fillText(nomNote(hh), LARGEUR_CLAVIER - 24, y + rangee / 2); }
    }

    // Règle
    const cr = preparerCanvas(cRegle, L, HAUTEUR_REGLE);
    cr.fillStyle = C.panneau ?? '';
    cr.fillRect(0, 0, L, HAUTEUR_REGLE);
    cr.font = `10px ${getComputedStyle(document.body).fontFamily}`;
    cr.textBaseline = 'middle';
    const pasRegle = MESURE * zoomX >= 40 ? (96 * zoomX >= 24 ? 96 : MESURE) : MESURE * 4;
    for (let t = Math.floor(t0 / pasRegle) * pasRegle; t <= t1; t += pasRegle) {
      const x = Math.round(xDeTick(t));
      const mesure = t % MESURE === 0;
      cr.fillStyle = mesure ? (C.doux ?? '') : (C.faible ?? '');
      cr.fillRect(x, mesure ? 6 : 14, 1, HAUTEUR_REGLE);
      if (mesure) cr.fillText(String(t / MESURE + 1), x + 4, 10);
    }
    cr.fillStyle = C.filet ?? '';
    cr.fillRect(0, HAUTEUR_REGLE - 1, L, 1);
    if (tete >= 0) { const x = Math.round(xDeTick(tete)); cr.fillStyle = C.lecture ?? ''; cr.beginPath(); cr.moveTo(x - 5, 0); cr.lineTo(x + 5, 0); cr.lineTo(x, 8); cr.fill(); }

    // Vélocités
    const HV = zoneVel.clientHeight || HAUTEUR_VELOCITES;
    const cv = preparerCanvas(cVel, L, HV);
    cv.fillStyle = '#16181f';
    cv.fillRect(0, 0, L, HV);
    cv.fillStyle = C.filet ?? '';
    cv.fillRect(0, 0, L, 1);
    // Acide : seuil de l'accent (vélocité 0,8) en pointillés.
    if (acide) {
      const ya = Math.round(HV - 6 - (HV - 12) * 0.8) + 0.5;
      cv.strokeStyle = ACCENT;
      cv.globalAlpha = 0.5;
      cv.setLineDash([4, 4]);
      cv.beginPath(); cv.moveTo(0, ya); cv.lineTo(L, ya); cv.stroke();
      cv.setLineDash([]);
      cv.globalAlpha = 1;
    }
    for (const n of notes) {
      if (n.tick > t1 || n.tick < t0 - 20) continue;
      const x = Math.round(xDeTick(n.tick));
      const hv = (HV - 12) * n.velocity;
      cv.fillStyle = selection.has(n.id) ? '#ffffff' : acide && estAccent(n) ? ACCENT : canal.color;
      cv.fillRect(x, HV - 6 - hv, 2, hv);
      cv.beginPath(); cv.arc(x + 1, HV - 6 - hv, 3, 0, Math.PI * 2); cv.fill();
    }
  };

  // ---------- Synchronisation ----------
  const majBarre = () => {
    const p = store.get();
    const u = ui.get();
    choixCanal.options(p.channels.map(c => ({ value: c.id, label: c.name })));
    choixCanal.definir(u.canalId ?? '');
    choixGrille.definir(String(u.grillePiano));
    for (const [i, b] of boutonsOutils.entries()) b.setAttribute('aria-pressed', String(OUTILS[i]?.id === u.outilPiano));
    zoneNotes.dataset['outil'] = u.outilPiano;
    const k = `${u.canalId}|${u.patternId}`;
    if (k !== cle) {
      cle = k;
      selection.clear();
      // Centre la vue sur les notes existantes, ou sur la hauteur de base du canal.
      const { canal, notes } = courant(p);
      const centre = notes.length ? notes.reduce((s, n) => s + n.pitch, 0) / notes.length : canal?.rootPitch ?? 60;
      if (hauteurNotes() > 0) { defY = (127 - centre) * rangee - hauteurNotes() / 2; limiterDefilement(); }
      else defY = (127 - centre - 12) * rangee;
    }
    sale = true;
  };
  store.subscribe(() => {
    // Les notes supprimées (annuler…) quittent la sélection.
    const ids = new Set(courant().notes.map(n => n.id));
    for (const id of selection) if (!ids.has(id)) selection.delete(id);
    majBarre();
  });
  ui.subscribe(majBarre);
  moteur.onPosition(t => {
    const u = ui.get();
    const nt = u.mode === 'pattern' ? t : -1;
    if (nt !== tete) { tete = nt; sale = true; }
    // Suivi : si la tête sort de l'écran pendant la lecture, la page tourne.
    if (moteur.isPlaying() && tete >= 0 && !geste) {
      const x = xDeTick(tete);
      if (x > largeurNotes() - 20 || x < 0) { defX = Math.max(0, tete * zoomX - 40); sale = true; }
    }
  });
  new ResizeObserver(() => { limiterDefilement(); sale = true; }).observe(zoneNotes);
  const boucle = () => {
    if (sale && !el.hidden && el.isConnected) dessiner();
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
  majBarre();
  return el;
}
