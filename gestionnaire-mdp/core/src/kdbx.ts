// Le coffre : création, ouverture et enregistrement au format KDBX 4 (kdbxweb).
// Chiffrement AES-256, dérivation Argon2id (hash-wasm), aucun algorithme écrit à la main.
import * as kdbxweb from 'kdbxweb';
import { applyKdf, assertKdfOptions, installArgon2, KDF_MIN } from './argon2';
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

function pending(step: string): never {
  throw new Error(`Non disponible avant l'étape ${step} de core.`);
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

  // Modèle (étape 2.1), santé (2.4), correspondance d'URL (2.3).
  listGroups(): GroupInfo[] { return pending('2.1'); }
  listEntries(_groupId?: Id): EntrySummary[] { return pending('2.1'); }
  search(_query: string): EntrySummary[] { return pending('2.1'); }
  getEntry(_id: Id): EntryDetail { return pending('2.1'); }
  getSecret(_id: Id, _kind: SecretKind): string { return pending('2.1'); }
  addEntry(_input: EntryInput): Id { return pending('2.1'); }
  updateEntry(_id: Id, _input: EntryInput): void { pending('2.1'); }
  deleteEntry(_id: Id): void { pending('2.1'); }
  addGroup(_name: string, _parentId: Id | null): Id { return pending('2.1'); }
  renameGroup(_id: Id, _name: string): void { pending('2.1'); }
  deleteGroup(_id: Id): void { pending('2.1'); }
  findForUrl(_pageUrl: string): EntrySummary[] { return pending('2.3'); }
  health(): HealthReport { return pending('2.4'); }
}
