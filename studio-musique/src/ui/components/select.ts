// Liste de choix : <select> natif habillé (accessible et utilisable au clavier sans effort).

import { aide as attacherAide } from '../aide';
import { h, idUnique } from '../dom';

export interface OptionChoix { value: string; label: string; groupe?: string }

export interface OptionsListe {
  libelle: string;
  options: OptionChoix[];
  valeur: string;
  /** Affiche le libellé au-dessus (sinon seulement accessible). */
  etiquetteVisible?: boolean;
  aide?: string;
  surChange?: (valeur: string) => void;
}

export interface Liste { readonly el: HTMLElement; readonly select: HTMLSelectElement; valeur(): string; definir(v: string): void; options(o: OptionChoix[]): void }

export function liste(o: OptionsListe): Liste {
  const id = idUnique('liste');
  const select = h('select', { id, class: 'liste-select' });
  const remplir = (opts: OptionChoix[]) => {
    select.replaceChildren();
    const groupes = new Map<string, HTMLOptGroupElement>();
    for (const op of opts) {
      const opt = h('option', { value: op.value }, op.label);
      if (op.groupe) {
        let g = groupes.get(op.groupe);
        if (!g) { g = h('optgroup', { label: op.groupe }); groupes.set(op.groupe, g); select.appendChild(g); }
        g.appendChild(opt);
      } else select.appendChild(opt);
    }
  };
  remplir(o.options);
  select.value = o.valeur;
  const etiquette = h('label', { for: id, class: o.etiquetteVisible ? 'liste-etiquette' : 'lecteur' }, o.libelle);
  const el = h('div', { class: 'liste' }, etiquette, select);
  if (o.aide) attacherAide(el, `${o.libelle} : ${o.aide}`);
  select.addEventListener('change', () => o.surChange?.(select.value));
  // Les raccourcis globaux ne doivent pas voler les flèches d'une liste ouverte.
  select.addEventListener('keydown', e => e.stopPropagation());
  return {
    el, select,
    valeur: () => select.value,
    definir: v => { select.value = v; },
    options: opts => { const v = select.value; remplir(opts); select.value = v; },
  };
}
