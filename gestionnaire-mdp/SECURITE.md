# Sécurité de Cadenas

Ce document dit ce que Cadenas protège, comment, et ce qu'il ne peut pas protéger. Il est volontairement concret. Rédigé par le Manager à l'étape 4 de [PLAN.md](./PLAN.md).

## En bref

- Vos mots de passe sont dans **un seul fichier chiffré** `.kdbx` (format KeePass KDBX 4) que vous gardez où vous voulez.
- **Aucun serveur, aucun compte, aucune requête réseau.** Rien n'est envoyé nulle part.
- Le chiffrement repose uniquement sur des bibliothèques reconnues. **Personne dans l'équipe n'a écrit d'algorithme cryptographique.**
- L'extension **ne remplit qu'après votre clic**, et seulement sur **l'adresse exacte** enregistrée.
- **Aucune récupération** n'est possible si vous perdez votre mot de passe maître.

## 1. Le coffre

| Élément | Choix | Pourquoi |
|---|---|---|
| Format | KDBX 4.0 (KeePass) | Format ouvert, documenté, lisible par KeePassXC, KeePass 2, KeePassDX, KeePassium, Strongbox. Vous ne dépendez pas de Cadenas. |
| Chiffrement | AES-256 (CBC), contenu découpé en blocs authentifiés par HMAC-SHA-256 | C'est le choix par défaut de KeePass, pris en charge partout. Toute modification du fichier est détectée. |
| Dérivation de la clé | **Argon2id**, 64 Mio de mémoire, parallélisme 2, de 3 à 8 itérations calibrées sur votre machine (environ 1 s) | Argon2id rend très coûteuse chaque tentative de deviner le mot de passe, même avec des cartes graphiques. Le plafond de 8 itérations garde l'ouverture sous ~3 s sur un téléphone milieu de gamme. |
| Mot de passe maître | Force exigée à la création (estimation zxcvbn, ou phrase de 5 mots au moins), fichier clé optionnel (KeePass XML v2) | La solidité du coffre dépend avant tout de ce mot de passe. |
| Sel | Nouveau sel aléatoire à chaque enregistrement | Deux enregistrements du même coffre ne se ressemblent pas. |

