// Squelette de l'application : transport en haut, navigateur à gauche (étape 3.5), vues à onglets
// au centre, barre d'aide en bas. Les vues encore à venir affichent un panneau d'attente.

import type { ElementMenu } from '../components/menu';
import type { Contexte } from '../contexte';
import { h } from '../dom';
import type { Vue } from '../ui-state';
import { barreAide } from './help-bar';
import { vueArrangement } from './arrangement';
import { vuePianoRoll } from './piano-roll';
import { vueRack } from './rack';
import { barreTransport, VUES } from './transport';

export interface OptionsApplication {
  menuProjet: () => ElementMenu[];
  /** Fabriques des vues livrées plus tard ; absentes = panneau « bientôt ». */
  vues?: Partial<Record<Vue, (ctx: Contexte) => HTMLElement>>;
  navigateur?: (ctx: Contexte) => HTMLElement;
}

function bientot(v: Vue): HTMLElement {
  const nom = VUES.find(x => x.id === v)?.nom ?? v;
  return h('section', { class: 'vue vue-attente', id: `vue-${v}`, role: 'tabpanel', 'aria-labelledby': `onglet-${v}` },
    h('p', { class: 'doux' }, `${nom} : en construction.`));
}

export function monterApplication(racine: HTMLElement, ctx: Contexte, o: OptionsApplication): void {
  const fabriques: Record<Vue, (c: Contexte) => HTMLElement> = {
    rack: vueRack,
    piano: o.vues?.piano ?? vuePianoRoll,
    arrangement: o.vues?.arrangement ?? vueArrangement,
    console: o.vues?.console ?? (() => bientot('console')),
  };
  // Chaque vue est construite à sa première ouverture, puis gardée (son état d'édition survit).
  const construites = new Map<Vue, HTMLElement>();
  const centre = h('main', { class: 'centre' });
  const nav = o.navigateur ? o.navigateur(ctx) : null;
  const corps = h('div', { class: 'corps' }, nav, centre);
  racine.replaceChildren(h('div', { class: 'application' }, barreTransport(ctx, { menuProjet: o.menuProjet }), corps, barreAide()));

  const afficher = () => {
    const u = ctx.ui.get();
    let el = construites.get(u.vue);
    if (!el) { el = fabriques[u.vue](ctx); construites.set(u.vue, el); centre.appendChild(el); }
    for (const [v, e] of construites) e.hidden = v !== u.vue;
    if (nav) nav.hidden = !u.navigateur;
  };
  ctx.ui.subscribe((e, avant) => { if (e.vue !== avant.vue || e.navigateur !== avant.navigateur) afficher(); });
  afficher();
}
