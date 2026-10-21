// Le coffre : création, ouverture et enregistrement au format KDBX 4 (kdbxweb).
// Chiffrement AES-256, dérivation Argon2id (hash-wasm), aucun algorithme écrit à la main.
import * as kdbxweb from 'kdbxweb';
import { applyKdf, assertKdfOptions, installArgon2, KDF_MIN } from './argon2';
import { healthReport } from './health';
import {
  allGroups,
  detail,
  entryUrls,
  fieldText,
  findEntry,
  findGroup,
  groupInfo,
  hasTotp,
  isInRecycleBin,
  liveEntries,
  matchesQuery,
  OTP_FIELD,
  recycleBinId,
  root,
  summarize,
  totpUri,
  writeEntry,
} from './model';
import { totpNow, type TotpCode } from './totp';
import { originMatches } from './url-match';
import {
  VaultError,
  type EntryDetail,
  type EntryInput,
  type EntrySummary,
  type GroupInfo,
  type HealthReport,
  type Id,
  type KdfOptions,
  type SecretKind,
} from './types';

/** Taille maximale d'un fichier accepté à l'ouverture (un coffre KeePass dépasse rarement quelques Mio). */
const MAX_FILE_BYTES = 256 * 1024 * 1024;

/**
 * Nouveau fichier clé au format KeePass XML v2 (.keyx), 32 octets aléatoires avec somme
 * de contrôle : lisible par KeePassXC, KeePass 2, KeePassDX et KeePassium.
 */
export async function generateKeyFile(): Promise<Uint8Array> {
  return kdbxweb.KdbxCredentials.createRandomKeyFile(2);
}

function credentials(password: string, keyFile?: Uint8Array): kdbxweb.KdbxCredentials {
  return new kdbxweb.KdbxCredentials(kdbxweb.ProtectedValue.fromString(password), keyFile ?? null);
}

/** Traduit les erreurs de kdbxweb en codes du contrat. */
function toVaultError(err: unknown): VaultError {
  if (err instanceof VaultError) return err;
  if (err instanceof kdbxweb.KdbxError) {
    switch (err.code) {
      case kdbxweb.Consts.ErrorCodes.InvalidKey:
        return new VaultError('mauvais-mot-de-passe');
      case kdbxweb.Consts.ErrorCodes.BadSignature:
      case kdbxweb.Consts.ErrorCodes.InvalidVersion:
      case kdbxweb.Consts.ErrorCodes.Unsupported:
      case kdbxweb.Consts.ErrorCodes.NotImplemented:
        return new VaultError('format-non-supporte');
      default:
        return new VaultError('fichier-corrompu');
    }
  }
  return new VaultError('fichier-corrompu');
}

function wipe(value: kdbxweb.ProtectedValue | undefined): void {
  if (!value) return;
  value.value.fill(0);
  value.salt.fill(0);
}

function requireName(name: string): string {
  const n = name.trim();
  if (!n) throw new RangeError('Le nom ne peut pas être vide.');
  return n;
}

/** Applique les limites d'historique du coffre (10 versions par défaut, comme KeePass). */
function trimHistory(db: kdbxweb.Kdbx, entry: kdbxweb.KdbxEntry): void {
  const max = db.meta.historyMaxItems ?? 10;
  if (max >= 0 && entry.history.length > max) entry.removeHistory(0, entry.history.length - max);
}

export class Vault {
  #db: kdbxweb.Kdbx | null;

  private constructor(db: kdbxweb.Kdbx) {
    this.#db = db;
  }

