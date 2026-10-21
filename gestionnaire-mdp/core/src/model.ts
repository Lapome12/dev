// Modèle du coffre au-dessus de kdbxweb : groupes, entrées, historique, corbeille,
// champs personnalisés, tags et TOTP au format KeePassXC (champ « otp » = otpauth://…).
import * as kdbxweb from 'kdbxweb';
import { estimateStrength } from './strength';
import { base32Decode, buildOtpUri, type TotpAlgorithm } from './totp';
import {
  VaultError,
  type CustomField,
  type EntryDetail,
  type EntryInput,
  type EntrySummary,
  type GroupInfo,
  type Id,
} from './types';

/** Champs standard KeePass, gérés à part des champs personnalisés. */
const STANDARD_FIELDS = new Set(['Title', 'UserName', 'Password', 'URL', 'Notes']);
/** Champ TOTP de KeePassXC, KeePassDX et KeePassium. */
export const OTP_FIELD = 'otp';
/** Format TOTP natif de KeePass 2.47+ (lu, converti en `otp` à la modification). */
const KEEPASS_TOTP_PREFIX = 'TimeOtp-';

const isTechnicalField = (key: string) => key === OTP_FIELD || key.startsWith(KEEPASS_TOTP_PREFIX);

export function fieldText(entry: kdbxweb.KdbxEntry, key: string): string {
  const v = entry.fields.get(key);
  if (v === undefined) return '';
  return v instanceof kdbxweb.ProtectedValue ? v.getText() : v;
}

function setText(entry: kdbxweb.KdbxEntry, key: string, value: string, protect: boolean): void {
  entry.fields.set(key, protect ? kdbxweb.ProtectedValue.fromString(value) : value);
}

/** Recherche « à la française » : sans accents, sans casse. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr');
}

export function recycleBinId(db: kdbxweb.Kdbx): Id | null {
  return db.meta.recycleBinEnabled && db.meta.recycleBinUuid && !db.meta.recycleBinUuid.empty
    ? db.meta.recycleBinUuid.id
    : null;
}

export function root(db: kdbxweb.Kdbx): kdbxweb.KdbxGroup {
  const g = db.groups[0];
  if (!g) throw new VaultError('fichier-corrompu', 'Le coffre ne contient aucun groupe racine.');
  return g;
}

export function* allGroups(db: kdbxweb.Kdbx): Generator<kdbxweb.KdbxGroup> {
  yield* root(db).allGroups();
}

export function findGroup(db: kdbxweb.Kdbx, id: Id): kdbxweb.KdbxGroup {
  for (const g of allGroups(db)) if (g.uuid.id === id) return g;
  throw new VaultError('introuvable', 'Groupe introuvable.');
}

export function findEntry(db: kdbxweb.Kdbx, id: Id): kdbxweb.KdbxEntry {
  for (const e of root(db).allEntries()) if (e.uuid.id === id) return e;
  throw new VaultError('introuvable', 'Entrée introuvable.');
}

export function isInRecycleBin(db: kdbxweb.Kdbx, item: kdbxweb.KdbxEntry | kdbxweb.KdbxGroup): boolean {
  const bin = recycleBinId(db);
  if (!bin) return false;
  for (let g = item instanceof kdbxweb.KdbxGroup ? item : item.parentGroup; g; g = g.parentGroup) {
    if (g.uuid.id === bin) return true;
  }
  return false;
}

/** Entrées hors corbeille. */
export function* liveEntries(db: kdbxweb.Kdbx): Generator<kdbxweb.KdbxEntry> {
  for (const e of root(db).allEntries()) if (!isInRecycleBin(db, e)) yield e;
}

export function hasTotp(entry: kdbxweb.KdbxEntry): boolean {
  return fieldText(entry, OTP_FIELD) !== '' || fieldText(entry, 'TimeOtp-Secret-Base32') !== '';
}

/** Graine TOTP sous forme d'URI otpauth://, quel que soit le format d'origine. */
export function totpUri(entry: kdbxweb.KdbxEntry): string {
  const otp = fieldText(entry, OTP_FIELD).trim();
  if (otp) {
    // KeePassXC accepte aussi une graine Base32 brute dans « otp ».
    return otp.startsWith('otpauth://') ? otp : buildOtpUri({ secret: base32Decode(otp), algorithm: 'SHA-1', digits: 6, period: 30 });
  }
  const secret = fieldText(entry, 'TimeOtp-Secret-Base32').trim();
  if (!secret) throw new VaultError('introuvable', 'Cette entrée n’a pas de code TOTP.');
  const algo = fieldText(entry, 'TimeOtp-Algorithm').replace('HMAC-', '').replace('SHA-', 'SHA');
  const algorithm: TotpAlgorithm = algo === 'SHA256' ? 'SHA-256' : algo === 'SHA512' ? 'SHA-512' : 'SHA-1';
  const length = Number(fieldText(entry, 'TimeOtp-Length') || 6);
  const period = Number(fieldText(entry, 'TimeOtp-Period') || 30);
  return buildOtpUri({
    secret: base32Decode(secret),
    algorithm,
    digits: length === 7 || length === 8 ? length : 6,
    period: Number.isInteger(period) && period > 0 ? period : 30,
    account: fieldText(entry, 'UserName') || fieldText(entry, 'Title'),
  });
}

