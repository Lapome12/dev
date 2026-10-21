// Version web autonome : core + fichier .kdbx sur le disque (WebBackend). Aucune donnée de démo ici.

import { WebBackend } from './backend-web';
import { mountApp } from './mount';

const racine = document.getElementById('app');
if (racine) mountApp(racine, new WebBackend());
