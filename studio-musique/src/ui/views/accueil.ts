// Écran d'accueil (étape 3.5) : le navigateur n'autorise le son qu'après un geste, on en profite
// pour proposer d'écouter la démo ou de reprendre la dernière session.

import { dialogue } from '../components/dialog';
import { toast } from '../components/toast';
import type { Contexte } from '../contexte';
import { h } from '../dom';
import { chargerProjet, ecouterDemo } from '../projet';

export async function afficherAccueil(ctx: Contexte): Promise<void> {
  const reprise = await ctx.services.restoreAutosave?.().catch(() => null) ?? null;
  const activer = () => { void ctx.moteur.resume(); };
  const choix = (titre: string, texte: string, action: () => void, principal = false) => {
    const b = h('button', { type: 'button', class: principal ? 'ac-choix principal' : 'ac-choix' }, h('strong', null, titre), h('span', null, texte));
    b.addEventListener('click', () => { activer(); action(); d.fermer(); });
    return b;
  };
  const d = dialogue({
    titre: 'Bienvenue dans Fréquence',
    large: true,
    contenu: h('div', { class: 'accueil' },
      h('p', { class: 'ac-intro' }, 'Un studio de musique dans votre navigateur : faites un beat dans le Rack, écrivez une mélodie au piano roll, arrangez vos patterns et mixez dans la console. Tous les sons sont synthétisés ici même.'),
      h('div', { class: 'ac-choix-liste' },
        choix('Cliquer pour activer le son', 'Commencer avec un projet vierge (4 canaux, 130 BPM).', () => undefined, true),
        ctx.services.demo ? choix('Écouter la démo', 'Charger « Premier jet » et le lancer.', () => void ecouterDemo(ctx, false)) : null,
        reprise ? choix('Reprendre', `Rouvrir « ${reprise.project.name} », sauvegardé automatiquement.`, () => {
          chargerProjet(ctx, reprise.project);
          void ctx.echantillons.remplacerTout(reprise.samples).then(e => { if (e.length) toast(`${e.length} son(s) n'ont pas pu être relus.`, 'alerte'); });
        }) : null),
      h('p', { class: 'ac-astuce doux' }, 'Astuce : Espace lance la lecture, ? affiche tous les raccourcis.')),
    actions: [],
    surFermeture: activer,
  });
  d.el.classList.add('dialogue-accueil');
}
