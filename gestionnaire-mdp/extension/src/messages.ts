// Protocole de messages de l'extension (contrat §D.3 du PLAN.md).
//
// Chemin d'un message :
//   popup.html / vault.html  --(Requete)-->  background.ts (vérifie l'expéditeur)
//   background.ts  --(MessageGardien)-->  offscreen.html (le gardien, seul à tenir le coffre)
// Le gardien n'accepte que les messages relayés par le service worker, qui a
// déjà contrôlé l'expéditeur et indique de quelle page vient la demande.

/** Méthodes de `VaultBackend` (§D.2) acceptées sous la forme `vault/<methode>`. */
export const METHODES_VAULT = [
  'status',
  'create',
  'openFile',
  'unlock',
  'lock',
  'save',
  'exportFile',
  'listGroups',
  'listEntries',
  'search',
  'getEntry',
  'getSecret',
  'getTotp',
  'copySecret',
  'addEntry',
  'updateEntry',
  'deleteEntry',
  'addGroup',
  'renameGroup',
  'deleteGroup',
  'changeMasterKey',
  'health',
  'getSettings',
  'setSettings',
] as const;
export type MethodeVault = (typeof METHODES_VAULT)[number];

/** Méthodes qui renvoient un secret en clair : réservées à vault.html et popup.html. */
export const METHODES_SECRETES: readonly MethodeVault[] = ['getSecret'];

/**
 * Un secret peut-il être remis à cette page ? La graine 2FA (champ `otp`,
 * l'URI otpauth://) ne sort que vers vault.html (écran d'édition). `'totp'`
 * désigne le code du moment, calculé par le gardien : le popup peut l'obtenir.
 */
export function secretAutorise(page: PageExtension | undefined, kind: unknown): boolean {
  if (page === 'vault') return true;
  if (page !== 'popup') return false;
  if (kind === 'password' || kind === 'totp') return true;
  if (typeof kind === 'object' && kind !== null && typeof (kind as { field?: unknown }).field === 'string') {
    return (kind as { field: string }).field.toLowerCase() !== 'otp';
  }
  return false;
}

/** Réglages : tenus par le service worker dans chrome.storage, pas par le gardien. */
export const METHODES_REGLAGES: readonly MethodeVault[] = ['getSettings', 'setSettings'];

export type TypeRequete = `vault/${MethodeVault}` | 'fill/candidates' | 'fill/run';

export interface Requete {
  type: TypeRequete;
  args: unknown[];
}

export type CodeErreur =
  | 'mauvais-mot-de-passe'
  | 'fichier-corrompu'
  | 'format-non-supporte'
  | 'introuvable'
  | 'verrouille'
  | 'refuse'
  | 'interne';

export type Reponse<T = unknown> = { ok: true; value: T } | { ok: false; code: CodeErreur; message: string };

/** Page de l'extension à l'origine d'une requête, déduite de `sender.url` par le service worker. */
export type PageExtension = 'popup' | 'vault';

/** Demandes que seul le service worker adresse au gardien. */
export type TypeInterne =
  | 'interne/tic' // alarme périodique : vérifier l'inactivité
  | 'interne/verrouiller' // session du système verrouillée, navigateur inactif
  | 'interne/reglages' // nouveaux réglages (args: [Settings])
  | 'interne/candidats' // entrées pour une URL (args: [pageUrl])
  | 'interne/identifiants'; // identifiants pour remplir (args: [entryId])

export interface MessageGardien {
  cible: 'gardien';
  type: `vault/${MethodeVault}` | TypeInterne;
  args: unknown[];
  /** Page d'origine ; absent quand la demande vient du service worker lui-même. */
  page?: PageExtension;
}

/** Diffusé par le gardien à toutes les pages ouvertes quand l'état du coffre change. */
export interface EvenementEtat {
  evenement: 'etat';
  etat: unknown;
}

/** Envoyé une fois par le gardien quand il écoute. */
export interface EvenementGardienPret {
  evenement: 'gardien-pret';
}

export function estGardienPret(m: unknown): m is EvenementGardienPret {
  return typeof m === 'object' && m !== null && (m as Record<string, unknown>).evenement === 'gardien-pret';
}

