// Démo de l'interface : DemoBackend, données fictives, rien ne quitte la page.

import { DemoBackend } from './backend-demo';
import { MOT_DE_PASSE_DEMO } from './demo-data';
import { mountApp } from './mount';
import { h } from './ui/dom';

const racine = document.getElementById('app');
if (racine) {
  mountApp(racine, new DemoBackend(), {
    bandeau: 'Démo : données fictives. Rien ne quitte cette page.',
    indice: () => h('span', null, 'Pour la démo, le mot de passe maître est ', h('b', { class: 'mono' }, MOT_DE_PASSE_DEMO), '.'),
  });
}