export function summarize(entry: kdbxweb.KdbxEntry): EntrySummary {
  return {
    id: entry.uuid.id,
    groupId: entry.parentGroup?.uuid.id ?? '',
    title: fieldText(entry, 'Title'),
    username: fieldText(entry, 'UserName'),
    url: fieldText(entry, 'URL'),
    tags: [...entry.tags],
    hasTotp: hasTotp(entry),
    modified: entry.times.lastModTime?.getTime() ?? 0,
  };
}

/** Champs personnalisés ; la valeur d'un champ protégé est masquée (lire via getSecret). */
export function customFields(entry: kdbxweb.KdbxEntry): CustomField[] {
  const out: CustomField[] = [];
  for (const [key, v] of entry.fields) {
    if (STANDARD_FIELDS.has(key) || isTechnicalField(key)) continue;
    const isProtected = v instanceof kdbxweb.ProtectedValue;
    out.push({ key, value: isProtected ? '' : v, protected: isProtected });
  }
  return out;
}

export function detail(entry: kdbxweb.KdbxEntry): EntryDetail {
  const password = fieldText(entry, 'Password');
  return {
    ...summarize(entry),
    notes: fieldText(entry, 'Notes'),
    fields: customFields(entry),
    created: entry.times.creationTime?.getTime() ?? 0,
    historyCount: entry.history.length,
    passwordStrength: password ? estimateStrength(password).score : 0,
  };
}

function cleanTags(tags: string[]): string[] {
  // KeePass sépare les tags par « ; » ou « , » : on les interdit dans un tag.
  return [...new Set(tags.map((t) => t.replace(/[;,:]/g, ' ').trim()).filter(Boolean))];
}

function validateInput(input: EntryInput): void {
  for (const f of input.fields) {
    if (!f.key.trim() || STANDARD_FIELDS.has(f.key) || isTechnicalField(f.key)) {
      throw new RangeError(`Nom de champ réservé ou vide : « ${f.key} ».`);
    }
  }
  if (new Set(input.fields.map((f) => f.key)).size !== input.fields.length) {
    throw new RangeError('Deux champs personnalisés portent le même nom.');
  }
}

/**
 * Écrit `input` dans l'entrée.
 * - `totpUri` : `undefined` = inchangé, `''` = supprimé, sinon remplace (au format KeePassXC).
 * - Champ protégé envoyé avec une valeur vide alors qu'il existe déjà : valeur conservée
 *   (EntryDetail ne contient jamais la valeur des champs protégés).
 */
export function writeEntry(entry: kdbxweb.KdbxEntry, input: EntryInput): void {
  validateInput(input);
  setText(entry, 'Title', input.title, false);
  setText(entry, 'UserName', input.username, false);
  setText(entry, 'Password', input.password, true);
  setText(entry, 'URL', input.url, false);
  setText(entry, 'Notes', input.notes, false);
  entry.tags = cleanTags(input.tags);

  const previous = new Map(entry.fields);
  for (const key of [...entry.fields.keys()]) {
    if (!STANDARD_FIELDS.has(key) && !isTechnicalField(key)) entry.fields.delete(key);
  }
  for (const f of input.fields) {
    const old = previous.get(f.key);
    if (f.protected && f.value === '' && old instanceof kdbxweb.ProtectedValue) {
      entry.fields.set(f.key, old);
    } else {
      setText(entry, f.key, f.value, f.protected);
    }
  }

  if (input.totpUri !== undefined) {
    for (const key of [...entry.fields.keys()]) if (isTechnicalField(key)) entry.fields.delete(key);
    if (input.totpUri.trim()) setText(entry, OTP_FIELD, input.totpUri.trim(), true);
  }
  entry.times.update();
}

export function groupInfo(db: kdbxweb.Kdbx, g: kdbxweb.KdbxGroup): GroupInfo {
  return {
    id: g.uuid.id,
    name: g.name ?? '',
    parentId: g.parentGroup?.uuid.id ?? null,
    isRecycleBin: g.uuid.id === recycleBinId(db),
  };
}

/** Termes de recherche : chaque mot doit apparaître dans le titre, l'identifiant, l'URL ou un tag. */
export function matchesQuery(entry: kdbxweb.KdbxEntry, query: string): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalize(
    [fieldText(entry, 'Title'), fieldText(entry, 'UserName'), fieldText(entry, 'URL'), ...entry.tags].join('\n'),
  );
  return terms.every((t) => haystack.includes(t));
}

/** URL de l'entrée et URL supplémentaires KeePassXC / KeePass2Android (KP2A_URL, KP2A_URL_1…). */
export function entryUrls(entry: kdbxweb.KdbxEntry): string[] {
  const urls = [fieldText(entry, 'URL')];
  for (const key of entry.fields.keys()) if (/^KP2A_URL(_\d+)?$/.test(key)) urls.push(fieldText(entry, key));
  return urls.filter((u) => u.trim() !== '');
}
