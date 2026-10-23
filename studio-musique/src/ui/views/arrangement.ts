// Arrangement (étape 2.5) : pistes, clips de patterns (couleur, nom, aperçu des notes), poser depuis
// la liste des patterns (clic ou glisser-déposer), déplacer, étirer (répète le pattern), rogner,
// couper, dupliquer, boucle de lecture sur la règle, zoom, muet de piste.

import type { ArrangementTrack, Clip, Id, Pattern, Project } from '../../project/types';
import { aide, aideTemporaire } from '../aide';
import { bouton } from '../components/button';
import { demanderTexte } from '../components/dialog';
import { ouvrirMenu } from '../components/menu';
import { liste } from '../components/select';
import { interrupteur } from '../components/toggle';
import { decouperClip, rognerDebut } from '../clips';
import type { Contexte } from '../contexte';
import { borner, h, jeton, preparerCanvas } from '../dom';
import { finGeste } from '../geste';
import { aimanter, nouvelId } from '../notes';
import { ajouterRaccourcis } from '../shortcuts';

const MESURE = 384;
const HAUTEUR_REGLE = 26;
const BORD = 7;
export const GRILLES_ARRANGEMENT: { ticks: number; nom: string }[] = [
  { ticks: 1536, nom: '4 mesures' }, { ticks: 384, nom: '1 mesure' }, { ticks: 96, nom: '1 temps' }, { ticks: 24, nom: '1/16' }, { ticks: 1, nom: 'Sans aimant' },
];
const OUTILS = [
  { id: 'crayon', nom: 'Crayon', touche: 'B', icone: 'crayon', aide: 'Clic : poser le pattern courant (glisser pour l\'étirer). Glisser un clip : le déplacer ; ses bords : l\'étirer ou le rogner. Clic droit : supprimer.' },
  { id: 'gomme', nom: 'Gomme', touche: 'E', icone: 'gomme', aide: 'Cliquer ou glisser sur des clips pour les supprimer.' },
  { id: 'selection', nom: 'Sélection', touche: 'S', icone: 'selection', aide: 'Glisser pour sélectionner (Maj ajoute), puis déplacer la sélection.' },
  { id: 'decoupe', nom: 'Découpe', touche: 'C', icone: 'decoupe', aide: 'Cliquer sur un clip pour le couper à la grille.' },
] as const;

type Geste =
  | { type: 'deplacer'; x0: number; y0: number; ancre: Id; origines: Map<Id, { start: number; piste: number }>; bouge: boolean }
  | { type: 'etirer'; x0: number; ancre: Id; origines: Map<Id, number> }
  | { type: 'rogner'; ancre: Id; origines: Map<Id, Clip> }
  | { type: 'rectangle'; x0: number; y0: number; x1: number; y1: number; ajout: Set<Id> }
  | { type: 'gomme' }
  | { type: 'boucle'; t0: number; bouge: boolean };

