// Page catalogue : chaque composant de src/ui/components.ts, côte à côte en clair et en sombre.
// Données fictives uniquement.

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/catalogue.css';
import { h } from './ui/dom';
import { icone, NOMS_ICONES } from './ui/icons';
import {
  anneauTotp, bouton, caseACocher, champ, champMotDePasse, confirmer, curseur, encart, formaterCode,
  jaugeForce, logo, monogramme, motDePasseColore, motDePasseMasque, onglets, ouvrirDialogue, pastille, puce, toast,
} from './ui/components';

const JETONS = ['fond', 'surface', 'surface-2', 'filet', 'texte', 'texte-doux', 'accent', 'sur-accent', 'accent-pale', 'danger', 'alerte', 'chiffre', 'symbole'];

const section = (titre: string, ...contenu: (Node | string)[]) =>
  h('section', { class: 'cat-section' }, h('h3', null, titre), ...contenu);

const anneaux: { maj(r: number, p: number): void }[] = [];

function colonne(theme: 'clair' | 'sombre'): HTMLElement {
  const a1 = anneauTotp(); const a2 = anneauTotp();
  anneaux.push(a1); a2.maj(4, 30);

  return h('div', { class: 'cat-theme', 'data-theme': theme },
    h('h2', null, theme === 'clair' ? 'Thème clair' : 'Thème sombre'),

    section('Couleurs',
      h('div', { class: 'nuancier' }, JETONS.map(j => h('div', { class: 'nuance' }, h('i', { 'data-j': j }), h('code', null, `--${j}`))))),

    section('Typographie',
      h('div', { class: 'cat-pile typo' },
        h('span', { class: 't1' }, 'Coffre verrouillé'),
        h('h1', null, 'Messagerie Exemple'),
        h('h2', null, 'Santé du coffre'),
        h('p', null, 'Saisissez votre mot de passe maître. Texte courant en IBM Plex Sans 15 px, interligne 1,45.'),
        h('p', { class: 'doux petit' }, 'Libellé ou métadonnée : modifié le 12 octobre 2026.'),
        h('p', { class: 'mono' }, 'IBM Plex Mono : 0O lI1 |{}[] demo@exemple.fr'))),

    section('Logo et icônes',
      h('div', { class: 'cat-rang' }, logo(), logo('petit'), logo('mini'), monogramme('Banque Démo'), monogramme('Énergie', true)),
      h('div', { class: 'icones' }, NOMS_ICONES.map(n => h('span', null, icone(n), n)))),

    section('Boutons',
      h('div', { class: 'cat-rang' },
        bouton({ texte: 'Déverrouiller', variante: 'principal' }),
        bouton({ texte: 'Générer', icone: 'de' }),
        bouton({ texte: 'Verrouiller', icone: 'cadenas' }),
        bouton({ texte: 'Annuler', variante: 'discret' }),
        bouton({ texte: 'Supprimer', icone: 'corbeille', variante: 'danger' }),
        bouton({ texte: 'Vider la corbeille', variante: 'danger principal' }),
        bouton({ texte: 'Inactif', desactive: true })),
      h('div', { class: 'cat-rang' },
        bouton({ icone: 'copier', variante: 'discret', libelle: 'Copier' }),
        bouton({ icone: 'oeil', variante: 'discret', libelle: 'Afficher' }),
        bouton({ icone: 'pouls', libelle: 'Santé du coffre' }),
        bouton({ icone: 'soleil', libelle: 'Thème' }),
        bouton({ texte: 'Petit', classe: 'petit' }))),

    section('Champs',
      h('div', { class: 'formulaire' },
        champ({ etiquette: 'Titre', valeur: 'Messagerie Exemple' }).bloc,
        h('label', { class: 'champ' }, icone('loupe', 'doux'),
          h('input', { type: 'search', placeholder: 'Rechercher un site, un identifiant…', 'aria-label': 'Rechercher' }), h('kbd', null, '/')),
        champMotDePasse({ etiquette: 'Mot de passe', valeur: 'Vq7#tL2!mR9pZx4&', outils: [bouton({ icone: 'de', variante: 'discret', libelle: 'Générer' })] }).bloc,
        (() => { const c = champ({ etiquette: 'Adresse du site', valeur: 'exemple', type: 'url', aide: 'Adresse complète, par exemple https://exemple.fr' }); c.erreur('Adresse invalide : ajoutez https://'); return c.bloc; })(),
        champ({ etiquette: 'Notes', multiligne: true, valeur: 'Code client sur la carte verte.' }).bloc)),

    section('Choix',
      onglets('Type', [{ valeur: 'mdp', texte: 'Mot de passe' }, { valeur: 'phrase', texte: 'Phrase de passe' }], 'mdp', () => {}),
      onglets('Thème', [{ valeur: 'systeme', texte: 'Système' }, { valeur: 'clair', texte: 'Clair' }, { valeur: 'sombre', texte: 'Sombre' }], theme, () => {}),
      curseur({ etiquette: 'Longueur', min: 8, max: 64, valeur: 20, surChange: () => {} }),
      h('div', { class: 'cases' },
        caseACocher('Minuscules', true, () => {}), caseACocher('Majuscules', true, () => {}),
        caseACocher('Chiffres', true, () => {}), caseACocher('Symboles', false, () => {}))),

    section('Mot de passe et force',
      h('div', { class: 'sortie-mdp' }, motDePasseColore('pX2&nV8#cM5!rQ7z', true)),
      h('div', { class: 'cat-rang' }, motDePasseMasque()),
      h('div', { class: 'cat-pile' }, ([0, 1, 2, 3, 4] as const).map(n => jaugeForce(n)))),

    section('Code 2FA',
      h('div', { class: 'cat-rang' },
        h('span', { class: 'totp' }, h('span', { class: 'code' }, formaterCode('482915')), a1.el, h('span', { class: 'doux petit' }, 'animé')),
        h('span', { class: 'totp' }, h('span', { class: 'code' }, formaterCode('07319254')), a2.el, h('span', { class: 'doux petit' }, '4 s')))),

    section('Badges et états',
      h('div', { class: 'cat-rang' },
        puce('2FA'), puce('Réutilisé', 'alerte'), puce('Faible', 'danger'), puce('Passkey', 'ok'),
        pastille(3, 'danger'), pastille(2, 'alerte'), pastille(0, 'ok')),
      h('div', { class: 'cat-rang' },
        h('span', { class: 'etat' }, 'Déverrouillé · ', h('span', { class: 'mono' }, '9:42')),
        h('span', { class: 'etat modifie' }, 'Modifications non enregistrées'),
        h('span', { class: 'etat verrouille' }, 'Verrouillé'))),

    section('Liste d\'entrées',
      h('div', { class: 'cat-carte', role: 'listbox', 'aria-label': 'Entrées (exemple)' },
        [['Agenda Popote', 'contact@popote.exemple', true, true], ['Banque Démo', '00123456', true, false], ['Cloud Photos', 'demo@exemple.fr', false, false]]
          .map(([t, i, deuxFa, sel]) => h('div', { class: 'entree', role: 'option', 'aria-selected': String(sel), tabindex: '-1' },
            monogramme(String(t)), h('span', { class: 'txt' }, h('span', { class: 'titre' }, String(t)), h('span', { class: 'ident' }, String(i))),
            deuxFa && puce('2FA'))))),

    section('Fiche',
      h('div', { class: 'champs' },
        h('div', { class: 'ligne' }, h('span', { class: 'etiq' }, 'Identifiant'), h('span', { class: 'val' }, 'demo@exemple.fr'),
          h('span', { class: 'outils' }, bouton({ icone: 'copier', variante: 'discret', libelle: 'Copier l\'identifiant' }))),
        h('div', { class: 'ligne' }, h('span', { class: 'etiq' }, 'Mot de passe'),
          h('span', { class: 'val' }, motDePasseColore('Soleil2019'), h('br'), jaugeForce(1), h('span', { class: 'remarque' }, 'Réutilisé ailleurs · Plus d\'un an')),
          h('span', { class: 'outils' }, bouton({ icone: 'oeil', variante: 'discret', libelle: 'Afficher' }), bouton({ icone: 'copier', variante: 'discret', libelle: 'Copier' }))),
        h('div', { class: 'ligne' }, h('span', { class: 'etiq' }, 'Site web'), h('span', { class: 'val' }, h('a', { href: '#' }, 'mail.exemple.fr')), h('span')))),

    section('Encarts',
      encart('', 'Le coffre reste sur cet appareil. Aucune donnée n\'est envoyée en ligne.'),
      encart('alerte', h('b', null, 'Aucune récupération possible. '), 'Si vous oubliez le mot de passe maître, personne ne pourra ouvrir ce coffre.'),
      encart('danger', 'Mot de passe incorrect. Vérifiez la touche Verr. Maj.')),

    section('Toast',
      h('div', { class: 'toast statique' }, icone('copier'), h('span', null, 'Mot de passe copié. Effacé du presse-papiers dans ', h('span', { class: 'mono' }, '27 s')))),

    section('Santé',
      h('div', { class: 'sante-score' }, h('b', null, '72'), h('span', { class: 'doux' }, 'sur 100')),
      h('div', { class: 'sante-liste' },
        h('button', { class: 'sante-ligne', type: 'button' }, pastille(2, 'danger'), h('span', { class: 'txt' }, 'Mots de passe faibles', h('small', null, 'Faciles à deviner.'))),
        h('button', { class: 'sante-ligne', type: 'button', disabled: true }, pastille(0, 'alerte'), h('span', { class: 'txt' }, 'Sans mot de passe', h('small', null, 'Aucune entrée vide.'))))),

    section('Boîtes de dialogue (interactives)',
      h('div', { class: 'cat-rang' },
        bouton({ texte: 'Ouvrir une boîte', surClic: () => ouvrirDialogue({
          titre: 'Nouveau groupe', hote: document.querySelector<HTMLElement>(`[data-theme="${theme}"]`) ?? undefined,
          contenu: champ({ etiquette: 'Nom du groupe', valeur: 'Voyages' }).bloc,
          pied: [bouton({ texte: 'Annuler' }), bouton({ texte: 'Créer', variante: 'principal' })],
        }) }),
        bouton({ texte: 'Ouvrir un panneau', surClic: () => ouvrirDialogue({
          titre: 'Générateur', panneau: true, hote: document.querySelector<HTMLElement>(`[data-theme="${theme}"]`) ?? undefined,
          contenu: h('div', { class: 'sortie-mdp' }, motDePasseColore('tulipe-orage-cactus-boussole-42', true)),
        }) }),
        bouton({ texte: 'Confirmer une suppression', variante: 'danger', surClic: () => { void confirmer({ titre: 'Supprimer l\'entrée ?', message: 'Elle sera placée dans la corbeille.', valider: 'Supprimer', danger: true }); } }),
        bouton({ texte: 'Toast de copie', surClic: () => toast('Mot de passe copié', { compteARebours: 30 }) }))),
  );
}

document.body.append(
  h('header', { class: 'cat-tete' }, logo('petit'),
    h('div', null, h('h1', null, 'Cadenas : catalogue des composants'),
      h('p', null, 'Tous les éléments de l\'interface, en clair et en sombre. Données fictives.'))),
  h('main', { class: 'cat-grille' }, colonne('clair'), colonne('sombre')),
);

const tic = () => { const reste = 30 - (Math.floor(Date.now() / 1000) % 30); for (const a of anneaux) a.maj(reste, 30); };
tic();
window.setInterval(tic, 1000);
