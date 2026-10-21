import { argon2d, argon2id } from 'hash-wasm';
import { describe, expect, it } from 'vitest';
import { calibrateKdf, KDF_MIN, KDF_MOBILE_MAX } from '../src/index';
import { installArgon2 } from '../src/argon2';
import * as kdbxweb from 'kdbxweb';

describe('Argon2 (hash-wasm branché dans kdbxweb)', () => {
  // Valeurs attendues calculées avec la bibliothèque de référence libargon2
  // (phc-winner-argon2, via argon2-cffi) : mot de passe « password », sel « somesalt », v=0x13.
  it('concorde avec libargon2 (Argon2id et Argon2d)', async () => {
    const base = { password: 'password', salt: 'somesalt', iterations: 2, parallelism: 1, hashLength: 32, outputType: 'hex' } as const;
    expect(await argon2id({ ...base, memorySize: 65536 })).toBe('09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7');
    expect(await argon2id({ ...base, memorySize: 64 })).toBe('16a1a498734609dd01456da406de9f3d9da93e6c86c300a12fc1465214ce4922');
    expect(await argon2d({ ...base, memorySize: 64 })).toBe('f920d95538648465abeeba6ae06ea532ed26df314aff60150237d8fe116f62cd');
  });

  it('kdbxweb utilise bien hash-wasm', async () => {
    installArgon2();
    const enc = new TextEncoder();
    const out = await kdbxweb.CryptoEngine.argon2(enc.encode('password').buffer as ArrayBuffer, enc.encode('somesalt').buffer as ArrayBuffer, 65536, 2, 32, 1, kdbxweb.CryptoEngine.Argon2TypeArgon2id, 0x13);
    expect(kdbxweb.ByteUtils.bytesToHex(out)).toBe('09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7');
  });

  it('refuse Argon2 version 1.0 et les paramètres démesurés', async () => {
    installArgon2();
    const b = new Uint8Array(32).buffer as ArrayBuffer;
    await expect(kdbxweb.CryptoEngine.argon2(b, b, 65536, 3, 32, 2, 2, 0x10)).rejects.toMatchObject({ code: 'format-non-supporte' });
    await expect(kdbxweb.CryptoEngine.argon2(b, b, 4 * 1024 * 1024, 3, 32, 2, 2, 0x13)).rejects.toMatchObject({ code: 'format-non-supporte' });
  });
});

describe('calibrateKdf', () => {
  it('ne descend jamais sous le plancher de sécurité', async () => {
    expect(await calibrateKdf(1)).toEqual(KDF_MIN);
  });

  it('plafonne pour rester ouvrable sur téléphone', async () => {
    const kdf = await calibrateKdf(1_000_000);
    expect(kdf).toEqual(KDF_MOBILE_MAX);
  });

  it('vise environ 1 s par défaut, entre le plancher et le plafond', async () => {
    const kdf = await calibrateKdf();
    expect(kdf.memoryKiB).toBe(64 * 1024);
    expect(kdf.parallelism).toBe(2);
    expect(kdf.iterations).toBeGreaterThanOrEqual(KDF_MIN.iterations);
    expect(kdf.iterations).toBeLessThanOrEqual(KDF_MOBILE_MAX.iterations);
  });
});
