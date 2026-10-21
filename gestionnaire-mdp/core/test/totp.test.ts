import { describe, expect, it } from 'vitest';
import { totpNow } from '../src/index';
import { base32Decode, base32Encode, buildOtpUri, parseOtpUri } from '../src/totp';

// Vecteurs officiels de la RFC 6238, annexe B (codes à 8 chiffres, période 30 s).
const SEED1 = '12345678901234567890';
const SEED256 = '12345678901234567890123456789012';
const SEED512 = '1234567890123456789012345678901234567890123456789012345678901234';
const RFC6238: [number, string, string, string][] = [
  // [temps (s), SHA-1, SHA-256, SHA-512]
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

const uri = (seed: string, algo: string) =>
  `otpauth://totp/RFC:test?secret=${base32Encode(new TextEncoder().encode(seed))}&algorithm=${algo}&digits=8&period=30`;

describe('TOTP (RFC 6238)', () => {
  it.each(RFC6238)('t = %i s', async (t, sha1, sha256, sha512) => {
    expect((await totpNow(uri(SEED1, 'SHA1'), t * 1000)).code).toBe(sha1);
    expect((await totpNow(uri(SEED256, 'SHA256'), t * 1000)).code).toBe(sha256);
    expect((await totpNow(uri(SEED512, 'SHA512'), t * 1000)).code).toBe(sha512);
  });

  it('6 chiffres par défaut et secondes restantes', async () => {
    const r = await totpNow(`otpauth://totp/x?secret=${base32Encode(new TextEncoder().encode(SEED1))}`, 59_000);
    expect(r).toEqual({ code: '287082', period: 30, remaining: 1 });
  });

  it('lit une URI KeePassXC / Google Authenticator', () => {
    const p = parseOtpUri('otpauth://totp/Exemple%3Ademo%40exemple.fr?secret=jbsw y3dp-ehpk3pxp&issuer=Exemple&period=60&digits=6&algorithm=SHA256');
    expect(p).toMatchObject({ issuer: 'Exemple', account: 'demo@exemple.fr', period: 60, digits: 6, algorithm: 'SHA-256' });
    expect(base32Encode(p.secret)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('refuse les URI invalides', () => {
    expect(() => parseOtpUri('https://exemple.fr')).toThrow(TypeError);
    expect(() => parseOtpUri('otpauth://hotp/x?secret=JBSWY3DP')).toThrow(TypeError);
    expect(() => parseOtpUri('otpauth://totp/x?secret=')).toThrow(TypeError);
    expect(() => parseOtpUri('otpauth://totp/x?secret=JBSW1')).toThrow(TypeError);
    expect(() => parseOtpUri('otpauth://totp/x?secret=JBSWY3DP&digits=4')).toThrow(TypeError);
    expect(() => parseOtpUri('otpauth://totp/x?secret=JBSWY3DP&algorithm=MD5')).toThrow(TypeError);
  });

  it('Base32 aller-retour et URI reconstruite', async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    const u = buildOtpUri({ secret: new TextEncoder().encode(SEED1), algorithm: 'SHA-1', digits: 8, period: 30, issuer: 'RFC', account: 'test' });
    expect((await totpNow(u, 59_000)).code).toBe('94287082');
  });
});
