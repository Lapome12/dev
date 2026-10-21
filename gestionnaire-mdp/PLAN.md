# Cadenas : plan du gestionnaire de mots de passe

*Rédigé par le Manager, 21 octobre 2026. Avant de commencer, lire [INSPIRATION.md](./INSPIRATION.md). « Cadenas » est un nom de travail, Eliott peut le changer.*

**Mission :** un gestionnaire de mots de passe maison type KeePass, avec une belle interface, compatible Opera et le plus d'applications possible, et surtout très sûr.
**Livrables :**
1. le code dans le dépôt GitHub `Lapome12/dev`, dossier `gestionnaire-mdp/` ;
2. une **extension navigateur** installable dans Opera (et Chrome, Edge, Brave, Vivaldi) ;
3. une **démo de l'interface** publiée en artefact HTML, avec de fausses données uniquement.

Maquette de référence publiée par le Manager : voir la ligne « Maquette » dans [MEMOIRE.md](./MEMOIRE.md) ou le fichier `gestionnaire-mdp/maquette/index.html` du dépôt.

---

## A. Les quatre décisions qui guident tout

1. **Format KDBX 4 standard.** Le coffre est un fichier `.kdbx` que KeePassXC, KeePass 2, KeePassDX (Android), Strongbox et KeePassium (iOS) savent ouvrir. C'est ce qui rend Cadenas « compatible avec le plus d'applis possible » : sur téléphone, Eliott utilise KeePassDX ou KeePassium avec le même fichier.
2. **Aucun serveur, aucune requête réseau.** Le coffre reste sur la machine. Pour synchroniser, on place le fichier dans un dossier synchronisé (Syncthing, Nextcloud, Drive…). Les pages de l'extension interdisent toute connexion sortante par CSP.
3. **Aucune crypto maison.** Seulement `kdbxweb` (format KDBX), `hash-wasm` (Argon2id) et WebCrypto (aléa, HMAC). Personne n'écrit d'algorithme de chiffrement.
4. **Remplissage uniquement à la demande.** L'extension n'injecte jamais d'interface dans les pages web (parade au *clickjacking* d'extension, voir INSPIRATION §2). On remplit seulement après un clic dans la fenêtre de l'extension ou le raccourci clavier, et seulement si l'origine exacte correspond.

## B. Stack

| Sujet | Choix |
|---|---|
| Langage | TypeScript strict (`"strict": true`, `noUncheckedIndexedAccess`) |
| Build | Vite 5, `npm` workspaces, versions **exactes** dans `package.json` (pas de `^`), `package-lock.json` commité |
| Tests | Vitest (unitaires), Playwright avec Chromium (interface et extension de bout en bout) |
| Format coffre | `kdbxweb` + Argon2id par `hash-wasm` branché via `CryptoEngine.setArgon2Impl` |
| Force des mots de passe | `@zxcvbn-ts/core` + `@zxcvbn-ts/language-common` + `@zxcvbn-ts/language-fr` |
| Interface | TypeScript et DOM natifs, sans framework (petit système de composants maison dans `app/src/ui/`) |
| Navigateur | Extension **Manifest V3** Chromium (Opera, Chrome, Edge, Brave, Vivaldi) |
| CI | GitHub Actions : typecheck, tests, `npm audit --omit=dev`, test d'interopérabilité avec `keepassxc-cli` |

