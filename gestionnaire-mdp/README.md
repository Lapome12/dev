# Cadenas

Gestionnaire de mots de passe local, compatible KeePass. Votre coffre est un fichier `.kdbx` (format **KDBX 4**, AES-256, Argon2id) que vous gardez où vous voulez. Aucun serveur, aucun compte, aucune requête réseau.

- **Extension** pour Opera, Chrome, Edge, Brave et Vivaldi : le coffre complet dans un onglet, une fenêtre rapide pour copier ou remplir.
- **Même fichier ailleurs** : KeePassXC et KeePass 2 sur ordinateur, KeePassDX sur Android, KeePassium ou Strongbox sur iPhone.
- **Version web** installable sur téléphone (voir [Sur téléphone](#sur-téléphone)).

Le modèle de sécurité et ses limites sont détaillés dans [SECURITE.md](./SECURITE.md).

> **Aucune récupération possible.** Si vous perdez votre mot de passe maître (et votre fichier clé, si vous en utilisez un), personne ne peut rouvrir le coffre, pas même nous. Notez-le sur papier et rangez-le en lieu sûr.

---

## Installer l'extension

### 1. Récupérer l'extension

Au choix :

- **Paquet prêt** : dans le dépôt GitHub, onglet *Actions* → dernier passage réussi de « Cadenas » sur `main` → *Artifacts* → `cadenas-extension`. Vous obtenez `cadenas-extension.zip`. **Décompressez-le** dans un dossier que vous ne déplacerez plus (par exemple `Documents/Cadenas-extension`).
- **Depuis le code** (Node.js 20 ou plus) :
  ```sh
  cd gestionnaire-mdp
  npm ci
  npm run build
  ```
  L'extension est dans `gestionnaire-mdp/extension/dist/`.

### 2. Opera

1. Ouvrez `opera://extensions` dans la barre d'adresse.
2. Activez **Mode développeur** (en haut à droite).
3. Cliquez sur **Charger l'extension non empaquetée** et choisissez le dossier décompressé (celui qui contient `manifest.json`).
4. Épinglez Cadenas : cliquez sur l'icône des extensions (le cube) à droite de la barre d'adresse, puis sur l'épingle à côté de Cadenas.

### Chrome, Edge, Brave, Vivaldi

Même principe, seule l'adresse change : `chrome://extensions`, `edge://extensions` (le mode développeur est en bas à gauche), `brave://extensions`, `vivaldi://extensions`. Activez le mode développeur, puis **Charger l'extension non empaquetée**.

> Le navigateur peut afficher au démarrage un rappel sur les extensions en mode développeur : c'est normal pour une extension installée hors magasin.

### Mettre à jour

Remplacez le contenu du dossier par la nouvelle version, puis cliquez sur la flèche **Recharger** de Cadenas dans la page des extensions. Votre coffre n'est pas touché.

---

## Premiers pas

1. Cliquez sur l'icône Cadenas puis **Créer ou ouvrir un coffre**. La page *Coffre* s'ouvre dans un onglet.
2. **Créer** : choisissez un nom et un mot de passe maître fort (une phrase de cinq mots ou plus est idéale). Cadenas vous demande où enregistrer le fichier `.kdbx` : choisissez de préférence un dossier synchronisé (voir plus bas).
   **Ouvrir** : choisissez un `.kdbx` existant, par exemple celui de KeePassXC.
3. Chaque modification est chiffrée puis enregistrée automatiquement. Si le navigateur redemande l'autorisation d'écrire dans le fichier, cliquez sur **Enregistrer** et acceptez.

### Remplir un site

- Sur la page de connexion, cliquez sur l'icône Cadenas : les comptes de **cette adresse exacte** sont en tête. Cliquez sur **Remplir**.
- Ou utilisez le raccourci **Ctrl+Maj+L** (**Cmd+Maj+L** sur Mac) : s'il n'y a qu'un compte pour le site, il est rempli directement ; sinon la fenêtre Cadenas s'ouvre.
- **Ctrl+Maj+U** ouvre la fenêtre Cadenas. Les raccourcis se changent dans `opera://extensions/shortcuts` (ou `chrome://extensions/shortcuts`).

Cadenas ne remplit **jamais** tout seul ni dans un site sosie : `paypa1.com` ne reçoit pas le mot de passe de `paypal.com`, un sous-domaine non plus, ni une page `http` pour un compte `https`, ni un formulaire invisible ou caché sous un faux bouton, ni une iframe d'un autre site. Il n'ajoute rien dans les pages web.

### Verrouillage

Le coffre se verrouille après 10 minutes sans utilisation (réglable), quand vous verrouillez votre session et quand vous fermez le navigateur. Un mot de passe copié est effacé du presse-papiers après 30 secondes (réglable). Le bouton **Verrouiller** est toujours visible.

---

## Le même coffre dans d'autres applications

Le fichier `.kdbx` de Cadenas est un coffre KeePass standard. Ouvrez-le avec le même mot de passe maître dans :

| Appareil | Application | Où la trouver |
|---|---|---|
| Windows, Mac, Linux | **KeePassXC** | keepassxc.org |
| Windows | **KeePass 2** | keepass.info |
| Android | **KeePassDX** | Google Play ou F-Droid |
| iPhone, iPad | **KeePassium** ou **Strongbox** | App Store |

### Synchroniser entre vos appareils

Cadenas n'a pas de serveur : c'est le **fichier** qui voyage. Placez le `.kdbx` dans un dossier synchronisé :

- **Syncthing** (direct entre vos appareils, sans cloud) : Syncthing sur ordinateur, *Syncthing-Fork* sur Android, *Möbius Sync* sur iPhone ;
- **Nextcloud** (votre propre serveur) ;
- **Google Drive**, **OneDrive**, **Dropbox** ou **iCloud Drive** : le fichier y reste chiffré, le service ne voit rien de son contenu.

Conseils :

- Modifiez le coffre sur **un seul appareil à la fois** et laissez la synchronisation se terminer avant de passer à l'autre, pour éviter deux versions en conflit. En cas de conflit, KeePassXC sait fusionner deux fichiers (*Base de données → Fusionner*).
- Gardez une **sauvegarde** ailleurs (clé USB, disque) : bouton **Exporter** dans la page Coffre.

---

## Sur téléphone

Deux possibilités, que vous pouvez combiner.

### A. L'application Cadenas Mobile (version web installable)

Cadenas Mobile est la même interface, publiée par GitHub Pages depuis ce dépôt. Une fois la publication activée, elle est à l'adresse **https://lapome12.github.io/dev/**. Elle fonctionne hors ligne et ne fait aucune requête vers l'extérieur.

- **Android (Chrome)** : ouvrez l'adresse, puis menu **⋮** → **Installer l'application** (ou **Ajouter à l'écran d'accueil**).
- **iPhone (Safari)** : ouvrez l'adresse, puis bouton **Partager** → **Sur l'écran d'accueil**.

Ouvrez ensuite votre `.kdbx` depuis le dossier synchronisé (Fichiers sur iPhone, ou le sélecteur de fichiers d'Android). Pour enregistrer vos changements, utilisez **Exporter** / **Partager** et remettez le fichier dans le dossier synchronisé.

### B. KeePassDX (Android), avec remplissage dans les applis

1. Installez **KeePassDX** (Google Play ou F-Droid) et votre outil de synchronisation (Syncthing-Fork, Nextcloud, Drive…).
2. Dans KeePassDX : **Ouvrir une base de données existante**, choisissez le `.kdbx` dans le dossier synchronisé, saisissez le mot de passe maître.
3. Pour remplir les applis et les sites : réglages Android → *Mots de passe et comptes* (ou *Système → Langues et saisie*) → **Service de saisie automatique** → **KeePassDX**.

### B'. KeePassium (iPhone, iPad)

1. Installez **KeePassium** (App Store) et l'app de votre synchronisation (Möbius Sync, Nextcloud, Google Drive…), ou utilisez iCloud Drive.
2. Dans KeePassium : **Ouvrir une base**, choisissez le `.kdbx` dans *Fichiers*, saisissez le mot de passe maître.
3. Pour remplir : *Réglages* → *Mots de passe* (ou *Général → Remplissage automatique*) → activez **KeePassium**.

Les deux applis enregistrent directement dans le fichier synchronisé : vos changements reviennent dans Cadenas sur l'ordinateur à la prochaine ouverture.

---

## Développement

```sh
cd gestionnaire-mdp
npm ci                    # versions exactes du package-lock.json
npm run typecheck
npm test                  # Vitest : core, app, extension
npm run build             # core, app/dist, extension/dist
npm run e2e -w extension  # Playwright, extension chargée dans Chromium
npm run package -w extension   # extension/cadenas-extension.zip (reproductible, SHA-256 affiché)
```

- `core/` : format KDBX, Argon2id, générateur, TOTP, correspondance d'URL (aucun DOM).
- `app/` : interface du coffre (démo, version web, page Coffre de l'extension).
- `extension/` : manifest MV3, service worker, gardien offscreen, popup, remplissage.

Les tests de remplissage utilisent un build séparé `extension/dist-e2e/` qui ajoute l'accès aux sites `*.test` servis par Playwright ; il n'est jamais empaqueté (`package.mjs` le refuse).

En local, si Playwright ne trouve pas son Chromium, indiquez-en un : `CADENAS_CHROMIUM=/chemin/vers/chromium npm run e2e -w extension`.
