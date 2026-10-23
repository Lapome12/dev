// Champ numérique glissable (BPM, swing, transposition) : glisser vertical, molette, flèches,
// double-clic ou Entrée pour taper la valeur au clavier.

import { h } from '../dom';
import { attacherReglage, type OptionsReglage, type Reglage } from './glisser';

export interface OptionsChampNombre extends OptionsReglage {
  /** Lit une saisie au clavier ; par défaut un nombre décimal (virgule acceptée). */
  lire?: (texte: string) => number | null;
  largeur?: 'etroit' | 'normal' | 'large';
}

const lireNombre = (t: string): number | null => {
  const n = Number(t.replace(',', '.').replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) && t.trim() !== '' ? n : null;
};

export function champNombre(o: OptionsChampNombre): Reglage {
  const affichage = h('span', { class: 'cn-texte mono', 'aria-hidden': 'true' });
  const el = h('div', { class: `champ-nombre ${o.largeur ?? 'normal'}`, role: 'spinbutton' }, affichage);
  const ctrl = attacherReglage(el, { ...o, course: o.course ?? 300 }, (_v, _n, texte) => { affichage.textContent = texte; });

  const saisir = () => {
    const entree = h('input', { class: 'cn-saisie mono', type: 'text', inputmode: 'decimal', 'aria-label': o.libelle, value: String(ctrl.valeur()).replace('.', ',') });
    let fini = false;
    const terminer = (valider: boolean) => {
      if (fini) return;
      fini = true;
      const n = valider ? (o.lire ?? lireNombre)(entree.value) : null;
      entree.remove();
      affichage.hidden = false;
      if (n !== null) ctrl.changer(n, true);
      el.focus();
    };
    entree.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); terminer(true); }
      else if (e.key === 'Escape') { e.preventDefault(); terminer(false); }
    });
    entree.addEventListener('blur', () => terminer(true));
    entree.addEventListener('pointerdown', e => e.stopPropagation());
    affichage.hidden = true;
    el.appendChild(entree);
    entree.focus();
    entree.select();
  };
  // Le double-clic tape une valeur (au lieu de revenir au défaut) : Suppr revient au défaut.
  el.addEventListener('dblclick', e => { e.stopImmediatePropagation(); saisir(); }, { capture: true });
  el.addEventListener('keydown', e => {
    if (e.target !== el) return;
    if (e.key === 'Enter') { e.preventDefault(); saisir(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ctrl.changer(o.defaut, true); }
  });
  return { el, valeur: ctrl.valeur, definir: ctrl.definir, texte: ctrl.texte };
}