Bibliothèques : [`kdbxweb`](https://github.com/keeweb/kdbxweb) (moteur de KeeWeb) pour le format, [`hash-wasm`](https://www.npmjs.com/package/hash-wasm) pour Argon2, WebCrypto du navigateur pour l'aléa et le HMAC des codes 2FA. L'interopérabilité est testée automatiquement avec `keepassxc-cli`, dans les deux sens.

À l'ouverture d'un fichier venu d'ailleurs, les paramètres Argon2 sont bornés (1 Gio, 1 000 itérations) pour qu'un fichier piégé ne puisse pas figer l'appli.

## 2. Ce qui est protégé, et comment

| Menace | Parade dans Cadenas |
|---|---|
| **Vol du fichier** `.kdbx` (ordinateur, clé USB, cloud) | Chiffrement AES-256 + Argon2id. Sans le mot de passe maître (et le fichier clé s'il y en a un), le fichier est inexploitable. |
| **Site de phishing** (`paypa1.com`, `banque.exemple.attaquant.com`) | Correspondance d'**origine exacte** : schéma, hôte et port. Les sous-domaines ne sont acceptés que si vous l'activez sur l'entrée, et jamais sur un suffixe public (`github.io`, `co.uk`) ni une adresse IP. Une entrée `https` n'est jamais remplie sur une page `http`. |
| ***Clickjacking* d'extension** (faux bouton sur un formulaire invisible, DEF CON 2025) | Cadenas **n'ajoute rien dans les pages** : pas de menu, pas d'icône dans les champs. Le remplissage ne part que de la fenêtre de l'extension ou du raccourci `Ctrl+Maj+L`. Un champ invisible, transparent (opacité cumulée < 10 %), minuscule, hors écran ou recouvert est refusé. |
| **Iframe piégée** | Les cadres de la page sont d'abord sondés sans rien modifier. Les identifiants ne vont qu'aux cadres dont l'origine correspond exactement, et seulement si **la page principale correspond aussi**. Une page légitime enfermée dans un site hostile n'est jamais remplie. |
| **Page web qui essaie de parler à l'extension** | Aucun accès externe déclaré, aucune ressource exposée aux pages, aucun script permanent dans les pages. Chaque message interne vérifie son expéditeur. Le coffre déverrouillé ne vit que dans un document caché de l'extension (le « gardien »), qui n'écoute que le service worker de l'extension. |
| **Graine des codes 2FA** | La graine (`otpauth://…`, ou `TimeOtp-*` de KeePass 2) ne quitte jamais le gardien, sauf vers l'écran d'édition du coffre. Le popup ne reçoit que le code à 6 chiffres. |
| **Exfiltration réseau** | Politique de sécurité du contenu stricte sur toutes les pages : `default-src 'self'`, aucune connexion vers l'extérieur, aucun script tiers. L'extension ne demande aucune permission sur les sites (`activeTab` seulement, accordée au clic). Polices et liste de mots sont embarquées. Vérifié : aucun appel réseau, aucun `fetch`, aucun journal `console` dans le code. |
| **Coffre resté ouvert** | Verrouillage automatique après 10 minutes sans activité (réglable de 1 à 240 min), au verrouillage de la session de l'ordinateur et à la fermeture du navigateur. Sur téléphone, verrouillage dès que l'appli passe en arrière-plan. |
| **Presse-papiers** | Effacé après 30 s (réglable). Dans la version web, l'effacement ne se fait que si le presse-papiers contient encore le secret, quand le navigateur permet de le vérifier. |
| **Données en clair sur le disque** | Jamais. IndexedDB et le stockage privé du navigateur ne contiennent que le fichier `.kdbx` **chiffré**, et les réglages ne contiennent aucun secret. Rien dans `localStorage`. |
| **Dépendances piégées** (chaîne d'approvisionnement) | Peu de dépendances, toutes en version exacte, `package-lock.json` commité, `npm ci` et `npm audit` à chaque passage de la CI, actions GitHub épinglées par empreinte. Aucun code n'est chargé à distance. |

### Permissions de l'extension

`activeTab`, `scripting`, `storage`, `offscreen`, `idle`, `alarms`, `clipboardWrite`. **Aucune** permission d'accès aux sites. Le paquet `.zip` refuse d'être construit si un accès aux sites s'y trouve (protection contre la livraison du build de test).

## 3. Sur téléphone

Deux voies, au choix :

1. **Recommandée pour le remplissage :** ouvrez le même fichier `.kdbx` avec **KeePassDX** (Android) ou **KeePassium** (iPhone), via un dossier synchronisé (Syncthing, Nextcloud, Drive…). Ces applis savent remplir les mots de passe dans toutes les applis du téléphone, ce qu'une page web ne peut pas faire.
2. **Cadenas Mobile** (version web installable) : la même interface, hors ligne, avec une copie **chiffrée** du coffre dans le stockage privé du navigateur.

**Ce qu'il faut savoir sur Cadenas Mobile :** l'appli est servie par GitHub Pages depuis le dépôt `Lapome12/dev`. **Qui contrôle ce dépôt contrôle le code servi.** Une modification malveillante du dépôt pourrait donc, au chargement suivant, voler le mot de passe maître tapé dans l'appli. Les parades :
- la politique de sécurité du contenu interdit toute connexion vers l'extérieur ;
- une nouvelle version n'est jamais installée en silence : elle est annoncée à l'écran ;
- le build est reproductible à partir du code public.

Protégez donc le compte GitHub (double authentification). Pour le plus haut niveau de sécurité sur téléphone, préférez KeePassDX ou KeePassium.

## 4. Ce que Cadenas ne protège pas

Aucun gestionnaire de mots de passe ne protège de ces cas :

- **un ordinateur ou un téléphone infecté** (enregistreur de frappe, logiciel espion, extension malveillante avec de larges permissions) ;
- **un navigateur compromis** ;
- **quelqu'un qui regarde l'écran** pendant que le coffre est ouvert ;
- **un site légitime lui-même piraté** (Cadenas remplit l'origine exacte enregistrée, il ne peut pas savoir que le site a été compromis).

Limites techniques connues :
- En mémoire, kdbxweb masque les mots de passe (`ProtectedValue`), mais JavaScript ne permet pas d'effacer de façon garantie toutes les copies d'une chaîne de caractères. Le verrouillage supprime toutes les références, et le navigateur libère ensuite la mémoire.
- Dans l'extension, le presse-papiers est effacé sans vérifier son contenu (la lecture demanderait une permission de plus). Un texte copié par vous dans les 30 s peut donc être effacé.
- L'extension est installée en mode développeur (elle n'est pas publiée dans un magasin), donc elle ne se met pas à jour toute seule.

## 5. Bonnes pratiques

1. **Un mot de passe maître long et unique**, idéalement une phrase de 5 mots ou plus générée par Cadenas. Notez-le sur papier et rangez-le en lieu sûr.
2. **Des sauvegardes** : copiez régulièrement le fichier `.kdbx` sur un deuxième support (clé USB, autre cloud). Il est chiffré, la copie ne pose pas de risque.
3. **Activez la 2FA** sur vos comptes importants, et en premier sur votre messagerie et votre compte GitHub.
4. Regardez l'écran **Santé du coffre** de temps en temps : mots de passe faibles, réutilisés ou anciens.

## 6. Revue de sécurité (étape 4)

| Contrôle | Résultat |
|---|---|
| Relecture de `core/src/kdbx.ts`, `argon2.ts`, `generator.ts`, `totp.ts`, `url-match.ts` | Conforme. Aléa sans biais (rejet), vecteurs de test officiels RFC 6238, interopérabilité KeePassXC dans les deux sens. |
| Relecture de `extension/manifest.json`, `messages.ts`, `gardien.ts`, `offscreen.ts`, `background.ts`, `fill.ts` | Trois corrections demandées puis vérifiées (PR #24) : page principale exigée, graines `TimeOtp-*` refusées au popup, opacité cumulée. |
| Graine 2FA | Contrat durci pendant le développement : elle n'est plus jamais envoyée au popup ni à l'interface pour afficher un code. |
| Pages piégées (tests Playwright avec l'extension chargée) | Toutes refusées : formulaire invisible, champ recouvert, opacité cumulée, iframe d'une autre origine, iframe légitime dans une page hostile, sous-domaine, `http` au lieu de `https`, domaine sosie, autre port. |
| Réseau | Aucune URL appelée dans le code construit, aucun `fetch` dans les sources, CSP stricte vérifiée par la CI. |
| Fuites | Aucun `console.*`, `localStorage` ni `sessionStorage` dans les sources. Seul le `.kdbx` chiffré est stocké. |
| Dépendances | `npm audit --omit=dev` : 0 vulnérabilité. `@xmldom/xmldom` forcé en 0.8.15 (faille de 0.7.13 tirée par kdbxweb). |
