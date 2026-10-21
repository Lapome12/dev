import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FIXTURES = join(import.meta.dirname, 'fixtures');
/** Mot de passe fictif des coffres de test (voir fixtures/generer-fixtures.sh). */
export const MDP_FIXTURE = 'essai-cadenas-2026';

export function readFixture(name: string): ArrayBuffer {
  return readArrayBuffer(join(FIXTURES, name));
}

/** Lit un fichier en ArrayBuffer (sans le tampon partagé de Node). */
export function readArrayBuffer(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export const hasKeepassxc = spawnSync('keepassxc-cli', ['--version']).status === 0;

/** Écrit un coffre dans un dossier temporaire et renvoie son chemin. */
export function writeTemp(data: ArrayBuffer, name = 'coffre.kdbx'): string {
  const dir = mkdtempSync(join(tmpdir(), 'cadenas-'));
  const path = join(dir, name);
  writeFileSync(path, new Uint8Array(data));
  return path;
}

/** Lance keepassxc-cli en lui passant le mot de passe sur l'entrée standard. */
export function keepassxc(args: string[], password: string, extraInput = ''): string {
  return execFileSync('keepassxc-cli', args, { input: `${password}\n${extraInput}`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}
