# Fréquence

Un studio de musique complet dans le navigateur, écrit par nous de bout en bout : séquenceur pas à pas,
piano roll, arrangement, console de mixage, 7 instruments et 15 effets maison, 124 presets, un morceau de
démo et des modèles de projet, dont Techno 132 BPM et House 124 BPM. Tout tient dans **un seul fichier HTML**, fonctionne hors ligne et ne fait
aucune requête réseau. Il n'y a aucun fichier audio : chaque son est synthétisé en direct par Web Audio.

## Ce qu'il y a dedans

| Partie | Ce qu'on y fait |
| --- | --- |
| **Rack** | Les canaux (un instrument chacun) et leur séquenceur pas à pas de 16, 32 ou 64 pas. |
| **Piano roll** | Écrire des mélodies et des accords note par note, vélocités, quantification. |
| **Arrangement** | Poser les patterns sur des pistes pour construire le morceau, boucle de lecture. |
| **Console** | 12 tranches et un maître : volume, panoramique, muet, solo, 8 effets par tranche. |
| **Navigateur** | Presets d'instruments et d'effets (survol pour écouter), modèles de projet, sons importés. |

**Instruments**

- **Trio** : synthé soustractif à 3 oscillateurs (basses, leads, nappes, cuivres). 25 presets.
- **Prisme** : synthé FM à 4 opérateurs (cloches, pianos électriques, basses métalliques). 12 presets.
- **Frappe** : boîte à rythmes synthétisée à 12 voix (grosse caisse, rimshot, caisse claire, clap, charleys,
  toms, percu, crash, ride, cloche) et un réglage « Caractère » plus ou moins brut. 6 kits, dont Entrepôt
  (techno), Garage et Minimal.
- **Corde** : corde pincée par modèle physique (guitare, harpe, pizzicato). 6 presets.
- **Échantillon** : joue vos propres sons (.wav, .mp3, .ogg, .flac) à toutes les hauteurs. 2 presets.
- **Acide** : basse monophonique qui couine, filtre très résonant, accents (vélocité ≥ 80 %) et glissés
  (notes qui se chevauchent). 12 presets.
- **Accord** : une note joue tout un accord (majeur, mineur, m7, m9, sus…) en orgue, nappe large ou piano
  house. Stabs, orgues garage, nappes Detroit. 12 presets.

**Effets** : Réverbe, Délai, Compresseur, Égaliseur 7 bandes, Distorsion, Filtre, Limiteur, Chorus,
Pompe, Bitcrusher, et pour la techno et la house : Sidechain (le volume plonge à chaque coup de la
grosse caisse d'une autre tranche), Porte (hachage rythmé sur 16 pas), Phaser, Autofiltre (filtre
qui monte sur 8 mesures ou suit le volume) et Saturation (bande, lampe, repli). 49 presets d'effets.

## Prise en main en 5 minutes

À l'ouverture, cliquez sur **Cliquer pour activer le son** (le navigateur n'autorise le son qu'après un
geste), ou sur **Écouter la démo** pour entendre « Premier jet » joué entièrement par Fréquence.

1. **Un beat** (Rack, `Alt+1`). Cliquez sur les pas de la grosse caisse : 1, 5, 9 et 13. Ajoutez la
   caisse claire sur 5 et 13, le charley un pas sur deux. `Espace` lance la lecture en boucle. Clic droit
   glissé sur un pas allumé : sa vélocité.
2. **Une mélodie** (Piano roll, `Alt+2`). Choisissez le canal Trio, dessinez des notes au crayon (`B`),
   effacez à la gomme (`E`). Au clavier : les flèches déplacent le curseur, `Entrée` pose une note.
   Le bouton clavier de la barre du haut transforme l'ordinateur en piano (rangées Q…M et A…P, octave
   avec Z et X). Un clavier MIDI branché joue aussi le canal sélectionné.
3. **Arranger** (Arrangement, `Alt+3`). Choisissez un pattern dans la liste, cliquez sur une piste pour
   le poser, étirez le clip pour le répéter. Passez en mode **MORCEAU** (`L`) pour écouter tout le morceau.
4. **Mixer** (Console, `Alt+4`). Réglez les volumes, cliquez sur un emplacement libre pour ajouter un
   effet (une réverbe sur la caisse claire, un limiteur sur le maître), ou glissez un preset d'effet
   depuis le navigateur.
