// Codes TOTP (RFC 6238) à partir d'une URI otpauth:// (format KeePassXC, Google Authenticator…).
// Le HMAC est calculé par WebCrypto : aucune primitive cryptographique écrite ici.

export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export interface TotpParams {
  secret: Uint8Array;
  algorithm: TotpAlgorithm;
  digits: 6 | 7 | 8;
  period: number; // secondes
  issuer?: string;
  account?: string;
}

export interface TotpCode {
  code: string;
  period: number;
  remaining: number; // secondes avant le prochain code
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Décode du Base32 (RFC 4648), en tolérant espaces, tirets, minuscules et « = » final. */
export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const c of clean) {
    const v = BASE32.indexOf(c);
    if (v < 0) throw new TypeError('Secret TOTP invalide (Base32 attendu).');
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32[(value >>> bits) & 31];
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

const ALGORITHMS: Record<string, TotpAlgorithm> = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512',
};

/** Lit une URI `otpauth://totp/...`. Lève une TypeError si elle est invalide. */
export function parseOtpUri(uri: string): TotpParams {
  let url: URL;
  try {
    url = new URL(uri.trim());
  } catch {
    throw new TypeError('URI TOTP invalide.');
  }
  if (url.protocol !== 'otpauth:' || url.host.toLowerCase() !== 'totp') {
    throw new TypeError('Seules les URI otpauth://totp sont prises en charge.');
  }
  const q = url.searchParams;
  const secret = base32Decode(q.get('secret') ?? '');
  if (secret.length === 0) throw new TypeError('Secret TOTP manquant.');
  const algorithm = ALGORITHMS[(q.get('algorithm') ?? 'SHA1').toUpperCase().replace('-', '')];
  if (!algorithm) throw new TypeError('Algorithme TOTP non pris en charge.');
  const digits = Number(q.get('digits') ?? 6);
  if (digits !== 6 && digits !== 7 && digits !== 8) throw new TypeError('Le code TOTP doit faire 6, 7 ou 8 chiffres.');
  const period = Number(q.get('period') ?? 30);
  if (!Number.isInteger(period) || period < 1 || period > 3600) throw new TypeError('Période TOTP invalide.');

  const params: TotpParams = { secret, algorithm, digits, period };
  const label = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const [labelIssuer, account] = label.includes(':') ? label.split(/:(.*)/s) : [undefined, label];
  const issuer = q.get('issuer') ?? labelIssuer;
  if (issuer) params.issuer = issuer;
  if (account) params.account = account.trim();
  return params;
}

/** Construit une URI otpauth:// (utilisé pour convertir le format natif de KeePass 2). */
export function buildOtpUri(p: Omit<TotpParams, 'issuer' | 'account'> & { issuer?: string; account?: string }): string {
  const label = encodeURIComponent(p.issuer ? `${p.issuer}:${p.account ?? ''}` : (p.account ?? 'Cadenas'));
  const q = new URLSearchParams({ secret: base32Encode(p.secret), period: String(p.period), digits: String(p.digits), algorithm: p.algorithm.replace('-', '') });
  if (p.issuer) q.set('issuer', p.issuer);
  return `otpauth://totp/${label}?${q.toString()}`;
}

/** HOTP (RFC 4226) avec HMAC WebCrypto et troncature dynamique. */
export async function hotp(p: Pick<TotpParams, 'secret' | 'algorithm' | 'digits'>, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', p.secret as BufferSource, { name: 'HMAC', hash: p.algorithm }, false, ['sign']);
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(0, Math.floor(counter / 2 ** 32));
  msg.setUint32(4, counter >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg.buffer));
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** p.digits).padStart(p.digits, '0');
}

/** Code TOTP courant (ou à l'instant `now`, en ms) et secondes restantes. */
export async function totpNow(uri: string, now: number = Date.now()): Promise<TotpCode> {
  const p = parseOtpUri(uri);
  const seconds = Math.floor(now / 1000);
  const code = await hotp(p, Math.floor(seconds / p.period));
  return { code, period: p.period, remaining: p.period - (seconds % p.period) };
}
