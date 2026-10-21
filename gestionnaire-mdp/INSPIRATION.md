# Gestionnaire de mots de passe : recherche et inspiration

*Rédigé par le Manager, 21 octobre 2026. À lire avant [PLAN.md](./PLAN.md).*

## 1. Ce qu'Eliott demande

> « Un KeePass maison avec une belle interface, compatible avec Opera et le plus d'applis possible. Je voudrais un truc bien safe. »

Trois exigences, dans cet ordre de priorité : **sûr**, **compatible**, **beau**.

## 2. Ce que font les références

### KeePass / KeePassXC (le modèle « fichier local »)
- Le coffre est **un seul fichier chiffré `.kdbx`** que l'utilisateur garde où il veut (disque, clé USB, dossier synchronisé). Aucun serveur.
- Le format **KDBX 4** ([spécification KeePass](https://keepass.info/help/kb/kdbx_4.html)) : en-tête authentifié par HMAC-SHA-256, contenu découpé en blocs authentifiés, chiffrement AES-256 ou ChaCha20, dérivation de la clé par **Argon2** (`Argon2d` ou `Argon2id`).
- **C'est le point clé pour « le plus d'applis possible »** : un fichier KDBX 4 s'ouvre dans KeePassXC (Windows, macOS, Linux), KeePass 2, KeePassDX (Android), Strongbox et KeePassium (iOS, macOS). Si notre application lit et écrit du KDBX 4 standard, Eliott retrouve ses mots de passe partout, même si notre outil disparaît.
- Les codes à usage unique (TOTP) sont stockés par KeePassXC dans un attribut `otp` au format `otpauth://totp/...`. En le reprenant, nos codes 2FA restent compatibles.
- L'extension **KeePassXC-Browser** dialogue avec l'application de bureau par *native messaging*, avec un chiffrement NaCl `box` et une « association » par clé permanente ([protocole](https://github.com/keepassxreboot/keepassxc-browser/blob/develop/keepassxc-protocol.md)). C'est solide mais demande une appli de bureau installée et un hôte natif par OS : trop lourd pour notre v1 (voir §5).

### Bitwarden (le modèle « cloud chiffré »)
- Chiffrement de bout en bout, le serveur ne voit que des données chiffrées ([livre blanc sécurité](https://bitwarden.com/help/bitwarden-security-white-paper/)).
- Mais l'étude d'ETH Zurich *Zero Knowledge (About) Encryption* ([ePrint 2026/058](https://eprint.iacr.org/2026/058), USENIX Security 2026) a trouvé **12 attaques sur Bitwarden, 7 sur LastPass, 6 sur Dashlane et 6 sur 1Password** quand le serveur est malveillant. Leçon : **un serveur, c'est une surface d'attaque**. Nous n'en aurons pas. La synchronisation se fera en déposant le fichier `.kdbx` dans le dossier synchronisé de son choix (Syncthing, Nextcloud, Drive…), comme avec KeePassXC.

### Les extensions de remplissage : le vrai point faible
- **« DOM-based extension clickjacking »** (Marek Tóth, DEF CON 33, août 2025, [The Hacker News](https://thehackernews.com/2025/08/dom-based-extension-clickjacking.html)) : un site piégé place un formulaire invisible sous un faux bouton (bannière cookies…). L'extension injecte son menu de remplissage dans la page, l'utilisateur clique, les identifiants partent chez l'attaquant. **10 extensions sur 11 vulnérables**, et toutes remplissaient aussi sur les sous-domaines.
- La parade la plus sûre recommandée par le chercheur : **pas de remplissage automatique ni de menu injecté dans la page**, l'accès aux sites « au clic » dans Chromium.
- **Notre choix :** l'extension n'injecte *aucune* interface dans les pages. Le remplissage se déclenche uniquement depuis la fenêtre de l'extension (clic sur l'icône) ou un raccourci clavier, et seulement si l'origine exacte de la page correspond à l'entrée.

## 3. Compatibilité navigateurs
- **Opera** est basé sur Chromium et exécute les extensions Chrome. Opera passe lui-même à un store réservé au **Manifest V3** ([blog Opera, sept. 2025](https://blogs.opera.com/news/2025/09/mv2-extensions-opera/)). Une extension MV3 couvre donc Opera, Chrome, Edge, Brave et Vivaldi d'un coup.
- En MV3, le *service worker* est arrêté après ~30 s d'inactivité : il ne peut pas garder le coffre ouvert. Le **document offscreen** (`chrome.offscreen`) n'a pas de limite de durée sauf pour la raison audio, il n'a accès qu'à l'API `runtime`, et une extension n'en a qu'un à la fois ([doc Chrome](https://developer.chrome.com/docs/extensions/reference/api/offscreen)). C'est l'endroit idéal pour garder le coffre déverrouillé en mémoire, sans rien écrire en clair.
- Firefox : MV3 aussi, mais sans `chrome.offscreen`. Hors périmètre v1, noté comme piste.

## 4. Bibliothèques reconnues (aucune crypto maison)
| Besoin | Bibliothèque | Remarque |
|---|---|---|
| Lire/écrire KDBX 3 et 4 | [`kdbxweb`](https://github.com/keeweb/kdbxweb) (moteur de KeeWeb) | Dépendances : fflate, xmldom. Argon2 **non inclus** : on le branche via `CryptoEngine.setArgon2Impl`. `ProtectedValue` garde les secrets masqués (XOR) en mémoire. |
| Argon2id | [`hash-wasm`](https://www.npmjs.com/package/hash-wasm) | WebAssembly, maintenu, testé. Demande `'wasm-unsafe-eval'` dans la CSP de l'extension (autorisé en MV3). |
| Aléa, HMAC (TOTP) | WebCrypto (`crypto.getRandomValues`, `crypto.subtle`) | Natif du navigateur. |
| Force des mots de passe | [`@zxcvbn-ts/core`](https://zxcvbn-ts.github.io/zxcvbn/) + dictionnaire français | Hors ligne. |
| Phrases de passe | Liste EFF *large wordlist* (7 776 mots) | Fichier embarqué, aucune requête. |

## 5. Options d'architecture étudiées
| Option | Pour | Contre | Verdict |
|---|---|---|---|
| Appli de bureau (Tauri/Electron) + extension par native messaging, comme KeePassXC | Accès fichier simple | Installeur par OS, hôte natif à enregistrer, beaucoup plus de code sensible | Non pour la v1 |
| **Tout dans l'extension MV3** : page « Coffre » plein écran + fenêtre rapide + remplissage | Une seule installation, marche dans Opera tout de suite, aucun serveur | Accès fichier via l'API File System Access (à redonner à chaque session) | **Retenu** |
| Appli web (PWA) seule | Simple | Pas de remplissage | La page Coffre est aussi construite en version web autonome (démo, et usage sans extension) |

## 6. Interface : ce qui rend un gestionnaire agréable
- **Trois colonnes** sur grand écran (groupes, liste, détail), comme 1Password et KeePassXC, une seule colonne sur mobile.
- **Recherche immédiate** au clavier (`/` ou `Ctrl+K`), tout pilotable au clavier.
- **Mots de passe colorés par type de caractère** (chiffres, symboles) en police à chasse fixe, pour distinguer `0/O` et `l/1`.
- **Copie en un clic** avec effacement du presse-papiers au bout de 30 s, et un compte à rebours visible.
- **Générateur** accessible partout, avec curseur de longueur, phrase de passe et jauge de force.
- **Codes TOTP** avec un petit anneau qui se vide.
- **Santé du coffre** : mots de passe faibles, réutilisés ou anciens (calcul local).
- Verrouillage clair et rassurant : grand cadenas, état « Verrouillé » toujours visible.

## Sources
- [Spécification KDBX 4 (keepass.info)](https://keepass.info/help/kb/kdbx_4.html)
- [kdbxweb (GitHub)](https://github.com/keeweb/kdbxweb)
- [hash-wasm (npm)](https://www.npmjs.com/package/hash-wasm)
- [Protocole KeePassXC-Browser](https://github.com/keepassxreboot/keepassxc-browser/blob/develop/keepassxc-protocol.md)
- [Livre blanc sécurité Bitwarden](https://bitwarden.com/help/bitwarden-security-white-paper/)
- [Scarlata et al., Zero Knowledge (About) Encryption, ePrint 2026/058](https://eprint.iacr.org/2026/058)
- [DOM-based extension clickjacking, The Hacker News](https://thehackernews.com/2025/08/dom-based-extension-clickjacking.html)
- [Offscreen API, Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Opera et le passage au MV3](https://blogs.opera.com/news/2025/09/mv2-extensions-opera/)
