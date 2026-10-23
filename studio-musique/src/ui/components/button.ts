// Boutons : texte, icône seule (libellé accessible obligatoire), variantes.

import { aide as attacherAide } from '../aide';
import { h } from '../dom';
import { icone, type NomIcone } from './icons';

export interface OptionsBouton {
  texte?: string;
  icone?: NomIcone;
  /** Libellé accessible (obligatoire quand le bouton n'a qu'une icône). */
  libelle?: string;
  variante?: 'principal' | 'discret' | 'danger' | 'outil';
  aide?: string;
  raccourci?: string;
  classe?: string;
  desactive?: boolean;
  surClic?: (e: MouseEvent) => void;
}

export function bouton(o: OptionsBouton): HTMLButtonElement {
  const seuleIcone = !o.texte && !!o.icone;
  const classes = ['btn', o.variante ?? '', seuleIcone ? 'seule-icone' : '', o.classe ?? ''].filter(Boolean).join(' ');
  const b = h('button', {
    type: 'button',
    class: classes,
    'aria-label': seuleIcone ? o.libelle : undefined,
    'aria-keyshortcuts': o.raccourci,
    'data-bulle': seuleIcone ? (o.raccourci ? `${o.libelle} (${o.raccourci})` : o.libelle) : undefined,
    disabled: o.desactive,
  }, o.icone && icone(o.icone), o.texte && h('span', null, o.texte));
  if (o.aide) attacherAide(b, o.aide);
  if (o.surClic) b.addEventListener('click', o.surClic);
  return b;
}
