// Étape 3.7 : un coffre écrit par Cadenas doit s'ouvrir sur téléphone, dans KeePassDX (Android)
// et KeePassium (iOS), en quelques secondes. Ce test relit l'en-tête KDBX octet par octet,
// sans passer par kdbxweb, et vérifie chaque valeur contre ce que ces applications acceptent :
//
// | En-tête              | Cadenas écrit         | KeePassDX            | KeePassium           |
// |----------------------|-----------------------|----------------------|----------------------|
// | Version              | 4.0                   | 3.1, 4.0, 4.1        | 3.1, 4.0, 4.1        |
// | Chiffrement          | AES-256-CBC           | AES, ChaCha20, Twofish | AES, ChaCha20, Twofish |
// | Compression          | GZip                  | aucune, GZip         | aucune, GZip         |
// | Dérivation de clé    | Argon2id v1.3         | AES-KDF, Argon2d/id  | AES-KDF, Argon2d/id  |
// | Mémoire Argon2       | 64 Mio                | limitée par la RAM   | limitée, surtout dans l'extension AutoFill d'iOS |
// | Flux interne         | ChaCha20 (id 3)       | Salsa20, ChaCha20    | Salsa20, ChaCha20    |
//
// La mémoire est le point sensible : l'extension de remplissage automatique d'iOS est
// limitée en mémoire, d'où le plafond de 64 Mio, et les itérations bornées gardent le
// déverrouillage sous ~3 s sur un téléphone milieu de gamme (voir KDF_MOBILE_MAX).
import { describe, expect, it } from 'vitest';
import { calibrateKdf, KDF_MIN, KDF_MOBILE_MAX, Vault } from '../src/index';

const MDP = 'Correct-Cheval-Pile-Agrafe-2026';

const UUID = {
  aes256: '31c1f2e6bf714350be5805216afc5aff',
  argon2id: '9e298b1956db4773b23dfc3ec6f0a1e6',
};

interface OuterHeader {
  major: number;
  minor: number;
  cipher: string;
  compression: number;
  kdf: Map<string, bigint | number | string>;
  ivLength: number;
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Lecture indépendante de l'en-tête externe KDBX 4 (champs TLV + dictionnaire de variantes du KDF). */
function readHeader(file: ArrayBuffer): OuterHeader {
  const v = new DataView(file);
  const bytes = new Uint8Array(file);
  expect(v.getUint32(0, true)).toBe(0x9aa2d903);
  expect(v.getUint32(4, true)).toBe(0xb54bfb67);
  const h: OuterHeader = { minor: v.getUint16(8, true), major: v.getUint16(10, true), cipher: '', compression: -1, kdf: new Map(), ivLength: 0 };
  let p = 12;
  for (;;) {
    const id = v.getUint8(p);
    const len = v.getUint32(p + 1, true);
    const data = bytes.subarray(p + 5, p + 5 + len);
    p += 5 + len;
    if (id === 0) break;
    if (id === 2) h.cipher = hex(data);
    if (id === 3) h.compression = new DataView(data.buffer, data.byteOffset).getUint32(0, true);
    if (id === 7) h.ivLength = len;
    if (id === 11) h.kdf = readVariantDictionary(data);
  }
  return h;
}

function readVariantDictionary(d: Uint8Array): Map<string, bigint | number | string> {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const out = new Map<string, bigint | number | string>();
  expect(v.getUint16(0, true) >> 8).toBe(1); // version 1.x
  let p = 2;
  for (;;) {
    const type = v.getUint8(p);
    if (type === 0) break;
    const nameLen = v.getUint32(p + 1, true);
    const name = new TextDecoder().decode(d.subarray(p + 5, p + 5 + nameLen));
    p += 5 + nameLen;
    const valueLen = v.getUint32(p, true);
    p += 4;
    const value =
      type === 0x04 ? v.getUint32(p, true) : type === 0x05 ? v.getBigUint64(p, true) : hex(d.subarray(p, p + valueLen));
    out.set(name, value);
    p += valueLen;
  }
  return out;
}

describe('Compatibilité téléphone (KeePassDX, KeePassium)', () => {
  it('l’en-tête d’un coffre Cadenas est dans ce que les applis mobiles acceptent', async () => {
    const vault = await Vault.create('Téléphone', MDP, undefined, await calibrateKdf());
    const h = readHeader(await vault.save());
    expect(`${h.major}.${h.minor}`).toBe('4.0');
    expect(h.cipher).toBe(UUID.aes256);
    expect(h.ivLength).toBe(16);
    expect(h.compression).toBe(1); // GZip
    expect(h.kdf.get('$UUID')).toBe(UUID.argon2id);
    expect(h.kdf.get('V')).toBe(0x13);
    expect(h.kdf.get('M')).toBe(BigInt(64 * 1024 * 1024));
    expect(h.kdf.get('P')).toBe(2);
    const iterations = Number(h.kdf.get('I'));
    expect(iterations).toBeGreaterThanOrEqual(KDF_MIN.iterations);
    expect(iterations).toBeLessThanOrEqual(KDF_MOBILE_MAX.iterations);
    expect((h.kdf.get('S') as string).length).toBe(64); // sel de 32 octets
  });

  it('reste en 4.0 après modifications (aucune fonction 4.1 imposée)', async () => {
    const vault = await Vault.create('Téléphone', MDP);
    const root = vault.listGroups().find((g) => g.parentId === null)!.id;
    const id = vault.addEntry({ groupId: root, title: 'T', username: 'u', password: 'p', url: 'https://exemple.fr', notes: '', tags: ['a'], fields: [] });
    vault.updateEntry(id, { groupId: root, title: 'T2', username: 'u', password: 'p2', url: 'https://exemple.fr', notes: '', tags: ['a', 'b'], fields: [] });
    vault.deleteEntry(id);
    const h = readHeader(await (await Vault.open(await vault.save(), MDP)).save());
    expect(`${h.major}.${h.minor}`).toBe('4.0');
  });

  it('le plafond garde ~3 s sur un téléphone 3,5 fois plus lent que ce PC de référence', () => {
    // Hypothèse documentée dans argon2.ts : ~100 ms par itération à 64 Mio sur PC, ~350 ms sur téléphone.
    expect(KDF_MOBILE_MAX.memoryKiB).toBe(64 * 1024);
    expect(KDF_MOBILE_MAX.iterations * 350).toBeLessThanOrEqual(3000);
  });
});
