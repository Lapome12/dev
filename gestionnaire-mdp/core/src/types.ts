// Types publics de @cadenas/core : contrat §D.1 du PLAN.md.
// Toute modification de ce fichier est un changement de contrat : passer par le Manager.

export type Id = string; // UUID KDBX (base64, tel que stocké dans le fichier)

export interface GroupInfo {
  id: Id;
  name: string;
  parentId: Id | null;
  isRecycleBin: boolean;
}

export interface EntrySummary {
  id: Id;
  groupId: Id;
  title: string;
  username: string;
  url: string;
  tags: string[];
  hasTotp: boolean;
  modified: number; // ms epoch
}

export interface CustomField {
  key: string;
  value: string;
  protected: boolean;
}

export interface EntryDetail extends EntrySummary {
  notes: string;
  fields: CustomField[];
  created: number;
  historyCount: number;
  passwordStrength: 0 | 1 | 2 | 3 | 4; // le mot de passe lui-même n'est PAS dans EntryDetail
}

export interface EntryInput {
  groupId: Id;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  totpUri?: string;
  tags: string[];
  fields: CustomField[];
}

export type SecretKind = 'password' | 'totp' | { field: string };

export type VaultErrorCode =
  | 'mauvais-mot-de-passe'
  | 'fichier-corrompu'
  | 'format-non-supporte'
  | 'introuvable';

export class VaultError extends Error {
  readonly code: VaultErrorCode;

  constructor(code: VaultErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = 'VaultError';
    this.code = code;
  }
}

const MESSAGES: Record<VaultErrorCode, string> = {
  'mauvais-mot-de-passe': 'Mot de passe maître ou fichier clé incorrect.',
  'fichier-corrompu': 'Le fichier du coffre est endommagé ou illisible.',
  'format-non-supporte': "Ce format de coffre n'est pas pris en charge.",
  introuvable: 'Élément introuvable dans le coffre.',
};

export interface KdfOptions {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

export interface HealthReport {
  weak: Id[];
  reused: Id[][];
  old: Id[];
  withoutPassword: Id[];
  score: number;
}
