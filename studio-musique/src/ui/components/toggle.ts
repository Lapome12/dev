// Interrupteur : bouton à deux états (aria-pressed). Variantes : témoin (LED), mute, solo, texte.

import { aide as attacherAide } from '../aide';
import { h } from '../dom';
import { icone, type NomIcone } from './icons';

export interface OptionsInterrupteur {
  libelle: string;
  /** Texte visible (« M », « S », « PAT ») ; sinon une icône ou un témoin. */
  texte?: string;
  icone?: NomIcone;
  actif: boolean;
  variante?: 'temoin' | 'mute' | 'solo' | 'texte';
  aide?: string;
  surChange?: (actif: boolean, e: MouseEvent) => void;
}

export interface Interrupteur { readonly el: HTMLButtonElement; actif(): boolean; definir(actif: boolean): void }

export function interrupteur(o: OptionsInterrupteur): Interrupteur {
  let actif = o.actif;
  const el = h('button', {
    type: 'button',
    class: `interrupteur ${o.variante ?? 'texte'}`,
    'aria-label': o.texte && o.texte.length > 3 ? undefined : o.libelle,
    'data-bulle': o.texte && o.texte.length > 3 ? undefined : o.libelle,
  }, o.variante === 'temoin' ? h('span', { class: 'temoin', 'aria-hidden': 'true' }) : null,
  o.icone && icone(o.icone), o.texte && h('span', null, o.texte));
  if (o.aide) attacherAide(el, o.aide);
  const montrer = () => el.setAttribute('aria-pressed', String(actif));
  montrer();
  el.addEventListener('click', e => {
    actif = !actif;
    montrer();
    o.surChange?.(actif, e);
  });
  return { el, actif: () => actif, definir: a => { actif = a; montrer(); } };
}
