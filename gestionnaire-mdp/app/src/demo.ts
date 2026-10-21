// Démo de l'interface : DemoBackend, données fictives, rien ne quitte la page.

import { DemoBackend } from './backend-demo';
import { MOT_DE_PASSE_DEMO } from './demo-data';
import { mountApp } from './mount';

const racine = document.getElementById('app');
if (racine) {
  mountApp(racine, new DemoBackend(), {
    bandeau: 'Démo : données fictives. Rien ne quitte cette page.',
    indiceDemo: MOT_DE_PASSE_DEMO,
  });
}
