// Réglages de Cadenas : même forme que `Settings` du contrat §D.2 (app/src/backend.ts).
// Ils vivent dans chrome.storage.local (tenu par le service worker) et ne contiennent aucun secret.

export interface Reglages {
  autoLockMinutes: number;
  clipboardSeconds: number;
  theme: 'systeme' | 'clair' | 'sombre';
}

export const REGLAGES_DEFAUT: Reglages = { autoLockMinutes: 10, clipboardSeconds: 30, theme: 'systeme' };
