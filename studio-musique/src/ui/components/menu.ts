// Menus déroulants et contextuels (role="menu") : flèches, Début/Fin, Entrée, Échap, lettre initiale.

import { h } from '../dom';

export type ElementMenu =
  | { texte: string; action: () => void; raccourci?: string; desactive?: boolean; coche?: boolean; danger?: boolean }
  | { separateur: true }
  | { titre: string };

let ouvert: { fermer: () => void } | null = null;

export function fermerMenus(): void { ouvert?.fermer(); }

/** Ouvre un menu à une position (clic droit) ou sous un déclencheur. */
export function ouvrirMenu(elements: ElementMenu[], position: { x: number; y: number } | HTMLElement, libelle = 'Menu'): void {
  fermerMenus();
  const declencheur = position instanceof HTMLElement ? position : null;
  const items: HTMLButtonElement[] = [];
  const liste = h('div', { class: 'menu', role: 'menu', 'aria-label': libelle, tabindex: -1 });
  for (const e of elements) {
    if ('separateur' in e) { liste.appendChild(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
    if ('titre' in e) { liste.appendChild(h('div', { class: 'menu-titre', role: 'presentation' }, e.titre)); continue; }
    const b = h('button', {
      type: 'button',
      class: e.danger ? 'menu-item danger' : 'menu-item',
      role: e.coche === undefined ? 'menuitem' : 'menuitemcheckbox',
      'aria-checked': e.coche === undefined ? undefined : String(e.coche),
      'aria-disabled': e.desactive ? 'true' : undefined,
      tabindex: -1,
    }, h('span', { class: 'menu-coche', 'aria-hidden': 'true' }, e.coche ? '✓' : ''),
    h('span', { class: 'menu-texte' }, e.texte),
    e.raccourci ? h('kbd', { class: 'menu-raccourci' }, e.raccourci) : null);
    b.addEventListener('click', () => {
      if (e.desactive) return;
      fermer();
      e.action();
    });
    items.push(b);
    liste.appendChild(b);
  }
  document.body.appendChild(liste);

  // Placement dans la fenêtre.
  const r = liste.getBoundingClientRect();
  let x: number; let y: number;
  if (declencheur) {
    const d = declencheur.getBoundingClientRect();
    x = d.left; y = d.bottom + 2;
    declencheur.setAttribute('aria-expanded', 'true');
  } else { x = (position as { x: number }).x; y = (position as { y: number }).y; }
  x = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
  if (y + r.height > window.innerHeight - 4) y = Math.max(4, (declencheur ? declencheur.getBoundingClientRect().top - r.height - 2 : y - r.height));
  liste.style.left = `${x}px`;
  liste.style.top = `${y}px`;

  const actifs = () => items.filter(i => i.getAttribute('aria-disabled') !== 'true');
  const focaliser = (i: number) => { const a = actifs(); a[(i + a.length) % a.length]?.focus(); };
  const indice = () => actifs().indexOf(document.activeElement as HTMLButtonElement);

  const surTouche = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); focaliser(indice() + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focaliser(indice() - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focaliser(0); }
    else if (e.key === 'End') { e.preventDefault(); focaliser(-1); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); fermer(); }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const a = actifs();
      const depart = indice();
      for (let k = 1; k <= a.length; k++) {
        const it = a[(depart + k) % a.length];
        if (it?.textContent?.trim().toLowerCase().startsWith(e.key.toLowerCase())) { it.focus(); break; }
      }
    }
  };
  const dehors = (e: PointerEvent) => {
    if (!liste.contains(e.target as Node) && !(declencheur && declencheur.contains(e.target as Node))) fermer();
  };
  liste.addEventListener('keydown', surTouche);
  setTimeout(() => document.addEventListener('pointerdown', dehors, true));
  window.addEventListener('blur', fermer);
  window.addEventListener('resize', fermer);

  function fermer() {
    if (ouvert !== moi) return;
    ouvert = null;
    document.removeEventListener('pointerdown', dehors, true);
    window.removeEventListener('blur', fermer);
    window.removeEventListener('resize', fermer);
    liste.remove();
    if (declencheur) { declencheur.setAttribute('aria-expanded', 'false'); declencheur.focus(); }
  }
  const moi = { fermer };
  ouvert = moi;
  focaliser(0);
}

/** Bouton qui ouvre un menu ; `elements` est recalculé à chaque ouverture. */
export function boutonMenu(bouton: HTMLButtonElement, elements: () => ElementMenu[], libelle?: string): HTMLButtonElement {
  bouton.setAttribute('aria-haspopup', 'menu');
  bouton.setAttribute('aria-expanded', 'false');
  bouton.addEventListener('click', () => {
    if (bouton.getAttribute('aria-expanded') === 'true') fermerMenus();
    else ouvrirMenu(elements(), bouton, libelle ?? bouton.getAttribute('aria-label') ?? bouton.textContent ?? 'Menu');
  });
  bouton.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); ouvrirMenu(elements(), bouton, libelle); }
  });
  return bouton;
}