  /** Coffre ouvert, ou erreur si `close()` a déjà été appelé. */
  protected get db(): kdbxweb.Kdbx {
    if (!this.#db) throw new Error('Coffre fermé.');
    return this.#db;
  }

  /**
   * Crée un coffre vide en KDBX 4.0 (lisible par KeePassXC, KeePass 2, KeePassDX,
   * KeePassium, Strongbox), avec corbeille. `kdf` doit respecter le plancher KDF_MIN ;
   * par défaut, utiliser `calibrateKdf()` avant d'appeler `create`.
   */
  static async create(name: string, password: string, keyFile?: Uint8Array, kdf: KdfOptions = KDF_MIN): Promise<Vault> {
    installArgon2();
    assertKdfOptions(kdf);
    const db = kdbxweb.Kdbx.create(credentials(password, keyFile), name);
    db.setVersion(4); // 4.0 : la version la plus largement prise en charge
    db.header.dataCipherUuid = new kdbxweb.KdbxUuid(kdbxweb.Consts.CipherId.Aes);
    applyKdf(db, kdf);
    db.meta.recycleBinEnabled = true;
    db.createRecycleBin();
    await db.credentials.ready;
    return new Vault(db);
  }

  /** Ouvre un fichier .kdbx (KDBX 3.1 ou 4.x, Argon2 ou AES-KDF). */
  static async open(file: ArrayBuffer, password: string, keyFile?: Uint8Array): Promise<Vault> {
    installArgon2();
    if (file.byteLength < 12 || file.byteLength > MAX_FILE_BYTES) {
      throw new VaultError(file.byteLength < 12 ? 'fichier-corrompu' : 'format-non-supporte');
    }
    const creds = credentials(password, keyFile);
    try {
      const db = await kdbxweb.Kdbx.load(file, creds);
      return new Vault(db);
    } catch (err) {
      wipe(creds.passwordHash);
      wipe(creds.keyFileHash);
      throw toVaultError(err);
    }
  }

  /**
   * Enregistre le coffre chiffré. La version du fichier est conservée : un coffre
   * créé par Cadenas reste en KDBX 4.0, un fichier 4.1 ouvert reste en 4.1.
   */
  async save(): Promise<ArrayBuffer> {
    return this.db.save();
  }

  get name(): string {
    return this.db.meta.name ?? '';
  }

  /** Version du fichier, par exemple « 4.0 ». */
  get formatVersion(): string {
    return `${this.db.versionMajor}.${this.db.versionMinor}`;
  }

  /** Change le mot de passe maître (et le fichier clé). Un nouveau sel est tiré au prochain `save()`. */
  async changeMasterKey(password: string, keyFile?: Uint8Array): Promise<void> {
    const old = this.db.credentials;
    const next = credentials(password, keyFile);
    await next.ready;
    this.db.credentials = next;
    wipe(old.passwordHash);
    wipe(old.keyFileHash);
  }

  /** Efface les références internes : le coffre n'est plus utilisable ensuite. */
  close(): void {
    if (!this.#db) return;
    wipe(this.#db.credentials.passwordHash);
    wipe(this.#db.credentials.keyFileHash);
    this.#db = null;
  }

  // ——— Groupes ———

  listGroups(): GroupInfo[] {
    return [...allGroups(this.db)].map((g) => groupInfo(this.db, g));
  }

  /** `parentId` null : directement sous la racine. */
  addGroup(name: string, parentId: Id | null): Id {
    const parent = parentId === null ? root(this.db) : findGroup(this.db, parentId);
    return this.db.createGroup(parent, requireName(name)).uuid.id;
  }

  renameGroup(id: Id, name: string): void {
    const g = findGroup(this.db, id);
    g.name = requireName(name);
    g.times.update();
  }

  /** Vers la corbeille, ou définitivement si le groupe y est déjà. La racine et la corbeille ne se suppriment pas. */
  deleteGroup(id: Id): void {
    const g = findGroup(this.db, id);
    if (g === root(this.db) || id === recycleBinId(this.db)) {
      throw new RangeError('Ce groupe ne peut pas être supprimé.');
    }
    if (isInRecycleBin(this.db, g)) this.db.move(g, null);
    else this.db.remove(g);
  }

  // ——— Entrées ———

  /** Entrées d'un groupe (sans ses sous-groupes) ; sans argument, toutes les entrées hors corbeille. */
  listEntries(groupId?: Id): EntrySummary[] {
    if (groupId === undefined) return [...liveEntries(this.db)].map(summarize);
    return findGroup(this.db, groupId).entries.map(summarize);
  }

  /** Titre, identifiant, URL et tags ; insensible à la casse et aux accents ; corbeille exclue. */
  search(query: string): EntrySummary[] {
    return [...liveEntries(this.db)].filter((e) => matchesQuery(e, query)).map(summarize);
  }

  getEntry(id: Id): EntryDetail {
    return detail(findEntry(this.db, id));
  }

  /**
   * Seul moyen d'obtenir un secret. `'totp'` est refusé (calcul asynchrone) : utiliser `getTotp`.
   * `{ field: 'otp' }` renvoie la graine otpauth:// (écran d'édition uniquement).
   */
  getSecret(id: Id, kind: SecretKind): string {
    const entry = findEntry(this.db, id);
    if (kind === 'password') return fieldText(entry, 'Password');
    if (kind === 'totp') throw new TypeError('Utiliser getTotp() pour le code TOTP.');
    if (kind.field === OTP_FIELD) return hasTotp(entry) ? totpUri(entry) : '';
    if (!entry.fields.has(kind.field)) throw new VaultError('introuvable', 'Champ introuvable.');
    return fieldText(entry, kind.field);
  }

  /** Code TOTP courant, calculé dans le coffre : la graine n'en sort pas. */
  async getTotp(id: Id, now: number = Date.now()): Promise<TotpCode> {
    return totpNow(totpUri(findEntry(this.db, id)), now);
  }

  addEntry(input: EntryInput): Id {
    const group = findGroup(this.db, input.groupId);
    const entry = this.db.createEntry(group);
    try {
      writeEntry(entry, input);
    } catch (err) {
      this.db.move(entry, null);
      throw err;
    }
    return entry.uuid.id;
  }

  /** Conserve la version précédente dans l'historique KDBX (limité par les réglages du coffre). */
  updateEntry(id: Id, input: EntryInput): void {
    const entry = findEntry(this.db, id);
    const target = findGroup(this.db, input.groupId);
    entry.pushHistory();
    try {
      writeEntry(entry, input);
    } catch (err) {
      entry.removeHistory(entry.history.length - 1);
      throw err;
    }
    if (entry.parentGroup !== target) this.db.move(entry, target);
    trimHistory(this.db, entry);
  }

  /** Vers la corbeille ; définitif si l'entrée y est déjà. */
  deleteEntry(id: Id): void {
    const entry = findEntry(this.db, id);
    if (isInRecycleBin(this.db, entry)) this.db.move(entry, null);
    else this.db.remove(entry);
  }

  /** Entrées remplissables sur cette page : origine exacte, URL principale ou KP2A_URL*. */
  findForUrl(pageUrl: string): EntrySummary[] {
    return [...liveEntries(this.db)]
      .filter((e) => entryUrls(e).some((u) => originMatches(u, pageUrl, 'strict')))
      .map(summarize);
  }

  health(now?: number): HealthReport {
    return healthReport(this.db, now);
  }
}