5. **Exporter**. `Ctrl+E` exporte un WAV (44,1 ou 48 kHz, 16 ou 24 bits) ; `Ctrl+S` enregistre le
   projet dans un fichier `.frequence` que `Ctrl+O` rouvre. Le travail en cours est aussi sauvegardé
   automatiquement dans le navigateur et proposé au prochain démarrage.

Pour partir d'une base : **Projet › Nouveau…** propose Vide, Beat hip-hop 90 BPM, House 124 BPM,
Techno 132 BPM et Lo-fi 75 BPM. Les deux modèles de club sont des morceaux de 36 mesures (intro,
groove, montée, pause, final) :

- **Techno 132** : grosse caisse roulante doublée d'un « grondement » (réverbe sombre pompée par le
  sidechain), ligne d'Acide, charley ouvert, ride, nappe hachée par la Porte.
- **House 124** : stabs d'Accord pompés par le sidechain, charley ouvert à contretemps, percu, pont au
  piano house.

## Raccourcis

| Touche | Action |
| --- | --- |
| `Espace` / `Ctrl+Espace` | Lecture et arrêt / pause |
| `L` | Basculer PAT (pattern en boucle) et MORCEAU (arrangement) |
| `Alt+1` … `Alt+4` | Rack, Piano roll, Arrangement, Console |
| `Ctrl+Z` / `Ctrl+Maj+Z` | Annuler / rétablir (200 étapes) |
| `Ctrl+S` / `Ctrl+O` / `Ctrl+E` | Enregistrer / ouvrir / exporter en WAV |
| `B`, `E`, `S`, `C` | Crayon, gomme, sélection, découpe |
| `Q` | Quantifier |
| `Ctrl+A`, `Ctrl+C`, `Ctrl+V`, `Ctrl+D` | Tout sélectionner, copier, coller, dupliquer |
| `↑` `↓` (Maj : octave), `←` `→` | Transposer, déplacer d'un cran de grille |
| `Alt` en glissant / `Maj` en glissant | Sans aimant / copier en déplaçant |
| `Maj` sur un bouton, double-clic | Réglage fin, valeur par défaut |
| `?` | La liste complète dans l'application |

## Travailler avec d'autres logiciels

Fréquence échange avec n'importe quel logiciel de musique par deux formats standard :

- **WAV** (`Ctrl+E`) : le morceau ou le pattern courant, prêt à écouter, mixer ailleurs ou publier.
- **MIDI** (Projet › Exporter en MIDI) : un fichier de type 1, une piste par canal, la batterie sur le
  canal 10 avec les numéros de notes General MIDI. **Projet › Importer un fichier MIDI…** fait l'inverse :
  chaque piste devient un canal, avec un kit Frappe pour la batterie.
- **Dans claude.ai**, le lecteur d'artefacts n'accepte pas les extensions .wav, .mid et .frequence :
  ces fichiers arrivent dans un `.zip` (par exemple `Mon morceau.wav.zip`) qu'il suffit de décompresser.
  `Ctrl+O` et les imports acceptent aussi directement ces `.zip`.
- **Sons** : Projet › Importer un son… (ou glisser un fichier sur le navigateur) crée un canal Échantillon.
  Jusqu'à 50 Mo et 2 minutes par son.

## Lancer en local

```sh
npm ci
npm run dev            # http://localhost:5173
```

| Commande | Ce qu'elle fait |
| --- | --- |
| `npm run typecheck` | Vérifie les types (TypeScript strict). |
| `npm test` | Tests unitaires (Vitest). |
| `npm run build:artefact` | Construit `dist/artefact/frequence.html`, le fichier unique livré. |
| `npm run e2e` | Tests de bout en bout (Playwright) sur ce fichier : parcours complet, captures, rendu audio. |

`npm run e2e` attend que l'artefact soit construit. `FREQUENCE_CHROMIUM` peut désigner un Chromium déjà
installé, et `FREQUENCE_CAPTURES` le dossier des captures d'écran (par défaut `test-results/captures`).

## Organisation du code

- `src/engine/` : le moteur audio (instruments, effets, voix, transport, console, rendu hors ligne, WAV).
- `src/project/` : le format du projet, l'historique (annuler / rétablir), la validation des fichiers,
  la sauvegarde automatique, les presets, le MIDI, la démo et les modèles.
- `src/ui/` : l'interface, sans framework (composants, vues, raccourcis).
- `test/` et `e2e/` : tests unitaires et de bout en bout.

L'artefact applique une politique de sécurité stricte : scripts et styles autorisés par empreinte,
`connect-src 'none'` (aucune requête réseau possible). Aucune dépendance n'est embarquée à l'exécution.
