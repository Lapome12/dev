// Barre d'aide en bas de l'écran : affiche le texte de l'élément survolé ou du réglage en cours.

import { installerAide, surAide } from '../aide';
import { h } from '../dom';

export function barreAide(defaut = 'Survolez un élément pour savoir ce qu\'il fait.'): HTMLElement {
  installerAide();
  const texte = h('span', { class: 'ba-texte' });
  const el = h('footer', { class: 'barre-aide', 'aria-label': 'Barre d\'aide' }, texte);
  surAide(t => {
    texte.textContent = t || defaut;
    texte.classList.toggle('vide', !t);
  });
  return el;
}
