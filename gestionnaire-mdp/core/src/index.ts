// API publique de @cadenas/core (contrat §D.1 du PLAN.md).
export * from './types';
export { Vault, generateKeyFile } from './kdbx';
export { calibrateKdf, KDF_MIN, KDF_MOBILE_MAX } from './argon2';
export { generatePassword, generatePassphrase, passwordEntropy, passphraseEntropy } from './generator';
export type { PasswordOptions, PassphraseOptions } from './generator';
export { estimateStrength } from './strength';
export type { Strength } from './strength';
export { totpNow, parseOtpUri } from './totp';
export type { TotpCode, TotpParams } from './totp';
export { originMatches } from './url-match';
export type { MatchMode } from './url-match';
export { importCsv } from './import-csv';
export type { CsvFormat, ImportedEntry } from './import-csv';
