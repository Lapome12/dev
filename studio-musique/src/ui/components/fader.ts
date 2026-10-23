// Fader vertical (console) : même comportement qu'un bouton rotatif, course plus longue.

import { h } from '../dom';
import { attacherReglage, type OptionsReglage, type Reglage } from './glisser';

export interface OptionsFader extends OptionsReglage {
  /** Graduations à afficher (en valeurs réelles), ex. le 0 dB. */
  reperes?: number[];
}

export function fader(o: OptionsFader): Reglage {
  const curseur = h('span', { class: 'fd-curseur', 'aria-hidden': 'true' });
  const remplissage = h('span', { class: 'fd-plein', 'aria-hidden': 'true' });
  const rail = h('span', { class: 'fd-rail', 'aria-hidden': 'true' }, remplissage, curseur);
  const el = h('div', { class: 'fader', role: 'slider', 'aria-orientation': 'vertical' }, rail);
  const opts = { ...o, course: o.course ?? 140 };
  const ctrl = attacherReglage(el, opts, (_v, n) => {
    const pct = `${(n * 100).toFixed(2)}%`;
    curseur.style.bottom = pct;
    remplissage.style.height = pct;
  });
  if (o.reperes) {
    const conv = o.versNorme;
    for (const r of o.reperes) {
      const n = conv ? conv(r) : (r - o.min) / (o.max - o.min);
      const rep = h('span', { class: 'fd-repere', 'aria-hidden': 'true' });
      rep.style.bottom = `${(n * 100).toFixed(2)}%`;
      rail.appendChild(rep);
    }
  }
  return { el, valeur: ctrl.valeur, definir: ctrl.definir, texte: ctrl.texte };
}
