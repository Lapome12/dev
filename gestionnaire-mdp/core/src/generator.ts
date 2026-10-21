// Générateur de mots de passe et de phrases de passe.
// Aléa : crypto.getRandomValues uniquement, avec rejet pour éviter le biais modulo.
import { EFF_WORDS } from './wordlist-eff';

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
}

export interface PassphraseOptions {
  words: number;
  separator: string;
  capitalize: boolean;
  addDigit: boolean;
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!#$%&()*+,-./:;<=>?@[]^_{|}~';
/** Caractères faciles à confondre à l'œil ou à la dictée. */
const AMBIGUOUS = new Set('Il1O0o|`\'"{}[]()/\;:.,');

const MAX_LENGTH = 1024;
const MAX_WORDS = 64;

/** Entier uniforme dans [0, n), sans biais modulo. */
export function randomInt(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new RangeError('Borne invalide.');
  if (n === 1) return 0;
  const limit = 2 ** 32 - (2 ** 32 % n); // on rejette les tirages au-delà du dernier multiple de n
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const x = buf[0]!;
    if (x < limit) return x % n;
  }
}

function pick(chars: string): string {
  return chars[randomInt(chars.length)]!;
}

/** Mélange de Fisher-Yates avec l'aléa cryptographique. */
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** Jeux de caractères retenus, après retrait des ambigus si demandé. */
export function charsets(o: Omit<PasswordOptions, 'length'>): string[] {
  const clean = (s: string) => (o.avoidAmbiguous ? [...s].filter((c) => !AMBIGUOUS.has(c)).join('') : s);
  const sets: string[] = [];
  if (o.lower) sets.push(clean(LOWER));
  if (o.upper) sets.push(clean(UPPER));
  if (o.digits) sets.push(clean(DIGITS));
  if (o.symbols) sets.push(clean(SYMBOLS));
  return sets;
}

/** Mot de passe aléatoire contenant au moins un caractère de chaque classe choisie. */
export function generatePassword(o: PasswordOptions): string {
  const sets = charsets(o);
  if (sets.length === 0) throw new RangeError('Choisissez au moins un type de caractères.');
  if (!Number.isInteger(o.length) || o.length < sets.length || o.length > MAX_LENGTH) {
    throw new RangeError(`Longueur entre ${sets.length} et ${MAX_LENGTH} caractères.`);
  }
  const all = sets.join('');
  const chars = sets.map(pick); // une de chaque classe
  while (chars.length < o.length) chars.push(pick(all));
  return shuffle(chars).join('');
}

/** Phrase de passe tirée de la liste EFF (12,9 bits par mot). */
export function generatePassphrase(o: PassphraseOptions): string {
  if (!Number.isInteger(o.words) || o.words < 1 || o.words > MAX_WORDS) {
    throw new RangeError(`Entre 1 et ${MAX_WORDS} mots.`);
  }
  const words = Array.from({ length: o.words }, () => {
    const w = EFF_WORDS[randomInt(EFF_WORDS.length)]!;
    return o.capitalize ? w[0]!.toUpperCase() + w.slice(1) : w;
  });
  if (o.addDigit) {
    const i = randomInt(words.length);
    words[i] = words[i]! + pick(DIGITS);
  }
  return words.join(o.separator);
}

/** Entropie théorique en bits, pour l'affichage dans le générateur. */
export function passwordEntropy(o: PasswordOptions): number {
  const size = charsets(o).join('').length;
  return size > 1 ? Math.floor(o.length * Math.log2(size)) : 0;
}

export function passphraseEntropy(o: PassphraseOptions): number {
  const perWord = Math.log2(EFF_WORDS.length);
  const digit = o.addDigit ? Math.log2(10) + Math.log2(o.words) : 0;
  return Math.floor(o.words * perWord + digit);
}
