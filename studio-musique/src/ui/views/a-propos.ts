// Boîte « À propos de Fréquence ».

import { dialogue } from '../components/dialog';
import { h } from '../dom';

export function aPropos(): void {
  dialogue({
    titre: 'À propos de Fréquence',
    contenu: h('div', { class: 'a-propos' },
      h('p', null, 'Fréquence est un studio de musique qui tourne entièrement dans votre navigateur : rack et séquenceur pas à pas, piano roll, arrangement, console, 5 instruments et 10 effets maison.'),
      h('p', null, 'Tous les sons sont synthétisés en direct avec Web Audio : aucun fichier audio, aucune connexion réseau. Vos projets s\'enregistrent en fichiers .frequence, et s\'échangent avec d\'autres logiciels en WAV et en MIDI.')),
  });
}