export function estRequete(m: unknown): m is Requete {
  if (typeof m !== 'object' || m === null) return false;
  const r = m as Record<string, unknown>;
  // Un message destiné au gardien n'est jamais une requête de page : le service worker l'ignore.
  if ('cible' in r || !Array.isArray(r.args) || typeof r.type !== 'string') return false;
  if (r.type === 'fill/candidates' || r.type === 'fill/run') return true;
  return r.type.startsWith('vault/') && (METHODES_VAULT as readonly string[]).includes(r.type.slice(6));
}

export function estMessageGardien(m: unknown): m is MessageGardien {
  if (typeof m !== 'object' || m === null) return false;
  const r = m as Record<string, unknown>;
  return r.cible === 'gardien' && typeof r.type === 'string' && Array.isArray(r.args);
}

export function estEvenementEtat(m: unknown): m is EvenementEtat {
  return typeof m === 'object' && m !== null && (m as Record<string, unknown>).evenement === 'etat';
}

// `URL.origin` vaut "null" pour chrome-extension:// hors de Chrome : on compare schéma et hôte.
function memeOrigineExtension(url: URL, urlExtension: string): boolean {
  const ext = new URL(urlExtension);
  return url.protocol === ext.protocol && url.host === ext.host && url.host !== '';
}

/**
 * Identifie la page de l'extension qui a envoyé un message, ou `null` si
 * l'expéditeur n'est pas une page de cette extension (§D.3). `idExtension`
 * et `urlExtension` viennent de `chrome.runtime` (paramètres pour les tests).
 */
export function pageExpeditrice(
  sender: Pick<chrome.runtime.MessageSender, 'id' | 'url' | 'tab'>,
  idExtension: string,
  urlExtension: string,
): PageExtension | null {
  if (sender.id !== idExtension || typeof sender.url !== 'string') return null;
  let url: URL;
  try {
    url = new URL(sender.url);
  } catch {
    return null;
  }
  if (!memeOrigineExtension(url, urlExtension)) return null;
  if (url.pathname === '/popup.html') return 'popup';
  if (url.pathname === '/vault.html') return 'vault';
  return null;
}

/** Vrai si l'expéditeur est le service worker de cette extension (seul interlocuteur du gardien). */
export function estServiceWorker(
  sender: Pick<chrome.runtime.MessageSender, 'id' | 'url' | 'tab'>,
  idExtension: string,
  urlExtension: string,
): boolean {
  if (sender.id !== idExtension || sender.tab !== undefined || typeof sender.url !== 'string') return false;
  try {
    const url = new URL(sender.url);
    return memeOrigineExtension(url, urlExtension) && url.pathname === '/background.js';
  } catch {
    return false;
  }
}

export function succes<T>(value: T): Reponse<T> {
  return { ok: true, value };
}

export function echec(code: CodeErreur, message: string): Reponse<never> {
  return { ok: false, code, message };
}

/** Transforme une exception en réponse d'erreur (codes de VaultError conservés). */
export function versReponseErreur(e: unknown): Reponse<never> {
  const codes: readonly string[] = ['mauvais-mot-de-passe', 'fichier-corrompu', 'format-non-supporte', 'introuvable', 'verrouille', 'refuse'];
  if (e instanceof Error) {
    const code = (e as Error & { code?: unknown }).code;
    if (typeof code === 'string' && codes.includes(code)) return echec(code as CodeErreur, e.message);
    return echec('interne', e.message);
  }
  return echec('interne', String(e));
}

/** Erreur portant un code du protocole, levée côté pages quand une réponse est un échec. */
export class ErreurCadenas extends Error {
  constructor(
    readonly code: CodeErreur,
    message: string,
  ) {
    super(message);
    this.name = 'ErreurCadenas';
  }
}

/** Les messages chrome.runtime sont sérialisés en JSON : les octets voyagent en base64. */
export function octetsVersBase64(o: Uint8Array): string {
  let s = '';
  for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode(...o.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64VersOctets(b: string): Uint8Array {
  const s = atob(b);
  const o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
  return o;
}
