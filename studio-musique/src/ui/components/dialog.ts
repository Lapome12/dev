// Boîtes de dialogue modales (<dialog> natif : piège du focus et Échap gérés par le navigateur).

import { h, type Enfant } from '../dom';
import { bouton } from './button';

export interface ActionDialogue {
  texte: string;
  variante?: 'principal' | 'danger' | 'discret';
  /** Renvoyer false garde la boîte ouverte. */
  action?: () => boolean | void | Promise<boolean | void>;
  /** Action déclenchée par Entrée. */
  defaut?: boolean;
}

export interface OptionsDialogue {
  titre: string;
  contenu: Enfant;
  actions?: ActionDialogue[];
  large?: boolean;
  /** Appelé à la fermeture, quelle qu'en soit la cause. */
  surFermeture?: () => void;
}

export interface Dialogue { readonly el: HTMLDialogElement; fermer(): void }

export function dialogue(o: OptionsDialogue): Dialogue {
  const titreId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  const actions = o.actions ?? [{ texte: 'Fermer', variante: 'principal' as const }];
  const pied = h('div', { class: 'dlg-actions' });
  const el = h('dialog', { class: o.large ? 'dialogue large' : 'dialogue', 'aria-labelledby': titreId },
    h('header', { class: 'dlg-entete' },
      h('h2', { id: titreId }, o.titre),
      bouton({ icone: 'fermer', libelle: 'Fermer', variante: 'discret', surClic: () => fermer() })),
    h('div', { class: 'dlg-corps' }, o.contenu),
    pied);
  let ferme = false;
  const fermer = () => {
    if (ferme) return;
    ferme = true;
    if (el.open) el.close();
    el.remove();
    o.surFermeture?.();
  };
  for (const a of actions) {
    pied.appendChild(bouton({
      texte: a.texte,
      ...(a.variante ? { variante: a.variante } : {}),
      surClic: async () => { if ((await a.action?.()) !== false) fermer(); },
    }));
  }
  el.addEventListener('close', fermer);
  el.addEventListener('keydown', e => {
    e.stopPropagation();
    const parDefaut = actions.find(a => a.defaut);
    if (e.key === 'Enter' && parDefaut && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      void (async () => { if ((await parDefaut.action?.()) !== false) fermer(); })();
    }
  });
  // Un clic sur le voile ferme la boîte.
  el.addEventListener('pointerdown', e => { if (e.target === el) fermer(); });
  document.body.appendChild(el);
  el.showModal();
  return { el, fermer };
}

export function confirmer(titre: string, texte: string, oui = 'Confirmer', danger = false): Promise<boolean> {
  return new Promise(resolve => {
    let reponse = false;
    dialogue({
      titre,
      contenu: h('p', null, texte),
      actions: [
        { texte: 'Annuler', variante: 'discret' },
        { texte: oui, variante: danger ? 'danger' : 'principal', defaut: true, action: () => { reponse = true; } },
      ],
      surFermeture: () => resolve(reponse),
    });
  });
}

export function demanderTexte(titre: string, libelle: string, valeur = '', max = 60): Promise<string | null> {
  return new Promise(resolve => {
    let reponse: string | null = null;
    const id = `saisie-${Math.random().toString(36).slice(2, 8)}`;
    const champ = h('input', { id, class: 'champ', type: 'text', value: valeur, maxlength: max, autocomplete: 'off', spellcheck: 'false' });
    const d = dialogue({
      titre,
      contenu: h('div', { class: 'dlg-champ' }, h('label', { for: id }, libelle), champ),
      actions: [
        { texte: 'Annuler', variante: 'discret' },
        { texte: 'Valider', variante: 'principal', defaut: true, action: () => {
          const t = champ.value.trim();
          if (!t) { champ.focus(); return false; }
          reponse = t;
          return true;
        } },
      ],
      surFermeture: () => resolve(reponse),
    });
    void d;
    champ.focus();
    champ.select();
  });
}
