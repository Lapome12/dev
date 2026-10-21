// Point d'entrée de l'interface : mountApp(root, backend) (contrat §D.2).
// Monté par demo.html (DemoBackend), index.html (WebBackend) et vault.html de l'extension (ExtensionBackend).

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/ecrans.css';
import type { Settings, VaultBackend, VaultState } from './backend';
import type { Contexte } from './ui/contexte';
import { h, remplacer } from './ui/dom';
import { ecranCoffre, type EcranCoffre } from './ui/ecran-coffre';
import { ecranAccueil, ecranCreation, ecranVerrou } from './ui/ecrans-entree';

export type { VaultBackend } from './backend';

export interface OptionsMontage {
  /** Bandeau affiché en haut (démo). */
  bandeau?: string;
  /** Démo : mot de passe rappelé sous le formulaire de déverrouillage. */
  indiceDemo?: string;
}

export function mountApp(root: HTMLElement, backend: VaultBackend, options: OptionsMontage = {}): void {
  const estDemo = 'estDemo' in backend && (backend as { estDemo?: unknown }).estDemo === true;
  const zone = h('div', { class: 'cadenas-app' });
  root.classList.add('cadenas-racine');
  remplacer(root, options.bandeau ? h('div', { class: 'bandeau-demo', role: 'note' }, options.bandeau) : null, zone);

  let coffre: EcranCoffre | null = null;
  let affiche: VaultState['state'] | 'creation' | null = null;

  const appliquerTheme = (theme: Settings['theme']) => {
    if (theme === 'systeme') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  };

  const montrer = (cle: typeof affiche, el: HTMLElement) => {
    coffre?.detruire();
    coffre = null;
    affiche = cle;
    remplacer(zone, el);
  };

  const ctx: Contexte = {
    backend,
    indiceDemo: options.indiceDemo,
    appliquerTheme,
    allerCreation: () => montrer('creation', ecranCreation(ctx)),
    allerAccueil: () => montrer('aucun-coffre', ecranAccueil(ctx)),
    rafraichir: async () => { rendre(await backend.status()); },
  };

  function rendre(s: VaultState): void {
    if (s.state === 'deverrouille') {
      if (affiche === 'deverrouille' && coffre) { coffre.majEtat(s); return; }
      const c = ecranCoffre(ctx, s, { estDemo });
      montrer('deverrouille', c.el);
      coffre = c;
      document.title = `${s.name} · Cadenas`;
      return;
    }
    document.title = 'Cadenas';
    if (s.state === 'verrouille') {
      if (affiche !== 'verrouille') montrer('verrouille', ecranVerrou(ctx, s.name, s.fileName));
      return;
    }
    if (affiche !== 'aucun-coffre' && affiche !== 'creation') montrer('aucun-coffre', ecranAccueil(ctx));
  }

  backend.onChange(s => rendre(s));
  void backend.getSettings().then(r => appliquerTheme(r.theme)).catch(() => {});
  void ctx.rafraichir();
}
