// Bouton rotatif : arc de 270°, glisser vertical, Maj = fin, double-clic = défaut, molette, flèches.

import { h, svg } from '../dom';
import { attacherReglage, type OptionsReglage, type Reglage } from './glisser';

export interface OptionsBoutonRotatif extends OptionsReglage {
  taille?: 'mini' | 'petit' | 'normal' | 'grand';
  /** L'arc part du centre (pan, désaccord) au lieu du minimum. */
  bipolaire?: boolean;
  /** Couleur de l'arc (sinon l'accent). */
  couleur?: string;
  /** Cache l'étiquette (le libellé reste accessible). */
  sansEtiquette?: boolean;
}

const DEBUT = -135;
const FIN = 135;
const R = 15;
const C = 20;

function point(angle: number): [number, number] {
  const rad = (angle - 90) * Math.PI / 180;
  return [C + R * Math.cos(rad), C + R * Math.sin(rad)];
}

/** Chemin SVG d'un arc entre deux angles (degrés, 0 = haut, sens horaire). */
export function cheminArc(a: number, b: number): string {
  const [debut, fin] = a <= b ? [a, b] : [b, a];
  if (fin - debut < 0.01) return '';
  const [x1, y1] = point(debut);
  const [x2, y2] = point(fin);
  const grand = fin - debut > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${grand} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function boutonRotatif(o: OptionsBoutonRotatif): Reglage {
  const dessin = svg('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true', class: 'br-dessin' });
  const piste = svg('path', { class: 'br-piste', d: cheminArc(DEBUT, FIN) });
  const arc = svg('path', { class: 'br-arc' });
  const corps = svg('circle', { class: 'br-corps', cx: C, cy: C, r: 11 });
  const aiguille = svg('line', { class: 'br-aiguille', x1: C, y1: C - 4, x2: C, y2: C - 10 });
  dessin.append(piste, arc, corps, aiguille);

  const valeur = h('span', { class: 'br-valeur mono', 'aria-hidden': 'true' });
  const etiquette = h('span', { class: o.sansEtiquette ? 'br-etiquette lecteur' : 'br-etiquette', 'aria-hidden': 'true' }, o.libelle);
  const el = h('div', { class: `bouton-rotatif ${o.taille ?? 'normal'}`, role: 'slider' }, dessin, etiquette, valeur);
  if (o.couleur) el.style.setProperty('--couleur', o.couleur);

  const ctrl = attacherReglage(el, o, (_v, n, texte) => {
    const angle = DEBUT + n * (FIN - DEBUT);
    const origine = o.bipolaire ? 0 : DEBUT;
    arc.setAttribute('d', cheminArc(origine, angle));
    aiguille.setAttribute('transform', `rotate(${angle.toFixed(1)} ${C} ${C})`);
    valeur.textContent = texte;
  });
  return { el, valeur: ctrl.valeur, definir: ctrl.definir, texte: ctrl.texte };
}
