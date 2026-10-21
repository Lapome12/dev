# Eliott la Popote

Site du chef à domicile Eliott la Popote : une page longue (`index.html`) et une page de mentions légales. HTML, CSS et JavaScript natifs, sans framework ni dépendance.

## Voir le site

Ouvrir `index.html` dans un navigateur, c'est tout. Pour tester les ancres et le formulaire dans de bonnes conditions, on peut aussi lancer un petit serveur local :

```sh
cd eliott-la-popote
python3 -m http.server 8000
# puis http://localhost:8000
```

## Produire l'artefact (un seul fichier)

```sh
cd eliott-la-popote
python3 tools/build_artefact.py            # écrit dist/eliott-la-popote.html
python3 tools/build_artefact.py --strict   # échoue s'il reste une référence locale
```

Le script (Python 3.9 ou plus, bibliothèque standard uniquement) :

1. lit `index.html` et insère les `partials/*.html` dont le marqueur `<!-- PARTIAL: nom -->` serait encore présent ;
2. met en ligne tous les CSS locaux (dans l'ordre des `<link>`) et le JavaScript (en fin de `<body>`) ;
3. convertit les SVG et images de `assets/` en data URI ;
4. ajoute les mentions légales après le pied de page, sous l'ancre `#mentions-legales` et réécrit les liens entre les deux pages ;
5. signale toute référence locale oubliée et compte les `[À COMPLÉTER]` restants.

Le fichier obtenu s'ouvre seul, hors ligne. Seule la police Newsreader vient de Google Fonts ; sans réseau, le site retombe sur un serif proche (Iowan, Palatino, Georgia).

`dist/` est généré : on ne le modifie jamais à la main, on relance le script.

## Structure

```
index.html              page unique, sections assemblées depuis partials/
mentions-legales.html
css/
  tokens.css            couleurs, typographie, espacements (seule source des valeurs)
  base.css              reset, grille 12 colonnes, typo, boutons, .placeholder, .photo-a-venir
  layout.css            en-tête, navigation, ouverture, pied de page
  sections-recit.css    I. Le chef, II. La table, III. Menus, IV. Déroulé, VII. Questions
  sections-service.css  V. Assiettes, VI. Avis, VIII. Réserver
js/main.js              menu mobile, apparitions, avis, formulaire
partials/               une section par fichier, source de chaque section
assets/                 favicon et monogramme (SVG)
tools/build_artefact.py production de l'artefact
CONTENU.md              tous les textes du site
```

Les partials restent la source de chaque section : on corrige le partial **et** `index.html` (ou on relance l'assemblage).

## Comportements JavaScript

`js/main.js` pose la classe `.js` sur `<html>` puis, chaque bloc étant indépendant (une section absente ne casse rien) :

- **Menu mobile** : bouton `.entete__menu` avec `aria-controls="nav-principale"` et `aria-expanded`. Ouvert : `.nav--ouverte` sur la nav et `.menu-ouvert` sur `<html>`. Échap ferme, le focus reste piégé dans le menu, un clic sur un lien referme.
- **En-tête** : `.entete--defile` sur `#entete` dès qu'on quitte le haut de page (pour faire apparaître le filet).
- **Apparitions** : les blocs `.apparait` reçoivent `.est-visible` en entrant à l'écran. Avec `prefers-reduced-motion`, sans `IntersectionObserver` ou en cas d'erreur, tout est affiché immédiatement.
- **Avis** : compteur « 1 / 3 » du défilement horizontal sur mobile.
- **Formulaire** : validation en français (messages de `CONTENU.md`), `aria-invalid` et message sous le champ, focus sur le premier champ en erreur. Si tout est bon, le script ouvre la messagerie (`mailto:`) avec l'objet et le corps préremplis, et affiche la confirmation.

L'adresse de destination du formulaire se règle dans `partials/reserver.html` (et `index.html`), attribut `data-destinataire` du `<form>`. Tant qu'elle n'est pas une vraie adresse, la messagerie s'ouvre sans destinataire.

## À compléter par Eliott

Chaque information manquante apparaît sur le site sous la forme `[À COMPLÉTER : …]`, surlignée en brique pâle. Pour les retrouver toutes :

```sh
grep -rn "À COMPLÉTER" index.html mentions-legales.html partials/
```

Liste à fournir :

- **Photos** : toutes (ouverture, portrait, galerie de sept assiettes). Chaque emplacement indique le sujet et le format attendus.
- **Le chef** : parcours (maisons, années).
- **Prix** : les quatre formules, le menu d'automne, le déjeuner, prix plancher éventuel des grandes tablées, fourchette de la FAQ.
- **Producteurs** : fromager, producteur de poires, éleveur ou boucher.
- **Vin** : fourni ou non, accords.
- **Zone** : ville, rayon et frais de déplacement.
- **Conditions** : location de vaisselle, acompte (pourcentage), annulation.
- **Coordonnées** : téléphone, e-mail (aussi dans `data-destinataire` du formulaire), lien Instagram.
- **Avis** : trois avis clients avec prénom, occasion et ville.
- **Mentions légales** : éditeur, SIRET, hébergeur.
