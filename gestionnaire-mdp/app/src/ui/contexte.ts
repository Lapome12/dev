// Ce que chaque écran reçoit : le backend et quelques services communs.

import type { Settings, VaultBackend, VaultState } from '../backend';

export interface Contexte {
  backend: VaultBackend;
  /** Rafraîchit l'écran selon l'état du backend. */
  rafraichir(): Promise<void>;
  /** Affiche l'écran de création d'un coffre. */
  allerCreation(): void;
  /** Affiche l'écran d'accueil (créer ou ouvrir). */
  allerAccueil(): void;
  appliquerTheme(theme: Settings['theme']): void;
  /** Démo uniquement : texte affiché sous le formulaire de déverrouillage. */
  indice?: () => Node;
}

export type EtatOuvert = Extract<VaultState, { state: 'deverrouille' }>;

const MESSAGES: Record<string, string> = {
  'mauvais-mot-de-passe': 'Mot de passe maître ou fichier clé incorrect. Vérifiez la touche Verr. Maj.',
  'fichier-corrompu': 'Ce fichier est endommagé ou n\'est pas un coffre KeePass.',
  'format-non-supporte': 'Ce format de coffre n\'est pas pris en charge (KDBX 3.1 et 4 seulement).',
  introuvable: 'Élément introuvable. Le coffre a peut-être été verrouillé.',
  verrouille: 'Le coffre est verrouillé.',
  refuse: 'Action refusée.',
};

/** Message lisible pour une erreur du backend (VaultError, réponse de l'extension ou erreur simple). */
export function messageErreur(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') return ''; // sélecteur de fichier annulé
  if (e && typeof e === 'object') {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && code === 'mauvais-mot-de-passe') return MESSAGES[code]!;
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
    if (typeof code === 'string' && MESSAGES[code]) return MESSAGES[code]!;
  }
  return 'Une erreur inattendue est survenue.';
}
