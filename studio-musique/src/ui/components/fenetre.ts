// Fenêtres flottantes (plugins) : déplaçables par leur barre de titre, au premier plan au clic,
// fermées par Échap ou leur bouton. Non modales : on continue de jouer pendant qu'elles sont ouvertes.

import { borner, h, type Enfant } from '../dom';
import { bouton } from './button';

export interface Fenetre { readonly el: HTMLElement; readonly corps: HTMLElement; fermer(): void; premierPlan(): void; titre(t: string): void }

let z = 100;
let decalage = 0;

export function fenetre(o: { titre: string; sousTitre?: string; outils?: Enfant; contenu: Enfant; surFermeture?: () => void; classe?: string }): Fenetre {
  const id = `fen-${Math.random().toString(36).slice(2, 8)}`;
  const titre = h('h2', { id, class: 'fen-titre' }, o.titre);
  const sous = h('span', { class: 'fen-sous doux' }, o.sousTitre ?? '');
  const entete = h('header', { class: 'fen-entete' }, h('div', { class: 'fen-noms' }, titre, sous), h('div', { class: 'fen-outils' }, o.outils ?? null),
    bouton({ icone: 'fermer', libelle: 'Fermer la fenêtre', variante: 'discret', surClic: () => fermer() }));
  const corps = h('div', { class: 'fen-corps' }, o.contenu);
  const el = h('section', { class: `fenetre ${o.classe ?? ''}`, role: 'dialog', 'aria-labelledby': id, tabindex: -1 }, entete, corps);
  document.body.appendChild(el);

  // Position initiale en cascade, au centre de l'écran.
  const r = el.getBoundingClientRect();
  const x = borner((window.innerWidth - r.width) / 2 + decalage, 8, Math.max(8, window.innerWidth - r.width - 8));
  const y = borner(80 + decalage, 56, Math.max(56, window.innerHeight - r.height - 8));
  decalage = (decalage + 28) % 168;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;

  const premierPlan = () => { el.style.zIndex = String(++z); };
  premierPlan();
  el.addEventListener('pointerdown', premierPlan, true);
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } });

  entete.addEventListener('pointerdown', e => {
    if ((e.target as Element).closest('button, select, input, [role="slider"]')) return;
    e.preventDefault();
    entete.setPointerCapture(e.pointerId);
    const depart = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop };
    const bouger = (ev: PointerEvent) => {
      el.style.left = `${borner(depart.l + ev.clientX - depart.x, 40 - el.offsetWidth, window.innerWidth - 40)}px`;
      el.style.top = `${borner(depart.t + ev.clientY - depart.y, 0, window.innerHeight - 30)}px`;
    };
    entete.addEventListener('pointermove', bouger);
    entete.addEventListener('pointerup', () => entete.removeEventListener('pointermove', bouger), { once: true });
  });

  let ferme = false;
  const fermer = () => { if (ferme) return; ferme = true; el.remove(); o.surFermeture?.(); };
  requestAnimationFrame(() => el.focus({ preventScroll: true }));
  return { el, corps, fermer, premierPlan, titre: t => { titre.textContent = t; } };
}
