// Import des exports CSV de Bitwarden, Chrome / Opera / Edge et KeePassXC.
// Rien n'est écrit ici : on renvoie des EntryInput que l'interface ajoute au coffre.
import { base32Decode, buildOtpUri, parseOtpUri } from './totp';
import type { CustomField, EntryInput } from './types';

export type CsvFormat = 'bitwarden' | 'chrome' | 'keepassxc';

/** EntryInput + chemin du dossier d'origine (« Banque/Pro »), à convertir en groupe par l'appelant. */
export interface ImportedEntry extends EntryInput {
  groupPath: string;
}

const MAX_CSV_BYTES = 50 * 1024 * 1024;

/** Lecture CSV RFC 4180 : guillemets, guillemets doublés, retours à la ligne dans un champ, BOM, CRLF. */
export function parseCsv(text: string): string[][] {
  if (text.length > MAX_CSV_BYTES) throw new RangeError('Fichier CSV trop volumineux.');
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (quoted) throw new SyntaxError('CSV invalide : guillemet non fermé.');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

type Row = Record<string, string>;

function toRecords(text: string, required: string[]): Row[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  for (const r of required) {
    if (!keys.includes(r)) throw new SyntaxError(`Colonne « ${r} » absente : ce n'est pas le format attendu.`);
  }
  return rows.map((cells) => Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? ''])));
}

/** Une graine TOTP peut être une URI otpauth:// ou du Base32 brut. */
function normalizeTotp(raw: string, account: string): string | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  try {
    if (v.startsWith('otpauth://')) {
      parseOtpUri(v);
      return v;
    }
    return buildOtpUri({ secret: base32Decode(v), algorithm: 'SHA-1', digits: 6, period: 30, account });
  } catch {
    return undefined; // graine illisible (Steam, format inconnu) : l'entrée est importée sans TOTP
  }
}

function base(o: Partial<ImportedEntry>): ImportedEntry {
  return { groupId: '', groupPath: '', title: '', username: '', password: '', url: '', notes: '', tags: [], fields: [], ...o };
}

function bitwarden(text: string): ImportedEntry[] {
  return toRecords(text, ['name', 'login_username', 'login_password']).map((r) => {
    const fields: CustomField[] = [];
    for (const line of (r['fields'] ?? '').split(/\r?\n/)) {
      const m = /^([^:]+):\s?(.*)$/.exec(line);
      if (m && m[1]!.trim()) fields.push({ key: m[1]!.trim(), value: m[2] ?? '', protected: false });
    }
    const uris = (r['login_uri'] ?? '').split(',').map((u) => u.trim()).filter(Boolean);
    uris.slice(1).forEach((u, i) => fields.push({ key: i === 0 ? 'KP2A_URL' : `KP2A_URL_${i}`, value: u, protected: false }));
    const entry = base({
      groupPath: r['folder'] ?? '',
      title: r['name'] ?? '',
      username: r['login_username'] ?? '',
      password: r['login_password'] ?? '',
      url: uris[0] ?? '',
      notes: r['notes'] ?? '',
      tags: r['favorite'] === '1' ? ['favori'] : [],
      fields: dedupe(fields),
    });
    const totp = normalizeTotp(r['login_totp'] ?? '', entry.username);
    if (totp) entry.totpUri = totp;
    return entry;
  });
}

function chrome(text: string): ImportedEntry[] {
  return toRecords(text, ['url', 'username', 'password']).map((r) =>
    base({
      title: r['name'] || hostOf(r['url'] ?? ''),
      username: r['username'] ?? '',
      password: r['password'] ?? '',
      url: r['url'] ?? '',
      notes: r['note'] ?? r['notes'] ?? '',
    }),
  );
}

function keepassxc(text: string): ImportedEntry[] {
  return toRecords(text, ['group', 'title', 'username', 'password']).map((r) => {
    // La première partie du chemin est la racine du coffre d'origine.
    const path = (r['group'] ?? '').split('/').slice(1).join('/');
    const entry = base({
      groupPath: path,
      title: r['title'] ?? '',
      username: r['username'] ?? '',
      password: r['password'] ?? '',
      url: r['url'] ?? '',
      notes: r['notes'] ?? '',
    });
    const totp = normalizeTotp(r['totp'] ?? '', entry.username);
    if (totp) entry.totpUri = totp;
    return entry;
  });
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function dedupe(fields: CustomField[]): CustomField[] {
  const seen = new Map<string, number>();
  return fields.map((f) => {
    const n = seen.get(f.key) ?? 0;
    seen.set(f.key, n + 1);
    return n === 0 ? f : { ...f, key: `${f.key} (${n + 1})` };
  });
}

/** Champs réservés par KeePass : un champ importé portant ce nom est renommé. */
const RESERVED = /^(Title|UserName|Password|URL|Notes|otp|TimeOtp-.*)$/;

export function importCsv(csv: string, format: CsvFormat): ImportedEntry[] {
  const parsers = { bitwarden, chrome, keepassxc } as const;
  const parser = parsers[format];
  if (!parser) throw new RangeError('Format d’import inconnu.');
  return parser(csv).map((e) => ({
    ...e,
    fields: e.fields.map((f) => (RESERVED.test(f.key) ? { ...f, key: `${f.key} (importé)` } : f)),
  }));
}
