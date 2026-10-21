// Interface VaultBackend (contrat §D.2 du PLAN.md). L'interface ne parle qu'à elle :
// DemoBackend (données fictives), WebBackend (core + fichiers) et ExtensionBackend (Dev 3).

import type {
  EntryDetail, EntryInput, EntrySummary, GroupInfo, HealthReport, Id, SecretKind,
} from '@cadenas/core';

export type {
  CustomField, EntryDetail, EntryInput, EntrySummary, GroupInfo, HealthReport, Id, SecretKind,
} from '@cadenas/core';

export type VaultState =
  | { state: 'aucun-coffre' }
  | { state: 'verrouille'; name: string; fileName?: string }
  | { state: 'deverrouille'; name: string; fileName?: string; dirty: boolean; lastSaved?: number };

export interface Settings {
  autoLockMinutes: number;
  clipboardSeconds: number;
  theme: 'systeme' | 'clair' | 'sombre';
}

export const REGLAGES_PAR_DEFAUT: Settings = { autoLockMinutes: 10, clipboardSeconds: 30, theme: 'systeme' };

export interface VaultBackend {
  status(): Promise<VaultState>;
  create(name: string, password: string, keyFile?: Uint8Array): Promise<void>;
  /** Choisir un .kdbx sur le disque. */
  openFile(): Promise<void>;
  unlock(password: string, keyFile?: Uint8Array): Promise<void>;
  lock(): Promise<void>;
  save(): Promise<void>;
  /** Télécharger une copie .kdbx. */
  exportFile(): Promise<void>;
  // Mêmes signatures que Vault (core), mais asynchrones :
  listGroups(): Promise<GroupInfo[]>;
  listEntries(groupId?: Id): Promise<EntrySummary[]>;
  search(q: string): Promise<EntrySummary[]>;
  getEntry(id: Id): Promise<EntryDetail>;
  getSecret(id: Id, kind: SecretKind): Promise<string>;
  /** Copie + effacement du presse-papiers après clipboardSeconds. */
  copySecret(id: Id, kind: SecretKind): Promise<void>;
  addEntry(i: EntryInput): Promise<Id>;
  updateEntry(id: Id, i: EntryInput): Promise<void>;
  deleteEntry(id: Id): Promise<void>;
  addGroup(name: string, parentId: Id | null): Promise<Id>;
  renameGroup(id: Id, n: string): Promise<void>;
  deleteGroup(id: Id): Promise<void>;
  changeMasterKey(password: string, keyFile?: Uint8Array): Promise<void>;
  health(): Promise<HealthReport>;
  getSettings(): Promise<Settings>;
  setSettings(s: Partial<Settings>): Promise<void>;
  /** Prévient l'interface d'un changement d'état (verrouillage auto, sauvegarde…). Renvoie la désinscription. */
  onChange(cb: (s: VaultState) => void): () => void;
}
