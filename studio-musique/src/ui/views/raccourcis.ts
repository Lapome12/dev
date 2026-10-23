// Fenêtre « Raccourcis clavier » (touche ?).

import { dialogue } from '../components/dialog';
import { h } from '../dom';

export const RACCOURCIS: { groupe: string; liste: [string, string][] }[] = [
  { groupe: 'Lecture', liste: [['Espace', 'Lecture / arrêt'], ['Ctrl+Espace', 'Pause'], ['L', 'Basculer PAT / MORCEAU']] },
  { groupe: 'Vues', liste: [['Alt+1', 'Rack'], ['Alt+2', 'Piano roll'], ['Alt+3', 'Arrangement'], ['Alt+4', 'Console'], ['?', 'Cette liste']] },
  { groupe: 'Projet', liste: [['Ctrl+Z', 'Annuler'], ['Ctrl+Maj+Z', 'Rétablir'], ['Ctrl+S', 'Enregistrer'], ['Ctrl+O', 'Ouvrir'], ['Ctrl+E', 'Exporter en WAV']] },
  { groupe: 'Édition (piano roll, arrangement)', liste: [['B', 'Crayon'], ['E', 'Gomme'], ['S', 'Sélection'], ['C', 'Découpe'], ['Q', 'Quantifier'], ['Suppr', 'Supprimer la sélection'], ['Ctrl+A', 'Tout sélectionner'], ['Ctrl+C / Ctrl+V', 'Copier / coller'], ['Ctrl+D', 'Dupliquer'], ['↑ ↓', 'Transposer (Maj : octave)'], ['← →', 'Déplacer d\'un cran de grille'], ['Alt en glissant', 'Sans aimant'], ['Maj+glisser', 'Copier en déplaçant']] },
  { groupe: 'Piano au clavier (bouton clavier activé)', liste: [['Q … M, A … P', 'Jouer les notes (positions physiques)'], ['Z / X', 'Octave plus bas / plus haut']] },
  { groupe: 'Réglages', liste: [['Glisser', 'Tourner un bouton'], ['Maj', 'Réglage fin'], ['Double-clic', 'Valeur par défaut'], ['Molette, flèches', 'Petits pas'], ['Clic droit', 'Plus d\'actions']] },
];

export function ouvrirRaccourcis(): void {
  dialogue({
    titre: 'Raccourcis clavier', large: true,
    contenu: h('div', { class: 'raccourcis' }, ...RACCOURCIS.map(g => h('section', null, h('h3', null, g.groupe),
      h('dl', null, ...g.liste.flatMap(([k, t]) => [h('dt', null, ...k.split(' / ').flatMap((x, i) => [i ? ' / ' : null, h('kbd', null, x)])), h('dd', null, t)]))))),
  });
}
