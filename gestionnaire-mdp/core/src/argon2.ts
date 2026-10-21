// Argon2 pour kdbxweb, fourni par hash-wasm (aucune crypto maison),
// et calibrage du coût de dérivation de la clé maître.
import * as kdbxweb from 'kdbxweb';
import { argon2d, argon2id } from 'hash-wasm';
import { VaultError, type KdfOptions } from './types';

/** Plancher de sécurité (PLAN §E) : jamais en dessous pour un coffre créé par Cadenas. */
export const KDF_MIN: Readonly<KdfOptions> = { memoryKiB: 64 * 1024, iterations: 3, parallelism: 2 };

/**
 * Plafond « compatible téléphone » (PLAN 3.7) : la mémoire reste à 64 Mio pour
 * que KeePassDX, KeePassium et la PWA ne manquent pas de mémoire, et les itérations
 * sont bornées pour garder le déverrouillage sous ~3 s sur un téléphone milieu de gamme.
 * Hypothèse : Argon2id WebAssembly à 64 Mio coûte ~100 ms par itération sur un PC récent
 * et ~350 ms sur un téléphone milieu de gamme, d'où 8 itérations ≈ 2,8 s au pire.
 */
export const KDF_MOBILE_MAX: Readonly<KdfOptions> = { memoryKiB: 64 * 1024, iterations: 8, parallelism: 2 };

/**
 * Limites acceptées à l'ouverture d'un fichier venu d'ailleurs : un en-tête piégé
 * (16 Gio de mémoire, des millions d'itérations) ne doit pas figer ni faire planter l'appli.
 */
const OPEN_MAX_MEMORY_KIB = 1024 * 1024; // 1 Gio
const OPEN_MAX_ITERATIONS = 1000;
const OPEN_MAX_PARALLELISM = 64;

const ARGON2_VERSION_13 = 0x13;

let installed = false;

/** Branche hash-wasm dans kdbxweb. Idempotent, appelé avant toute ouverture ou création. */
export function installArgon2(): void {
  if (installed) return;
  kdbxweb.CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, parallelism, type, version) => {
    // kdbxweb transmet la mémoire en Kio.
    if (version !== ARGON2_VERSION_13) {
      throw new VaultError('format-non-supporte', 'Version Argon2 1.0 non prise en charge.');
    }
    if (memory > OPEN_MAX_MEMORY_KIB || iterations > OPEN_MAX_ITERATIONS || parallelism > OPEN_MAX_PARALLELISM) {
      throw new VaultError('format-non-supporte', 'Paramètres Argon2 hors limites (coffre trop coûteux à ouvrir).');
    }
    const options = {
      password: new Uint8Array(password.slice(0)), // copie : on l'efface après usage sans toucher au tampon de kdbxweb
      salt: new Uint8Array(salt.slice(0)),
      memorySize: memory,
      iterations,
      parallelism,
      hashLength: length,
      outputType: 'binary' as const,
    };
    const out =
      type === kdbxweb.CryptoEngine.Argon2TypeArgon2id ? await argon2id(options) : await argon2d(options);
    options.password.fill(0);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  });
  installed = true;
}

/** Vérifie qu'un réglage demandé respecte le plancher de sécurité. */
export function assertKdfOptions(kdf: KdfOptions): void {
  const ok =
    Number.isInteger(kdf.memoryKiB) &&
    Number.isInteger(kdf.iterations) &&
    Number.isInteger(kdf.parallelism) &&
    kdf.memoryKiB >= KDF_MIN.memoryKiB &&
    kdf.memoryKiB <= OPEN_MAX_MEMORY_KIB &&
    kdf.iterations >= KDF_MIN.iterations &&
    kdf.iterations <= OPEN_MAX_ITERATIONS &&
    kdf.parallelism >= 1 &&
    kdf.parallelism <= OPEN_MAX_PARALLELISM;
  if (!ok) {
    throw new RangeError(
      `Réglage Argon2 refusé : au moins ${KDF_MIN.memoryKiB} Kio et ${KDF_MIN.iterations} itérations.`,
    );
  }
}

/** Applique Argon2id et les paramètres voulus à l'en-tête d'un coffre (sel neuf). */
export function applyKdf(db: kdbxweb.Kdbx, kdf: KdfOptions): void {
  assertKdfOptions(kdf);
  db.setKdf(kdbxweb.Consts.KdfId.Argon2id); // crée aussi un sel aléatoire de 32 octets
  const params = db.header.kdfParameters;
  if (!params) throw new Error('Paramètres KDF absents.');
  params.set('M', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(kdf.memoryKiB * 1024));
  params.set('I', kdbxweb.VarDictionary.ValueType.UInt64, kdbxweb.Int64.from(kdf.iterations));
  params.set('P', kdbxweb.VarDictionary.ValueType.UInt32, kdf.parallelism);
  params.set('V', kdbxweb.VarDictionary.ValueType.UInt32, ARGON2_VERSION_13);
}

/** Lit les paramètres Argon2 d'un coffre ouvert (null si le coffre utilise AES-KDF). */
export function readKdf(db: kdbxweb.Kdbx): (KdfOptions & { type: 'argon2id' | 'argon2d' }) | null {
  const params = db.header.kdfParameters;
  if (!params) return null;
  const uuid = params.get('$UUID');
  const id = uuid instanceof ArrayBuffer ? kdbxweb.ByteUtils.bytesToBase64(uuid) : undefined;
  const type =
    id === kdbxweb.Consts.KdfId.Argon2id ? 'argon2id' : id === kdbxweb.Consts.KdfId.Argon2d ? 'argon2d' : null;
  if (!type) return null;
  const num = (v: unknown): number => (v instanceof kdbxweb.Int64 ? v.value : typeof v === 'number' ? v : NaN);
  return {
    type,
    memoryKiB: num(params.get('M')) / 1024,
    iterations: num(params.get('I')),
    parallelism: num(params.get('P')),
  };
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Mesure la vitesse d'Argon2id sur cette machine et choisit le nombre d'itérations
 * pour viser `targetMs` (1 s par défaut), à 64 Mio et parallélisme 2.
 * Le résultat reste entre KDF_MIN et KDF_MOBILE_MAX pour que le coffre s'ouvre
 * en quelques secondes sur téléphone (KeePassDX, KeePassium, PWA).
 */
export async function calibrateKdf(targetMs = 1000): Promise<KdfOptions> {
  const { memoryKiB, parallelism } = KDF_MIN;
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  const run = (iterations: number) =>
    argon2id({ password: 'calibrage', salt, memorySize: memoryKiB, iterations, parallelism, hashLength: 32, outputType: 'binary' });

  await run(1); // compile le module WebAssembly et réserve la mémoire
  const t0 = now();
  await run(2);
  const perIteration = Math.max((now() - t0) / 2, 1);

  const wanted = Math.floor(targetMs / perIteration);
  const iterations = Math.min(Math.max(wanted, KDF_MIN.iterations), KDF_MOBILE_MAX.iterations);
  return { memoryKiB, iterations, parallelism };
}