Toute nouvelle dépendance doit être validée par le Manager dans son thread (une dépendance de plus, c'est du code de plus à qui on fait confiance).

## C. Architecture

```
            ┌──────────────── Extension Cadenas (MV3) ────────────────┐
            │                                                          │
 clic icône │  popup.html  ──┐                       ┌── vault.html    │  onglet plein écran
 Ctrl+Maj+L │  (Dev 3)       │  chrome.runtime       │   = app/ montée  │  (Dev 2 pour l'UI,
            │                ├──── messages ────┐    │   avec Extension │   Dev 3 pour le
            │  background.ts │  (messages.ts)   │    │   Backend        │   backend)
            │  service worker┘                  ▼    └──────────────────│
            │       │                  offscreen.html : le GARDIEN     │
            │       │                  coffre déverrouillé en mémoire, │
            │       │                  verrouillage auto, presse-papiers│
            │       │                  utilise core/ (Dev 1)            │
            │       │                          │                        │
            │       ▼                          ▼                        │
            │  chrome.scripting      IndexedDB : .kdbx CHIFFRÉ          │
            │  (remplissage ciblé)   + poignée du fichier sur disque    │
            └──────────────────────────────────────────────────────────┘
                     │
                     ▼  page web (onglet actif uniquement, après clic)
```

- **`core/`** (Dev 1) : bibliothèque pure, sans DOM ni `chrome.*`. Ouvre, modifie et enregistre un coffre KDBX 4 ; générateur ; TOTP ; correspondance d'URL ; santé du coffre.
- **`app/`** (Dev 2) : toute l'interface du coffre. Elle ne parle qu'à une interface `VaultBackend`, ce qui permet trois montages :
  - `DemoBackend` (fausses données en mémoire) pour l'artefact de démo et les tests ;
  - `WebBackend` (core + API File System Access) pour une version web autonome ;
  - `ExtensionBackend` (Dev 3) qui envoie des messages au gardien de l'extension.
- **`extension/`** (Dev 3) : manifest, service worker, gardien offscreen, popup, remplissage, empaquetage.

### Arborescence et propriétaires

```
gestionnaire-mdp/
├── package.json, tsconfig.base.json, .gitignore, .npmrc   ← Dev 1 (racine, étape 1.1)
├── README.md                                              ← Dev 3
├── SECURITE.md                                            ← Manager (étape 4)
├── maquette/index.html                                    ← Manager (référence visuelle, ne pas modifier)
├── core/                                                  ← Dev 1
│   ├── package.json, vite.config.ts
│   ├── src/index.ts           (exports publics, contrat §D.1)
│   ├── src/kdbx.ts            (créer, ouvrir, enregistrer)
│   ├── src/argon2.ts          (branchement hash-wasm, calibrage)
│   ├── src/model.ts           (groupes, entrées, historique, corbeille, champs)
│   ├── src/generator.ts, src/wordlist-eff.ts, src/strength.ts
│   ├── src/totp.ts, src/url-match.ts, src/health.ts, src/import-csv.ts
│   └── test/ (+ test/fixtures/*.kdbx créés par keepassxc-cli)
├── app/                                                   ← Dev 2
│   ├── package.json, vite.config.ts, index.html, demo.html, catalogue.html
│   ├── src/backend.ts         (interface VaultBackend, contrat §D.2)
│   ├── src/backend-demo.ts, src/backend-web.ts, src/demo-data.ts
│   ├── src/mount.ts           (export mountApp(root, backend))
│   ├── src/ui/*.ts            (composants et écrans)
│   ├── src/styles/tokens.css, base.css, components.css
│   ├── src/fonts/             (IBM Plex Sans et IBM Plex Mono, woff2, licence OFL)
│   └── test/
├── extension/                                             ← Dev 3
│   ├── package.json, vite.config.ts, manifest.json
│   ├── src/messages.ts        (protocole, contrat §D.3)
│   ├── src/background.ts, src/offscreen.html, src/offscreen.ts (gardien)
│   ├── src/storage.ts         (IndexedDB + poignée de fichier)
│   ├── src/backend-extension.ts
│   ├── src/popup.html, src/popup.ts, src/popup.css
│   ├── src/vault.html, src/vault.ts (monte app/ avec ExtensionBackend)
│   ├── src/fill.ts            (sonde et remplissage injectés)
│   ├── e2e/                   (Playwright + pages piégées de test)
│   └── scripts/package.mjs    (zip installable)
└── (racine du dépôt) .github/workflows/gestionnaire-mdp.yml  ← Dev 3
```

**Règle :** on ne modifie pas un fichier d'un autre dev. Le popup de Dev 3 *importe* `app/src/styles/tokens.css` et `components.css` sans les modifier ; s'il manque un composant, il le demande à Dev 2. Pour un fichier racine, on demande à Dev 1.

## D. Contrats entre les équipes (à respecter dès l'étape 1)

### D.1 API de `core` (Dev 1)
```ts
export type Id = string; // UUID KDBX
export interface GroupInfo { id: Id; name: string; parentId: Id | null; isRecycleBin: boolean }
export interface EntrySummary {
  id: Id; groupId: Id; title: string; username: string; url: string;
  tags: string[]; hasTotp: boolean; modified: number; // ms epoch
}
export interface CustomField { key: string; value: string; protected: boolean }
export interface EntryDetail extends EntrySummary {
  notes: string; fields: CustomField[]; created: number; historyCount: number;
  passwordStrength: 0 | 1 | 2 | 3 | 4; // le mot de passe lui-même n'est PAS dans EntryDetail
}
export interface EntryInput {
  groupId: Id; title: string; username: string; password: string; url: string;
  notes: string; totpUri?: string; tags: string[]; fields: CustomField[];
}
export type SecretKind = 'password' | 'totp' | { field: string };
export class VaultError extends Error {
  code: 'mauvais-mot-de-passe' | 'fichier-corrompu' | 'format-non-supporte' | 'introuvable';
}
export interface KdfOptions { memoryKiB: number; iterations: number; parallelism: number }

export class Vault {
  static create(name: string, password: string, keyFile?: Uint8Array, kdf?: KdfOptions): Promise<Vault>;
  static open(file: ArrayBuffer, password: string, keyFile?: Uint8Array): Promise<Vault>;
  save(): Promise<ArrayBuffer>;
  readonly name: string;
  listGroups(): GroupInfo[];
  listEntries(groupId?: Id): EntrySummary[];
  search(query: string): EntrySummary[];        // titre, identifiant, URL, tags ; insensible aux accents
  getEntry(id: Id): EntryDetail;
  getSecret(id: Id, kind: SecretKind): string;  // seul moyen d'obtenir un secret
  addEntry(input: EntryInput): Id;
  updateEntry(id: Id, input: EntryInput): void; // garde l'ancienne version dans l'historique KDBX
  deleteEntry(id: Id): void;                    // vers la corbeille ; définitif si déjà dans la corbeille
  addGroup(name: string, parentId: Id | null): Id;
  renameGroup(id: Id, name: string): void;
  deleteGroup(id: Id): void;
  findForUrl(pageUrl: string): EntrySummary[];  // via url-match, mode strict
  changeMasterKey(password: string, keyFile?: Uint8Array): Promise<void>;
  health(): HealthReport;
  close(): void;                                // efface les références internes
}
export function calibrateKdf(targetMs?: number): Promise<KdfOptions>; // ~1000 ms par défaut
export function generatePassword(o: { length: number; lower: boolean; upper: boolean; digits: boolean; symbols: boolean; avoidAmbiguous: boolean }): string;
export function generatePassphrase(o: { words: number; separator: string; capitalize: boolean; addDigit: boolean }): string;
export function estimateStrength(pw: string): { score: 0|1|2|3|4; crackTime: string; warning?: string; suggestions: string[] };
export function totpNow(uri: string, now?: number): { code: string; period: number; remaining: number };
export function originMatches(entryUrl: string, pageUrl: string, mode?: 'strict' | 'sous-domaines'): boolean;
export interface HealthReport { weak: Id[]; reused: Id[][]; old: Id[]; withoutPassword: Id[]; score: number }
export function importCsv(csv: string, format: 'bitwarden' | 'chrome' | 'keepassxc'): EntryInput[];
```

### D.2 Interface `VaultBackend` (Dev 2, fichier `app/src/backend.ts`)
```ts
export type VaultState =
  | { state: 'aucun-coffre' }
  | { state: 'verrouille'; name: string; fileName?: string }
  | { state: 'deverrouille'; name: string; fileName?: string; dirty: boolean; lastSaved?: number };
export interface Settings { autoLockMinutes: number; clipboardSeconds: number; theme: 'systeme' | 'clair' | 'sombre' }
export interface VaultBackend {
  status(): Promise<VaultState>;
  create(name: string, password: string, keyFile?: Uint8Array): Promise<void>;
  openFile(): Promise<void>;           // choisir un .kdbx sur le disque
  unlock(password: string, keyFile?: Uint8Array): Promise<void>;
  lock(): Promise<void>;
  save(): Promise<void>;
  exportFile(): Promise<void>;         // télécharger une copie .kdbx
  // mêmes signatures que Vault, mais asynchrones :
  listGroups(): Promise<GroupInfo[]>;  listEntries(groupId?: Id): Promise<EntrySummary[]>;
  search(q: string): Promise<EntrySummary[]>;  getEntry(id: Id): Promise<EntryDetail>;
  getSecret(id: Id, kind: SecretKind): Promise<string>;
  copySecret(id: Id, kind: SecretKind): Promise<void>; // copie + effacement après clipboardSeconds
  addEntry(i: EntryInput): Promise<Id>; updateEntry(id: Id, i: EntryInput): Promise<void>; deleteEntry(id: Id): Promise<void>;
  addGroup(name: string, parentId: Id | null): Promise<Id>; renameGroup(id: Id, n: string): Promise<void>; deleteGroup(id: Id): Promise<void>;
  changeMasterKey(password: string, keyFile?: Uint8Array): Promise<void>;
  health(): Promise<HealthReport>;
  getSettings(): Promise<Settings>; setSettings(s: Partial<Settings>): Promise<void>;
  onChange(cb: (s: VaultState) => void): () => void;  // verrouillage auto, sauvegarde…
}
export function mountApp(root: HTMLElement, backend: VaultBackend): void; // dans app/src/mount.ts
```

### D.3 Protocole de messages de l'extension (Dev 3, fichier `extension/src/messages.ts`)
- Une requête = `{ type: 'vault/<methode>', args: [...] }` qui reprend une méthode de `VaultBackend`, plus `fill/candidates` (entrées pour l'onglet actif) et `fill/run { entryId }`.
- Réponse = `{ ok: true, value }` ou `{ ok: false, code, message }` (codes de `VaultError` + `'verrouille'`, `'refuse'`).
- Le gardien **refuse** tout message dont `sender.id !== chrome.runtime.id` ou dont `sender.url` n'est pas une page de l'extension (`chrome-extension://<id>/…`). Aucun script de contenu n'écoute en permanence.
- `getSecret` n'est accepté que depuis `vault.html` et `popup.html`. Le service worker n'obtient un secret que pour `fill/run`.

## E. Modèle de sécurité

### Ce que Cadenas protège
| Menace | Parade |
|---|---|
| Vol du fichier `.kdbx` (ordinateur, clé USB, cloud) | KDBX 4, AES-256, **Argon2id** calibré à ~1 s (64 Mio minimum, parallélisme 2, au moins 3 itérations), mot de passe maître exigé fort (score zxcvbn ≥ 3 ou phrase de 5 mots et plus), fichier clé optionnel |
| Site de phishing (`paypa1.com`) | Correspondance **d'origine exacte** (schéma + hôte + port). Sous-domaines seulement si activé sur l'entrée. Jamais `http` si l'entrée est en `https` |
| *Clickjacking* d'extension, formulaire invisible | Aucune interface injectée dans les pages ; remplissage seulement sur geste de l'utilisateur dans l'extension ; refus si le champ est invisible (opacité < 0,1, taille < 4 px, hors écran, recouvert : test `elementFromPoint`) |
| Iframe hostile dans une page légitime | Le service worker **sonde** d'abord les cadres (origine de chaque `frameId`) et n'envoie les identifiants qu'aux cadres dont l'origine correspond exactement |
| Page web qui parle à l'extension | Aucun `externally_connectable`, aucune `web_accessible_resources`, aucun script de contenu permanent, vérification de l'expéditeur (§D.3) |
| Exfiltration réseau | CSP des pages de l'extension : `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; img-src 'self' data:; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. Aucune `host_permissions`. Polices et liste de mots embarquées |
| Coffre resté ouvert | Verrouillage auto après 10 min d'inactivité (réglable), au verrouillage de la session (`chrome.idle`), à la fermeture du navigateur. Bouton « Verrouiller » toujours visible |
| Presse-papiers | Effacé après 30 s (réglable) par le gardien, compte à rebours affiché |
| Écriture en clair sur le disque | Jamais. IndexedDB ne contient que le `.kdbx` **chiffré**. `chrome.storage` ne contient que les réglages. Rien dans `localStorage` |
| Chaîne d'approvisionnement npm | Peu de dépendances, versions exactes, `npm ci`, `npm audit` en CI, aucun code chargé à distance |

### Permissions du manifest (et rien d'autre)
`activeTab`, `scripting`, `storage`, `offscreen`, `idle`, `alarms`, `clipboardWrite`. Raccourcis : `_execute_action` (`Ctrl+Maj+U`) et `remplir` (`Ctrl+Maj+L`).

### Hors périmètre (à écrire tel quel dans SECURITE.md)
Un ordinateur infecté (enregistreur de frappe, logiciel espion), un navigateur compromis, ou quelqu'un qui regarde l'écran pendant que le coffre est ouvert. Aucun gestionnaire de mots de passe ne protège de ces cas. Il n'existe **aucune récupération** si le mot de passe maître est perdu : l'interface le dit clairement à la création.

## F. Direction artistique : « Cadenas, calme et précis »

L'interface doit rassurer : sobre, nette, un seul accent, beaucoup d'air. Elle ne doit pas « faire IA » (cf. mission 1) : pas de dégradés violets, pas d'émojis, pas de cartes en verre dépoli.

- **Polices embarquées** (aucune requête) : **IBM Plex Sans** (400, 500, 600) pour l'interface, **IBM Plex Mono** (400, 500) pour les mots de passe, codes et identifiants techniques. Licence OFL, fichiers woff2 dans `app/src/fonts/`.
- **Thème** : suit le système, avec choix manuel (Système, Clair, Sombre). Jetons dans `app/src/styles/tokens.css` :

| Jeton | Clair | Sombre | Usage |
|---|---|---|---|
| `--fond` | `#F5F4F0` | `#111315` | Fond de l'application |
| `--surface` | `#FFFFFF` | `#191C1F` | Panneaux, liste, détail |
| `--surface-2` | `#ECEAE4` | `#22262A` | Survol, champ, barre latérale |
| `--filet` | `#DCD9D1` | `#2E3338` | Bordures 1 px |
| `--texte` | `#1A1C1E` | `#E9E7E2` | Texte principal |
| `--texte-doux` | `#5D6167` | `#9CA1A7` | Libellés, métadonnées |
| `--accent` | `#2F6B4F` | `#6DBE94` | **Seul accent** (vert sapin) : bouton principal, sélection, focus |
| `--sur-accent` | `#FFFFFF` | `#0D1A13` | Texte sur l'accent |
| `--danger` | `#B3261E` | `#F28B82` | Supprimer, mot de passe faible |
| `--alerte` | `#8A5A00` | `#E6B85C` | Réutilisé, ancien |
| `--chiffre` | `#2456C9` | `#8AB4FF` | Chiffres dans un mot de passe |
| `--symbole` | `#A1367F` | `#E39BD3` | Symboles dans un mot de passe |

- **Formes** : rayon 8 px (6 px pour les champs), une seule ombre douce réservée aux menus et boîtes de dialogue. Taille de texte de base 15 px, interligne 1,45. Icônes SVG maison au trait 1,5 px, en `currentColor`.
- **Mise en page** : trois colonnes au-dessus de 1100 px (groupes 240 px, liste 360 px, détail), deux colonnes entre 720 et 1100 px, une colonne en dessous avec navigation par pile. Popup : 380 × 560 px.
- **Mouvement** : 150 ms maximum, `ease-out`, aucun au-delà de `prefers-reduced-motion`.
- **Accessibilité** : contraste AA, focus visible (anneau `--accent` de 2 px), tout au clavier (`/` ou `Ctrl+K` recherche, `↑ ↓` liste, `Ctrl+C` copie le mot de passe de l'entrée sélectionnée, `Ctrl+B` copie l'identifiant, `Échap` ferme, `Ctrl+L` verrouille).
- **Textes** en français, tutoiement non, vouvoiement oui, phrases courtes. Exemple : « Coffre verrouillé. Saisissez votre mot de passe maître. »

## G. Règles d'équipe et Git

- Chaque dev travaille sur sa propre branche et ouvre une PR vers `main` intitulée `Cadenas : <sujet> (Dev N, étape X.Y)`. Le Manager relit et fusionne. Une PR par étape ou par tâche, pas de PR géante.
- La CI doit être verte avant fusion. On ne désactive jamais un test pour passer.
- Chaque dev coche **uniquement ses propres cases** ci-dessous quand sa PR est fusionnée (relire ce fichier juste avant de l'écrire : d'autres l'écrivent aussi).
- Blocage, changement de contrat (§D), nouvelle dépendance : on écrit au Manager. On ne modifie pas un contrat seul.
- Jamais de vrai mot de passe dans le dépôt, les tests ou la démo. Données de démo : comptes fictifs (`exemple.fr`, `demo@exemple.fr`).

---

## H. Étapes

Légende : `[ ]` à faire, `[x]` fait. Les tâches d'une même étape se font en parallèle.

### Étape 0 : Cadrage (Manager)
- [x] 0.1 Recherche et [INSPIRATION.md](./INSPIRATION.md)
- [x] 0.2 Ce plan
- [x] 0.3 Maquette interactive publiée en artefact (`maquette/index.html`), référence visuelle pour Dev 2 et Dev 3

### Étape 1 : Fondations
- [ ] **1.1 (Dev 1, à faire en premier, petite PR)** Racine du projet : `package.json` avec workspaces `core`, `app`, `extension` ; `tsconfig.base.json` strict ; `.gitignore` ; `.npmrc` (`save-exact=true`) ; scripts `typecheck`, `test`, `build`. Les deux autres devs partent de cette PR.
- [ ] 1.2 (Dev 1) `core/src/kdbx.ts` + `argon2.ts` : `Vault.create`, `Vault.open`, `save`, `close` en KDBX 4 / AES-256 / Argon2id ; `calibrateKdf`. Tests d'interopérabilité : un coffre créé par `keepassxc-cli` s'ouvre dans core, un coffre enregistré par core s'ouvre dans `keepassxc-cli` (`apt install keepassxc`).
- [ ] 1.3 (Dev 2) Système visuel : `tokens.css`, `base.css`, `components.css`, polices embarquées, icônes ; page `catalogue.html` montrant tous les composants (boutons, champs, champ mot de passe coloré, liste, badges de force, anneau TOTP, toast de copie, boîte de dialogue) en clair et en sombre.
- [ ] 1.4 (Dev 2) `app/src/backend.ts` (contrat §D.2), `backend-demo.ts` et `demo-data.ts` (25 entrées fictives réparties en groupes, dont quelques faibles et réutilisées pour l'écran Santé).
- [ ] 1.5 (Dev 3) Squelette de l'extension : `manifest.json` (permissions et CSP du §E exactement), `background.ts`, gardien `offscreen.ts` minimal, `messages.ts` (contrat §D.3), build Vite qui produit `extension/dist/` chargeable via « Charger l'extension non empaquetée » dans Opera et Chrome.
- [ ] 1.6 (Dev 3) CI `.github/workflows/gestionnaire-mdp.yml` : `npm ci`, typecheck, Vitest, `npm audit --omit=dev --audit-level=high`, installation de `keepassxc-cli`, Playwright Chromium.

### Étape 2 : Cœur fonctionnel
- [ ] 2.1 (Dev 1) `model.ts` : groupes, entrées, historique KDBX à chaque modification, corbeille, champs personnalisés protégés, tags, recherche sans accents. Attribut TOTP au format KeePassXC (`otp` = `otpauth://…`).
- [ ] 2.2 (Dev 1) `generator.ts` (aléa `crypto.getRandomValues` avec rejet pour éviter le biais modulo, au moins un caractère de chaque classe choisie), `wordlist-eff.ts`, `strength.ts` (zxcvbn-ts en français). Tests statistiques simples de répartition.
- [ ] 2.3 (Dev 1) `totp.ts` (RFC 6238, SHA-1/256/512, 6 ou 8 chiffres ; vecteurs de test officiels de la RFC) et `url-match.ts` (origine exacte, mode sous-domaines via liste des suffixes publics, refus `http` contre `https`, IDN normalisés en punycode).
- [ ] 2.4 (Dev 1) `health.ts` : faibles, réutilisés, plus d'un an, sans mot de passe.
- [ ] 2.5 (Dev 2) Écrans sur `DemoBackend`, fidèles à la maquette : Accueil (créer ou ouvrir un coffre), Création (avertissement « aucune récupération », jauge de force), Déverrouillage, Coffre en trois colonnes, Détail (copier, afficher, TOTP), Édition (générateur intégré), Générateur, Santé, Réglages.
- [ ] 2.6 (Dev 2) `backend-web.ts` : core + File System Access (`showOpenFilePicker`, `createWritable`), repli téléchargement si l'API manque ; verrouillage auto et presse-papiers côté page.
- [ ] 2.7 (Dev 3) Gardien offscreen : `unlock`/`lock`, verrouillage auto (`alarms` + `idle`), `storage.ts` (IndexedDB pour le `.kdbx` chiffré et la poignée du fichier, écriture dans le fichier quand la permission est accordée), `backend-extension.ts`, `vault.html` qui monte `app/` avec ce backend.
- [ ] 2.8 (Dev 3) Popup : état verrouillé / déverrouillé, champ mot de passe maître, entrées correspondant à l'onglet en tête, recherche, copier identifiant / mot de passe / TOTP, bouton Remplir, générateur rapide, « Ajouter pour ce site », lien « Ouvrir le coffre ».

### Étape 3 : Remplissage sûr et intégration
- [ ] 3.1 (Dev 3) `fill.ts` : sonde des cadres puis remplissage ciblé (§E), détection des champs identifiant / mot de passe, événements `input` et `change` pour les frameworks, raccourci `Ctrl+Maj+L` (une seule entrée : remplit ; plusieurs : ouvre le popup).
- [ ] 3.2 (Dev 3) Presse-papiers : copie et effacement par le gardien (raison offscreen `CLIPBOARD`), uniquement si le contenu n'a pas changé entre-temps quand c'est vérifiable.
- [ ] 3.3 (Dev 3) Tests de bout en bout Playwright avec l'extension chargée : créer un coffre, ajouter une entrée, remplir une page de test ; **pages piégées** qui doivent être refusées : formulaire invisible, champ recouvert, iframe d'une autre origine, sous-domaine, `http` au lieu de `https`, domaine sosie.
- [ ] 3.4 (Dev 2) Build de la démo en un seul fichier (`app/dist/demo.html`, DemoBackend, bandeau « Démo : données fictives »), tests Playwright de l'interface (captures 375, 768, 1440 px en clair et sombre dans `/mnt/project-files/gestionnaire-mdp/captures/`).
- [ ] 3.5 (Dev 2) Accessibilité et clavier (raccourcis du §F), lecteur d'écran (rôles ARIA de la liste et des boîtes de dialogue), `prefers-reduced-motion`.
- [ ] 3.6 (Dev 1) Fichier clé (KeePass XML v2), `changeMasterKey`, `import-csv.ts` (exports Bitwarden, Chrome/Opera, KeePassXC). Dev 2 ajoute ensuite les écrans correspondants (3.6b).
- [ ] 3.6b (Dev 2) Écrans Importer, Changer le mot de passe maître, Fichier clé.

### Étape 4 : Revue sécurité (Manager, corrections par chaque propriétaire)
- [ ] 4.1 (Manager) Relecture ligne à ligne de `core/src/kdbx.ts`, `argon2.ts`, `generator.ts`, `extension/manifest.json`, `messages.ts`, `offscreen.ts`, `fill.ts`.
- [ ] 4.2 (Manager) Grille de contrôle : aucune requête réseau (vérifiée dans Playwright en interceptant tout), aucun secret en clair dans IndexedDB / `chrome.storage` / journaux `console`, CSP et permissions conformes au §E, `npm audit` propre, verrouillage auto testé, toutes les pages piégées refusées.
- [ ] 4.3 (Manager) `SECURITE.md` : modèle de menace, choix crypto, limites, conseils (mot de passe maître, sauvegardes, appli mobile compatible).
- [ ] 4.4 (Dev 1, Dev 2, Dev 3) Corrections demandées par la revue, chacun dans ses fichiers.

### Étape 5 : Livraison
- [ ] 5.1 (Dev 3) `README.md` : installation dans Opera (`opera://extensions`, mode développeur, « Charger l'extension non empaquetée », ou glisser le `.zip`), Chrome, Edge, Brave ; ouvrir le même coffre dans KeePassXC, KeePassDX, KeePassium ; synchroniser.
- [ ] 5.2 (Dev 3) `scripts/package.mjs` : `cadenas-extension.zip` reproductible.
- [ ] 5.3 (Dev 2) Démo finale régénérée depuis `main`.
- [ ] 5.4 (Manager) Relecture finale, publication de la démo en artefact, résumé à Eliott.
- [ ] 5.5 (Mémoire) MEMOIRE.md clôturée.

## I. Ordre conseillé
1. Dev 1 livre 1.1 dans l'heure ; Dev 2 et Dev 3 commencent leurs fichiers en parallèle et rebasent sur 1.1.
2. Étape 2 dès que les contrats §D compilent (Dev 2 et Dev 3 peuvent travailler contre des bouchons de core).
3. L'étape 3 démarre tâche par tâche, sans attendre que toute l'étape 2 soit finie.
4. Revue sécurité avant toute livraison à Eliott.