export function vueArrangement(ctx: Contexte): HTMLElement {
  const { store, ui, moteur } = ctx;
  let zoomX = 0.12;            // px par tick (1 mesure = 46 px)
  let defX = 0;
  let defY = 0;
  let selection = new Set<Id>();
  let geste: Geste | null = null;
  let survol: { x: number; y: number } | null = null;
  let tete = 0;
  let sale = true;
  let presse: { clips: Clip[]; debut: number } | null = null;
  const curseur = { tick: 0, piste: 0, visible: false };

  // ---------- Barre d'outils ----------
  const boutonsOutils = OUTILS.map(o => bouton({ icone: o.icone, libelle: o.nom, raccourci: o.touche, variante: 'outil', aide: `${o.nom} (${o.touche}) : ${o.aide}`, surClic: () => ui.set({ outilArrangement: o.id }) }));
  const choixGrille = liste({ libelle: 'Grille', options: GRILLES_ARRANGEMENT.map(g => ({ value: String(g.ticks), label: g.nom })), valeur: String(ui.get().grilleArrangement), aide: 'aimant des clips. Alt en glissant le désactive.', surChange: v => ui.set({ grilleArrangement: Number(v) }) });
  const zoom = (f: number, ax = largeur() / 2) => {
    const t = (ax + defX) / zoomX;
    zoomX = borner(zoomX * f, 0.01, 1.5);
    defX = Math.max(0, t * zoomX - ax);
    sale = true;
  };
  const btnBoucle = bouton({ icone: 'boucle', libelle: 'Supprimer la boucle', variante: 'discret', aide: 'Glisser sur la règle pour créer une boucle de lecture ; ce bouton la supprime.', surClic: () => store.update('Supprimer la boucle', d => { d.arrangement.loop = null; }) });
  const barre = h('div', { class: 'ar-barre barre-vue', role: 'toolbar', 'aria-label': 'Outils de l\'arrangement' },
    h('div', { class: 'groupe-outils', role: 'group', 'aria-label': 'Outil' }, ...boutonsOutils),
    choixGrille.el, btnBoucle,
    h('span', { class: 'espace' }),
    bouton({ icone: 'moins', libelle: 'Dézoomer', variante: 'discret', surClic: () => zoom(1 / 1.25) }),
    bouton({ icone: 'plus', libelle: 'Zoomer', variante: 'discret', surClic: () => zoom(1.25) }));

  // ---------- Liste des patterns ----------
  const listePatterns = h('ul', { class: 'ar-patterns', 'aria-label': 'Patterns à poser' });
  aide(listePatterns, 'Patterns : cliquer pour choisir celui que le crayon pose, ou glisser un pattern sur une piste.');

  // ---------- Pistes ----------
  const entetes = h('div', { class: 'ar-entetes-contenu' });
  const colonneEntetes = h('div', { class: 'ar-entetes' }, h('div', { class: 'ar-coin' }), h('div', { class: 'ar-entetes-fenetre' }, entetes));
  const cRegle = h('canvas', { 'aria-hidden': 'true' });
  const cPistes = h('canvas', { role: 'img', 'aria-label': 'Pistes de l\'arrangement' });
  const zoneRegle = h('div', { class: 'ar-zone-regle' }, cRegle);
  aide(zoneRegle, 'Règle : cliquer pour placer la tête de lecture, glisser pour créer une boucle.');
  const zonePistes = h('div', { class: 'ar-zone-pistes', tabindex: 0, 'aria-label': 'Pistes. Flèches : déplacer le curseur ; Entrée : poser le pattern courant ; Suppr : effacer. Ctrl+D duplique la sélection, Échap la vide.' }, cPistes);
  aide(zonePistes, 'Molette : défiler les pistes. Maj+molette : défiler dans le temps. Ctrl+molette : zoom.');
  const annonce = h('p', { class: 'lecteur', 'aria-live': 'polite' });
  const temps = h('div', { class: 'ar-temps' }, zoneRegle, zonePistes, annonce);
  const el = h('section', { class: 'vue vue-arrangement', id: 'vue-arrangement', role: 'tabpanel', 'aria-labelledby': 'onglet-arrangement' },
    barre, h('div', { class: 'ar-corps' }, h('div', { class: 'ar-gauche' }, h('h3', { class: 'ar-titre' }, 'Patterns'), listePatterns), colonneEntetes, temps));

  const largeur = () => zonePistes.clientWidth;
  const hauteur = () => zonePistes.clientHeight;

  // ---------- Géométrie ----------
  const pistes = (): readonly ArrangementTrack[] => store.get().arrangement.tracks;
  const hauteurPiste = (t: ArrangementTrack) => borner(t.height || 48, 28, 160);
  const yPiste = (i: number) => { let y = 0; const ts = pistes(); for (let k = 0; k < i; k++) y += hauteurPiste(ts[k] as ArrangementTrack); return y - defY; };
  const pisteDeY = (y: number): number => {
    let acc = -defY;
    const ts = pistes();
    for (const [i, t] of ts.entries()) { acc += hauteurPiste(t); if (y < acc) return i; }
    return ts.length - 1;
  };
  const xDeTick = (t: number) => t * zoomX - defX;
  const tickDeX = (x: number) => (x + defX) / zoomX;
  const hauteurTotale = () => pistes().reduce((s, t) => s + hauteurPiste(t), 0);
  const limiter = () => { defX = Math.max(0, defX); defY = borner(defY, 0, Math.max(0, hauteurTotale() - hauteur())); };
  const pos = (e: PointerEvent | MouseEvent, z: HTMLElement) => { const r = z.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const grilleCourante = (e?: { altKey: boolean }) => (e?.altKey ? 1 : ui.get().grilleArrangement);
  const patternDe = (p: Readonly<Project>, id: Id): Pattern | undefined => p.patterns.find(x => x.id === id);

  const clipSous = (x: number, y: number): { clip: Clip; bord: 'debut' | 'fin' | null } | null => {
    const ts = pistes();
    const i = pisteDeY(y);
    const piste = ts[i];
    if (!piste || y < yPiste(0) || y > yPiste(ts.length)) return null;
    const t = tickDeX(x);
    const clips = store.get().arrangement.clips;
    for (let k = clips.length - 1; k >= 0; k--) {
      const c = clips[k];
      if (!c || c.trackId !== piste.id || t < c.start || t > c.start + c.length) continue;
      const x0 = xDeTick(c.start); const x1 = xDeTick(c.start + c.length);
      const large = x1 - x0 > BORD * 3;
      return { clip: c, bord: large && x1 - x <= BORD ? 'fin' : large && x - x0 <= BORD ? 'debut' : null };
    }
    return null;
  };

  const modifierClips = (label: string, f: (clips: Clip[], d: Project) => void, merge = false) =>
    store.update(label, d => { f(d.arrangement.clips, d); d.arrangement.clips = d.arrangement.clips.filter(c => c.length > 0); }, merge ? { merge: true } : undefined);

  // ---------- Commandes ----------
  const supprimer = () => {
    if (!selection.size) return;
    const ids = new Set(selection);
    modifierClips(ids.size > 1 ? `Supprimer ${ids.size} clips` : 'Supprimer un clip', c => { const r = c.filter(x => !ids.has(x.id)); c.length = 0; c.push(...r); });
    selection.clear();
  };
  const selectionnes = () => store.get().arrangement.clips.filter(c => selection.has(c.id));
  const dupliquer = () => {
    const s = selectionnes();
    if (!s.length) return;
    const g = Math.max(1, ui.get().grilleArrangement);
    const debut = Math.min(...s.map(c => c.start));
    const fin = Math.ceil(Math.max(...s.map(c => c.start + c.length)) / g) * g;
    const copies = s.map(c => ({ ...c, id: nouvelId(), start: c.start + fin - Math.floor(debut / g) * g }));
    modifierClips('Dupliquer des clips', c => { c.push(...copies); });
    selection = new Set(copies.map(c => c.id));
  };
  const copier = () => { const s = selectionnes(); if (s.length) presse = { clips: s.map(c => ({ ...c })), debut: Math.min(...s.map(c => c.start)) }; };
  const coller = () => {
    if (!presse) return;
    const g = Math.max(1, ui.get().grilleArrangement);
    const ou = aimanter(tete, g, 'bas');
    const copies = presse.clips.map(c => ({ ...c, id: nouvelId(), start: c.start - (presse?.debut ?? 0) + ou }));
    modifierClips('Coller des clips', c => { c.push(...copies); });
    selection = new Set(copies.map(c => c.id));
  };

  // ---------- Poser un pattern ----------
  const poser = (patternId: Id, piste: number, tick: number): Clip | null => {
    const p = store.get();
    const pt = patternDe(p, patternId);
    const tr = p.arrangement.tracks[piste];
    if (!pt || !tr) return null;
    const clip: Clip = { id: nouvelId(), trackId: tr.id, patternId, start: Math.max(0, tick), length: pt.lengthTicks, offset: 0 };
    modifierClips('Poser un clip', c => { c.push(clip); });
    selection = new Set([clip.id]);
    return clip;
  };

  zonePistes.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('application/x-frequence-pattern')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  zonePistes.addEventListener('drop', e => {
    const id = e.dataTransfer?.getData('application/x-frequence-pattern');
    if (!id) return;
    e.preventDefault();
    const { x, y } = pos(e, zonePistes);
    ui.set({ patternId: id });
    poser(id, pisteDeY(y), aimanter(tickDeX(x), grilleCourante(e), 'bas'));
    finGeste(store);
  });

  // ---------- Souris sur les pistes ----------
  zonePistes.addEventListener('contextmenu', e => e.preventDefault());
  zonePistes.addEventListener('pointerdown', e => {
    const { x, y } = pos(e, zonePistes);
    zonePistes.focus({ preventScroll: true });
    zonePistes.setPointerCapture(e.pointerId);
    curseur.visible = false;
    curseur.tick = Math.max(0, aimanter(tickDeX(x), Math.max(96, grilleCourante(e)), 'bas'));
    curseur.piste = pisteDeY(y);
    const outil = ui.get().outilArrangement;
    const sous = clipSous(x, y);
    const g = grilleCourante(e);
    if (e.button === 2 || outil === 'gomme') { geste = { type: 'gomme' }; if (sous) effacer(sous.clip.id); return; }
    if (e.button !== 0) return;
    if (outil === 'decoupe') { if (sous) modifierClips('Couper un clip', c => { decouperClip(c, sous.clip.id, aimanter(tickDeX(x), g)); }); return; }
    if (outil === 'selection' ? !sous : (e.ctrlKey || e.metaKey)) {
      geste = { type: 'rectangle', x0: x, y0: y, x1: x, y1: y, ajout: e.shiftKey ? new Set(selection) : new Set() };
      if (!e.shiftKey) selection.clear();
      sale = true;
      return;
    }
    if (sous) {
      if (e.shiftKey) { if (selection.has(sous.clip.id)) selection.delete(sous.clip.id); else selection.add(sous.clip.id); }
      else if (!selection.has(sous.clip.id)) selection = new Set([sous.clip.id]);
      if (ui.get().patternId !== sous.clip.patternId) ui.set({ patternId: sous.clip.patternId });
      const s = selectionnes();
      const ts = pistes();
      if (sous.bord === 'fin') geste = { type: 'etirer', x0: x, ancre: sous.clip.id, origines: new Map(s.map(c => [c.id, c.length])) };
      else if (sous.bord === 'debut') geste = { type: 'rogner', ancre: sous.clip.id, origines: new Map(s.map(c => [c.id, { ...c }])) };
      else geste = { type: 'deplacer', x0: x, y0: y, ancre: sous.clip.id, bouge: false, origines: new Map(s.map(c => [c.id, { start: c.start, piste: ts.findIndex(t => t.id === c.trackId) }])) };
      sale = true;
      return;
    }
    const clip = poser(ui.get().patternId, pisteDeY(y), aimanter(tickDeX(x), g, 'bas'));
    if (clip) geste = { type: 'etirer', x0: x, ancre: clip.id, origines: new Map([[clip.id, clip.length]]) };
  });
  const effacer = (id: Id) => {
    selection.delete(id);
    modifierClips('Supprimer des clips', c => { const i = c.findIndex(x => x.id === id); if (i >= 0) c.splice(i, 1); }, true);
  };
  zonePistes.addEventListener('pointermove', e => {
    const { x, y } = pos(e, zonePistes);
    survol = { x, y };
    const g = grilleCourante(e);
    if (!geste) {
      const s = clipSous(x, y);
      const o = ui.get().outilArrangement;
      zonePistes.dataset['curseur'] = o === 'gomme' ? 'gomme' : o === 'decoupe' ? 'decoupe' : s?.bord ? 'etirer' : s ? 'deplacer' : o === 'selection' ? 'selection' : 'crayon';
      sale = true;
      return;
    }
    if (geste.type === 'gomme') { const s = clipSous(x, y); if (s) effacer(s.clip.id); }
    else if (geste.type === 'rectangle') {
      geste.x1 = x; geste.y1 = y;
      const t0 = tickDeX(Math.min(geste.x0, x)); const t1 = tickDeX(Math.max(geste.x0, x));
      const p0 = pisteDeY(Math.min(geste.y0, y)); const p1 = pisteDeY(Math.max(geste.y0, y));
      const ts = pistes();
      selection = new Set(geste.ajout);
      for (const c of store.get().arrangement.clips) {
        const i = ts.findIndex(t => t.id === c.trackId);
        if (i >= p0 && i <= p1 && c.start < t1 && c.start + c.length > t0) selection.add(c.id);
      }
      sale = true;
    } else if (geste.type === 'deplacer') {
      if (!geste.bouge && Math.abs(x - geste.x0) < 3 && Math.abs(y - geste.y0) < 3) return;
      geste.bouge = true;
      const o = geste.origines;
      const ancre = o.get(geste.ancre);
      if (!ancre) return;
      const min = Math.min(...[...o.values()].map(v => v.start));
      const dt = Math.max(-min, aimanter(ancre.start + (x - geste.x0) / zoomX, g) - ancre.start);
      const ts = pistes();
      const indices = [...o.values()].map(v => v.piste);
      const dp = borner(pisteDeY(y) - ancre.piste, -Math.min(...indices), ts.length - 1 - Math.max(...indices));
      modifierClips(o.size > 1 ? `Déplacer ${o.size} clips` : 'Déplacer un clip', c => {
        for (const z of c) { const v = o.get(z.id); if (v) { z.start = v.start + dt; z.trackId = ts[v.piste + dp]?.id ?? z.trackId; } }
      }, true);
      aideTemporaire(`Mesure ${(Math.floor((ancre.start + dt) / MESURE) + 1)} · ${ts[ancre.piste + dp]?.name ?? ''}`);
    } else if (geste.type === 'etirer') {
      const o = geste.origines;
      const c0 = store.get().arrangement.clips.find(c => c.id === (geste as { ancre: Id }).ancre);
      const l0 = o.get(geste.ancre);
      if (!c0 || l0 === undefined) return;
      const min = Math.max(24, g > 1 ? g : 24);
      const dl = aimanter(c0.start + l0 + (x - geste.x0) / zoomX, g) - (c0.start + l0);
      modifierClips('Étirer des clips', c => { for (const z of c) { const v = o.get(z.id); if (v !== undefined) z.length = Math.max(min, v + dl); } }, true);
    } else if (geste.type === 'rogner') {
      const o = geste.origines;
      const a = o.get(geste.ancre);
      if (!a) return;
      const min = Math.max(24, g > 1 ? g : 24);
      const d = aimanter(tickDeX(x), g) - a.start;
      modifierClips('Rogner des clips', c => { for (const z of c) { const v = o.get(z.id); if (v) { Object.assign(z, v); rognerDebut(z, v.start + d, min); } } }, true);
    }
  });
  const fin = () => { if (!geste) return; geste = null; aideTemporaire(null); finGeste(store); sale = true; };
  zonePistes.addEventListener('pointerup', fin);
  zonePistes.addEventListener('pointercancel', fin);
  zonePistes.addEventListener('pointerleave', () => { survol = null; sale = true; });
  zonePistes.addEventListener('dblclick', e => {
    const { x, y } = pos(e, zonePistes);
    const s = clipSous(x, y);
    if (s) ui.set({ patternId: s.clip.patternId, vue: 'piano' });
  });

  // ---------- Défilement ----------
  const molette = (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - zonePistes.getBoundingClientRect().left);
    else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) defX += e.shiftKey ? e.deltaY : e.deltaX;
    else defY += e.deltaY;
    limiter();
    sale = true;
  };
  zonePistes.addEventListener('wheel', molette, { passive: false });
  colonneEntetes.addEventListener('wheel', molette, { passive: false });
  zoneRegle.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - zoneRegle.getBoundingClientRect().left); }, { passive: false });

  // ---------- Règle : tête de lecture et boucle ----------
  zoneRegle.addEventListener('pointerdown', e => {
    if (e.button === 2) return;
    zoneRegle.setPointerCapture(e.pointerId);
    geste = { type: 'boucle', t0: aimanter(tickDeX(pos(e, zoneRegle).x), Math.max(96, grilleCourante(e)), 'bas'), bouge: false };
  });
  zoneRegle.addEventListener('pointermove', e => {
    if (geste?.type !== 'boucle') return;
    const g = Math.max(96, grilleCourante(e));
    const t = aimanter(tickDeX(pos(e, zoneRegle).x), g);
    if (!geste.bouge && Math.abs(t - geste.t0) < g) return;
    geste.bouge = true;
    const a = Math.max(0, Math.min(geste.t0, t)); const b = Math.max(geste.t0, t);
    if (b - a >= g) store.update('Définir la boucle', d => { d.arrangement.loop = { start: a, end: b }; }, { merge: true });
  });
  zoneRegle.addEventListener('pointerup', () => {
    if (geste?.type !== 'boucle') return;
    const g = geste;
    geste = null;
    if (g.bouge) { finGeste(store); return; }
    if (ui.get().mode !== 'morceau') ui.set({ mode: 'morceau' });
    moteur.seek(g.t0);
    if (!moteur.isPlaying()) { tete = g.t0; sale = true; }
  });
  zoneRegle.addEventListener('contextmenu', e => {
    e.preventDefault();
    ouvrirMenu([{ texte: 'Supprimer la boucle', desactive: !store.get().arrangement.loop, action: () => store.update('Supprimer la boucle', d => { d.arrangement.loop = null; }) }], { x: e.clientX, y: e.clientY }, 'Boucle');
  });

  // ---------- Curseur clavier ----------
  const bougerCurseur = (dt: number, dp: number) => {
    curseur.visible = true;
    curseur.tick = Math.max(0, curseur.tick + dt);
    curseur.piste = borner(curseur.piste + dp, 0, pistes().length - 1);
    const x = xDeTick(curseur.tick);
    if (x < 0 || x > largeur() - 60) defX = Math.max(0, curseur.tick * zoomX - largeur() / 3);
    const y = yPiste(curseur.piste);
    if (y < 0 || y > hauteur() - 40) defY += y - hauteur() / 3;
    limiter();
    sale = true;
    annonce.textContent = `${pistes()[curseur.piste]?.name ?? ''}, mesure ${Math.floor(curseur.tick / MESURE) + 1}`;
  };
  const clipAuCurseur = () => {
    const tr = pistes()[curseur.piste];
    return store.get().arrangement.clips.find(c => c.trackId === tr?.id && curseur.tick >= c.start && curseur.tick < c.start + c.length);
  };
  zonePistes.addEventListener('focus', () => { if (zonePistes.matches(':focus-visible')) { curseur.visible = true; sale = true; } });
  zonePistes.addEventListener('blur', () => { curseur.visible = false; sale = true; });

  // ---------- Raccourcis ----------
  ajouterRaccourcis(e => {
    if (ui.get().vue !== 'arrangement') return false;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 'a') selection = new Set(store.get().arrangement.clips.map(c => c.id));
    else if (ctrl && k === 'd') dupliquer();
    else if (ctrl && k === 'c') copier();
    else if (ctrl && k === 'v') coller();
    else if (ctrl && k === 'x') { copier(); supprimer(); }
    else if (ctrl) return false;
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !selection.size && document.activeElement === zonePistes) {
      const c = clipAuCurseur();
      if (c) { modifierClips('Supprimer un clip', l => { const i = l.findIndex(x => x.id === c.id); if (i >= 0) l.splice(i, 1); }); annonce.textContent = 'Clip supprimé.'; }
    }
    else if (e.key === 'Delete' || e.key === 'Backspace') supprimer();
    else if (e.key === 'Escape') selection.clear();
    else if (document.activeElement === zonePistes && /^Arrow/.test(e.key)) {
      const g = Math.max(96, ui.get().grilleArrangement);
      bougerCurseur(e.key === 'ArrowRight' ? g : e.key === 'ArrowLeft' ? -g : 0, e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0);
    }
    else if (document.activeElement === zonePistes && (e.key === 'Enter' || e.key === 'Insert')) {
      const c = poser(ui.get().patternId, curseur.piste, curseur.tick);
      if (c) { annonce.textContent = `Clip posé, ${Math.round(c.length / MESURE)} mesure(s).`; bougerCurseur(c.length, 0); }
    }
    else if (ui.get().clavier) return false;
    else if (e.code === 'KeyB' && !e.altKey) ui.set({ outilArrangement: 'crayon' });
    else if (e.code === 'KeyE' && !e.altKey) ui.set({ outilArrangement: 'gomme' });
    else if (e.code === 'KeyS' && !e.altKey) ui.set({ outilArrangement: 'selection' });
    else if (e.code === 'KeyC' && !e.altKey) ui.set({ outilArrangement: 'decoupe' });
    else return false;
    sale = true;
    return true;
  });

  // ---------- En-têtes de pistes et liste des patterns ----------
  const lignesEntetes = new Map<Id, { el: HTMLElement; nom: HTMLButtonElement; mute: ReturnType<typeof interrupteur> }>();
  const majEntetes = () => {
    const ts = pistes();
    for (const [id, l] of lignesEntetes) if (!ts.some(t => t.id === id)) { l.el.remove(); lignesEntetes.delete(id); }
    for (const [i, t] of ts.entries()) {
      let l = lignesEntetes.get(t.id);
      if (!l) {
        const id = t.id;
        const nom = h('button', { type: 'button', class: 'ar-nom' });
        aide(nom, 'Double-clic : renommer la piste.');
        nom.addEventListener('dblclick', async () => {
          const tr = pistes().find(x => x.id === id);
          const n = tr && await demanderTexte('Renommer la piste', 'Nom de la piste', tr.name);
          if (n) store.update('Renommer la piste', d => { const x = d.arrangement.tracks.find(z => z.id === id); if (x) x.name = n; });
        });
        const mute = interrupteur({ libelle: `Muet : ${t.name}`, texte: 'M', variante: 'mute', actif: t.mute, aide: 'Coupe cette piste de l\'arrangement.', surChange: a => store.update(a ? 'Couper une piste' : 'Rétablir une piste', d => { const x = d.arrangement.tracks.find(z => z.id === id); if (x) x.mute = a; }) });
        l = { el: h('div', { class: 'ar-entete' }, nom, mute.el), nom, mute };
        lignesEntetes.set(id, l);
      }
      l.nom.textContent = t.name;
      l.mute.definir(t.mute);
      l.mute.el.setAttribute('aria-label', `Muet : ${t.name}`);
      l.el.style.height = `${hauteurPiste(t)}px`;
      l.el.style.setProperty('--couleur', t.color);
      l.el.classList.toggle('muet', t.mute);
      if (entetes.children[i] !== l.el) entetes.insertBefore(l.el, entetes.children[i] ?? null);
    }
  };
  const majPatterns = () => {
    const p = store.get();
    const courantId = ui.get().patternId;
    listePatterns.replaceChildren(...p.patterns.map(pt => {
      const b = h('button', { type: 'button', class: 'ar-pattern', draggable: 'true', 'aria-pressed': String(pt.id === courantId) },
        h('span', { class: 'pastille-couleur', 'aria-hidden': 'true' }), h('span', null, pt.name));
      b.style.setProperty('--couleur', pt.color);
      b.addEventListener('click', () => ui.set({ patternId: pt.id }));
      b.addEventListener('dragstart', e => { e.dataTransfer?.setData('application/x-frequence-pattern', pt.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'; });
      return h('li', null, b);
    }));
  };

  // ---------- Dessin ----------
  let C: Record<string, string> | null = null;
  const apercus = new WeakMap<Pattern, { l: number; h: number; c: HTMLCanvasElement | null }>();
  /** Image des notes d'un pattern (toutes les notes de tous les canaux), mise en cache. */
  const apercuPattern = (pt: Pattern, largeurPx: number, hauteurPx: number): HTMLCanvasElement | null => {
    const l = Math.max(1, Math.round(largeurPx)); const hp = Math.max(1, Math.round(hauteurPx));
    const deja = apercus.get(pt);
    if (deja && deja.l === l && deja.h === hp) return deja.c;
    const toutes = Object.values(pt.notes).flat();
    let c: HTMLCanvasElement | null = null;
    if (toutes.length && l <= 8192) {
      c = document.createElement('canvas');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.ceil(l * dpr); c.height = Math.ceil(hp * dpr);
      const g = c.getContext('2d');
      if (g) {
        g.scale(dpr, dpr);
        let hMin = 127; let hMax = 0;
        for (const n of toutes) { hMin = Math.min(hMin, n.pitch); hMax = Math.max(hMax, n.pitch); }
        const etage = Math.max(1, hMax - hMin + 1);
        const z = l / Math.max(1, pt.lengthTicks);
        g.fillStyle = 'rgba(231,234,240,.75)';
        for (const n of toutes) {
          if (n.tick >= pt.lengthTicks) continue;
          g.fillRect(n.tick * z, hp - ((n.pitch - hMin + 1) / etage) * hp, Math.max(1, Math.min(n.length, pt.lengthTicks - n.tick) * z - 0.5), Math.max(1.5, hp / etage - 1));
        }
      }
    }
    apercus.set(pt, { l, h: hp, c });
    return c;
  };
  const dessiner = () => {
    sale = false;
    const L = largeur(); const H = hauteur();
    if (L <= 0 || H <= 0) return;
    C ??= { panneau: jeton('panneau'), filet: jeton('filet'), filetFort: jeton('filet-fort'), texte: jeton('texte'), doux: jeton('texte-doux'), faible: jeton('texte-faible'), accent: jeton('accent'), lecture: jeton('lecture') };
    const p = store.get();
    const ts = p.arrangement.tracks;
    const t0 = tickDeX(0); const t1 = tickDeX(L);
    const g = Math.max(1, ui.get().grilleArrangement);
    const police = getComputedStyle(document.body).fontFamily;
    entetes.style.transform = `translateY(${-defY}px)`;

    const cx = preparerCanvas(cPistes, L, H);
    cx.fillStyle = '#16181f';
    cx.fillRect(0, 0, L, H);
    for (const [i, t] of ts.entries()) {
      const y = yPiste(i);
      cx.fillStyle = i % 2 ? '#1a1d24' : '#1c1f27';
      cx.fillRect(0, y, L, hauteurPiste(t));
      cx.fillStyle = '#121419';
      cx.fillRect(0, y + hauteurPiste(t) - 1, L, 1);
    }
    const pasG = g * zoomX >= 8 ? g : 96 * zoomX >= 8 ? 96 : MESURE * zoomX >= 8 ? MESURE : MESURE * 4;
    for (let t = Math.floor(t0 / pasG) * pasG; t <= t1; t += pasG) {
      const x = Math.round(xDeTick(t));
      cx.fillStyle = t % (MESURE * 4) === 0 ? '#3b4252' : t % MESURE === 0 ? '#2c313d' : '#20242d';
      cx.fillRect(x, 0, 1, H);
    }
    const boucle = p.arrangement.loop;
    if (boucle) { cx.fillStyle = 'rgba(245,184,65,.05)'; cx.fillRect(xDeTick(boucle.start), 0, (boucle.end - boucle.start) * zoomX, H); }

    // Clips
    cx.font = `11px ${police}`;
    cx.textBaseline = 'top';
    for (const c of p.arrangement.clips) {
      if (c.start > t1 || c.start + c.length < t0) continue;
      const i = ts.findIndex(t => t.id === c.trackId);
      const tr = ts[i];
      const pt = patternDe(p, c.patternId);
      if (!tr || !pt) continue;
      const x = xDeTick(c.start); const y = yPiste(i) + 2; const w = Math.max(2, c.length * zoomX - 1); const hh = hauteurPiste(tr) - 5;
      if (y > H || y + hh < 0) continue;
      const sel = selection.has(c.id);
      cx.globalAlpha = tr.mute ? 0.35 : 1;
      cx.fillStyle = pt.color;
      cx.globalAlpha *= 0.28;
      cx.fillRect(x, y, w, hh);
      cx.globalAlpha = tr.mute ? 0.35 : 1;
      cx.fillStyle = pt.color;
      cx.fillRect(x, y, w, 15);
      // Répétitions du pattern
      const l = Math.max(1, pt.lengthTicks);
      cx.fillStyle = 'rgba(0,0,0,.35)';
      for (let r = l - (c.offset % l); r < c.length; r += l) cx.fillRect(x + r * zoomX, y + 15, 1, hh - 15);
      // Aperçu des notes : dessiné une fois par pattern (et par zoom), puis recopié à chaque répétition.
      const apercu = hh > 24 ? apercuPattern(pt, l * zoomX, hh - 20) : null;
      if (apercu) {
        cx.save();
        cx.beginPath(); cx.rect(x, y, w, hh); cx.clip();
        for (let debut = -(c.offset % l); debut < c.length; debut += l) {
          const nx = x + debut * zoomX;
          if (nx > L || nx + l * zoomX < 0) continue;
          cx.drawImage(apercu, nx, y + 17, l * zoomX, hh - 20);
        }
        cx.restore();
      }
      cx.fillStyle = '#0b0d11';
      if (w > 24) cx.fillText(pt.name, x + 4, y + 2, w - 8);
      cx.strokeStyle = sel ? '#ffffff' : 'rgba(0,0,0,.4)';
      cx.lineWidth = sel ? 1.5 : 1;
      cx.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
      cx.globalAlpha = 1;
    }
    // Aperçu du clip à poser
    if (survol && !geste && ui.get().outilArrangement === 'crayon' && !clipSous(survol.x, survol.y)) {
      const pt = patternDe(p, ui.get().patternId);
      const i = pisteDeY(survol.y);
      const tr = ts[i];
      if (pt && tr && survol.y < yPiste(ts.length)) {
        cx.strokeStyle = 'rgba(231,234,240,.35)';
        cx.setLineDash([4, 3]);
        cx.strokeRect(xDeTick(aimanter(tickDeX(survol.x), g, 'bas')) + 0.5, yPiste(i) + 2.5, pt.lengthTicks * zoomX - 1, hauteurPiste(tr) - 6);
        cx.setLineDash([]);
      }
    }
    if (geste?.type === 'rectangle') {
      const x = Math.min(geste.x0, geste.x1); const y = Math.min(geste.y0, geste.y1);
      cx.fillStyle = 'rgba(61,220,177,.08)'; cx.fillRect(x, y, Math.abs(geste.x1 - geste.x0), Math.abs(geste.y1 - geste.y0));
      cx.strokeStyle = C.accent ?? ''; cx.setLineDash([4, 3]); cx.strokeRect(x + 0.5, y + 0.5, Math.abs(geste.x1 - geste.x0), Math.abs(geste.y1 - geste.y0)); cx.setLineDash([]);
    }
    if (curseur.visible) {
      const tr = ts[curseur.piste];
      const pt = patternDe(p, ui.get().patternId);
      if (tr) { cx.strokeStyle = C.lecture ?? ''; cx.lineWidth = 2; cx.strokeRect(xDeTick(curseur.tick) + 1, yPiste(curseur.piste) + 2, Math.max(8, (pt?.lengthTicks ?? MESURE) * zoomX - 2), hauteurPiste(tr) - 5); }
    }
    if (tete >= 0) { cx.fillStyle = C.lecture ?? ''; cx.fillRect(Math.round(xDeTick(tete)), 0, 1.5, H); }

    // Règle
    const cr = preparerCanvas(cRegle, L, HAUTEUR_REGLE);
    cr.fillStyle = C.panneau ?? ''; cr.fillRect(0, 0, L, HAUTEUR_REGLE);
    if (boucle) {
      cr.fillStyle = 'rgba(245,184,65,.28)';
      cr.fillRect(xDeTick(boucle.start), 2, (boucle.end - boucle.start) * zoomX, HAUTEUR_REGLE - 4);
      cr.fillStyle = C.lecture ?? '';
      cr.fillRect(xDeTick(boucle.start), 2, 2, HAUTEUR_REGLE - 4);
      cr.fillRect(xDeTick(boucle.end) - 2, 2, 2, HAUTEUR_REGLE - 4);
    }
    cr.font = `10px ${police}`; cr.textBaseline = 'middle';
    const pasR = MESURE * zoomX >= 36 ? MESURE : MESURE * zoomX >= 9 ? MESURE * 4 : MESURE * 16;
    for (let t = Math.floor(t0 / pasR) * pasR; t <= t1; t += pasR) {
      const x = Math.round(xDeTick(t));
      cr.fillStyle = C.doux ?? ''; cr.fillRect(x, 12, 1, HAUTEUR_REGLE - 12);
      cr.fillText(String(t / MESURE + 1), x + 4, 9);
    }
    cr.fillStyle = C.filet ?? ''; cr.fillRect(0, HAUTEUR_REGLE - 1, L, 1);
    if (tete >= 0) { const x = Math.round(xDeTick(tete)); cr.fillStyle = C.lecture ?? ''; cr.beginPath(); cr.moveTo(x - 5, HAUTEUR_REGLE - 9); cr.lineTo(x + 5, HAUTEUR_REGLE - 9); cr.lineTo(x, HAUTEUR_REGLE - 1); cr.fill(); }
  };

  // ---------- Synchronisation ----------
  const maj = () => {
    const u = ui.get();
    for (const [i, b] of boutonsOutils.entries()) b.setAttribute('aria-pressed', String(OUTILS[i]?.id === u.outilArrangement));
    choixGrille.definir(String(u.grilleArrangement));
    btnBoucle.disabled = !store.get().arrangement.loop;
    const ids = new Set(store.get().arrangement.clips.map(c => c.id));
    for (const id of selection) if (!ids.has(id)) selection.delete(id);
    majEntetes();
    majPatterns();
    limiter();
    sale = true;
  };
  store.subscribe(maj);
  ui.subscribe(maj);
  moteur.onPosition(t => {
    const nt = ui.get().mode === 'morceau' ? t : -1;
    if (nt !== tete) { tete = nt; sale = true; }
    if (moteur.isPlaying() && tete >= 0 && !geste) {
      const x = xDeTick(tete);
      if (x > largeur() - 20 || x < 0) { defX = Math.max(0, tete * zoomX - 40); sale = true; }
    }
  });
  new ResizeObserver(() => { limiter(); sale = true; }).observe(zonePistes);
  const boucle = () => { if (sale && !el.hidden && el.isConnected) dessiner(); requestAnimationFrame(boucle); };
  requestAnimationFrame(boucle);
  maj();
  return el;
}
