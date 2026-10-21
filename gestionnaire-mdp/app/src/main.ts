// Version web autonome et PWA « Cadenas Mobile » : core + fichier .kdbx (WebBackend).
// Aucune donnée de démo ici.

import { WebBackend } from './backend-web';
import { mountApp } from './mount';
import { bouton } from './ui/components';
import { h } from './ui/dom';

const appliInstallee = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const tactile = matchMedia('(pointer: coarse)').matches;

const racine = document.getElementById('app');
if (racine) {
  // Sur téléphone (ou appli installée), le coffre se verrouille dès que l'appli passe en arrière-plan.
  mountApp(racine, new WebBackend({ verrouillerEnArrierePlan: appliInstallee || tactile }));
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void enregistrerServiceWorker();
}

async function enregistrerServiceWorker(): Promise<void> {
  const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  const annoncer = (sw: ServiceWorker) => {
    if (document.querySelector('.mise-a-jour')) return;
    const bandeau = h('aside', { class: 'mise-a-jour', 'aria-label': 'Mise à jour', role: 'status' },
      h('span', null, 'Une nouvelle version de Cadenas est prête.'),
      bouton({ texte: 'Mettre à jour', variante: 'principal', classe: 'petit', surClic: () => sw.postMessage('activer') }),
      bouton({ texte: 'Plus tard', variante: 'discret', classe: 'petit', surClic: () => bandeau.remove() }));
    document.body.appendChild(bandeau);
  };
  if (reg.waiting && navigator.serviceWorker.controller) annoncer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const nouveau = reg.installing;
    nouveau?.addEventListener('statechange', () => {
      if (nouveau.state === 'installed' && navigator.serviceWorker.controller) annoncer(nouveau);
    });
  });
  // Premier lancement : clients.claim() change aussi de contrôleur, sans qu'il faille recharger.
  const avaitControleur = !!navigator.serviceWorker.controller;
  let recharge = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recharge || !avaitControleur) return;
    recharge = true;
    location.reload(); // le coffre est verrouillé au rechargement : rien n'est perdu (copie chiffrée)
  });
}
