// Comportement commun des réglages continus (bouton rotatif, fader, champ numérique) :
// glisser vertical (Maj = fin), molette, flèches, Page haut/bas, Début/Fin, double-clic = défaut.
// La valeur courante s'affiche dans la barre d'aide pendant le geste.

import { aideTemporaire } from '../aide';
import { borner } from '../dom';
import { arrondirPas, depuisNorme, formater, versNorme, type Plage, type Unite } from './valeur';

export interface OptionsReglage extends Plage {
  libelle: string;
  valeur: number;
  defaut: number;
  unite?: Unite;
  /** Remplace l'affichage par défaut (formater + unité). */
  format?: (v: number) => string;
  /** Conversions personnalisées (fader de volume). */
  versNorme?: (v: number) => number;
  depuisNorme?: (n: number) => number;
  /** Pixels de glissé pour parcourir toute la plage (200 par défaut). */
  course?: number;
  aide?: string;
  desactive?: boolean;
  /** Appelé à chaque changement pendant un geste. */
  surEntree?: (v: number) => void;
  /** Appelé une fois à la fin du geste (relâchement, touche, molette). */
  surFin?: (v: number) => void;
}

export interface Reglage {
  readonly el: HTMLElement;
  valeur(): number;
  /** Change la valeur affichée sans prévenir (synchronisation depuis le projet). */
  definir(v: number): void;
  texte(): string;
}

export interface ControleurReglage {
  valeur(): number;
  definir(v: number): void;
  texte(): string;
  changer(v: number, fin: boolean): void;
}

/**
 * Attache le comportement de réglage à `el` (qui doit avoir role="slider" ou "spinbutton").
 * `rendre` est appelé à chaque changement de valeur pour mettre à jour le dessin.
 */
export function attacherReglage(el: HTMLElement, o: OptionsReglage, rendre: (v: number, norme: number, texte: string) => void): ControleurReglage {
  const plage: Plage = { min: o.min, max: o.max, ...(o.step !== undefined ? { step: o.step } : {}), ...(o.curve ? { curve: o.curve } : {}) };
  const enNorme = o.versNorme ?? ((v: number) => versNorme(v, plage));
  const deNorme = o.depuisNorme ?? ((n: number) => depuisNorme(n, plage));
  const fmt = o.format ?? ((v: number) => formater(v, o.unite, o.step));
  let v = arrondirPas(o.valeur, plage);

  const aria = () => {
    el.setAttribute('aria-valuemin', String(o.min));
    el.setAttribute('aria-valuemax', String(o.max));
    el.setAttribute('aria-valuenow', String(v));
    el.setAttribute('aria-valuetext', fmt(v));
  };
  const montrer = () => { rendre(v, enNorme(v), fmt(v)); aria(); };

  const changer = (nv: number, fin: boolean) => {
    const borne = borner(nv, o.min, o.max);
    const change = borne !== v;
    v = borne;
    montrer();
    if (change) o.surEntree?.(v);
    if (fin) o.surFin?.(v);
  };

  el.setAttribute('aria-label', o.libelle);
  if (o.aide) el.setAttribute('data-aide', `${o.libelle} : ${o.aide}`);
  if (!o.desactive) el.tabIndex = 0;
  else el.setAttribute('aria-disabled', 'true');
  montrer();

  if (o.desactive) return { valeur: () => v, definir: nv => { v = nv; montrer(); }, texte: () => fmt(v), changer };

  const publier = () => aideTemporaire(`${o.libelle} : ${fmt(v)}`);
  // Un pas minimum garantit qu'un cran de molette ou une flèche bouge toujours une valeur à pas entier.
  const pasMini = (sens: number, delta: number): number => {
    const cible = deNorme(borner(enNorme(v) + sens * delta, 0, 1));
    if (cible !== v || !o.step) return cible;
    return borner(v + sens * o.step, o.min, o.max);
  };

  // --- Glisser ---
  let depart: { y: number; norme: number; fin: boolean } | null = null;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.focus();
    el.setPointerCapture(e.pointerId);
    depart = { y: e.clientY, norme: enNorme(v), fin: e.shiftKey };
    el.classList.add('actif');
    publier();
  });
  el.addEventListener('pointermove', e => {
    if (!depart) return;
    // Changer de mode (Maj) en cours de geste repart de la position courante, sans saut.
    if (e.shiftKey !== depart.fin) depart = { y: e.clientY, norme: enNorme(v), fin: e.shiftKey };
    const course = (o.course ?? 200) * (e.shiftKey ? 6 : 1);
    changer(deNorme(depart.norme + (depart.y - e.clientY) / course), false);
    publier();
  });
  const finir = (e: PointerEvent) => {
    if (!depart) return;
    depart = null;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    el.classList.remove('actif');
    aideTemporaire(null);
    o.surFin?.(v);
  };
  el.addEventListener('pointerup', finir);
  el.addEventListener('pointercancel', finir);

  el.addEventListener('dblclick', e => { e.preventDefault(); changer(o.defaut, true); });

  // --- Molette ---
  let minuteurMolette = 0;
  el.addEventListener('wheel', e => {
    e.preventDefault();
    const sens = e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0;
    if (!sens) return;
    changer(pasMini(sens, e.shiftKey ? 1 / 250 : 1 / 50), false);
    publier();
    clearTimeout(minuteurMolette);
    minuteurMolette = window.setTimeout(() => { aideTemporaire(null); o.surFin?.(v); }, 400);
  }, { passive: false });

  // --- Clavier ---
  el.addEventListener('keydown', e => {
    let nv: number | null = null;
    const fin = e.shiftKey ? 1 / 500 : 1 / 100;
    switch (e.key) {
      case 'ArrowUp': case 'ArrowRight': nv = pasMini(1, fin); break;
      case 'ArrowDown': case 'ArrowLeft': nv = pasMini(-1, fin); break;
      case 'PageUp': nv = pasMini(1, 1 / 10); break;
      case 'PageDown': nv = pasMini(-1, 1 / 10); break;
      case 'Home': nv = o.min; break;
      case 'End': nv = o.max; break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
    changer(nv, true);
    publier();
  });
  el.addEventListener('keyup', () => aideTemporaire(null));
  el.addEventListener('blur', () => aideTemporaire(null));

  return {
    valeur: () => v,
    definir: nv => { if (!depart) { v = arrondirPas(nv, plage); montrer(); } },
    texte: () => fmt(v),
    changer,
  };
}
