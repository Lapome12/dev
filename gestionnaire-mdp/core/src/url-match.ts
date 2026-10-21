// Correspondance entre l'URL enregistrée dans une entrée et la page où l'on veut remplir.
// Règle par défaut : origine exacte (schéma + hôte + port). C'est la parade au phishing
// (« paypa1.com », « exemple.fr.attaquant.com ») et aux sous-domaines hébergés par des tiers.
import { parse as parseDomain } from 'tldts';

export type MatchMode = 'strict' | 'sous-domaines';

const WEB_SCHEMES = new Set(['http:', 'https:']);

/**
 * Normalise une URL d'entrée. Les entrées KeePass contiennent souvent « exemple.fr »
 * sans schéma : on suppose alors https. Les hôtes IDN sont convertis en punycode par URL.
 */
export function parseEntryUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(withScheme);
    return WEB_SCHEMES.has(url.protocol) && url.hostname ? url : null;
  } catch {
    return null;
  }
}

function parsePageUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return WEB_SCHEMES.has(url.protocol) && url.hostname ? url : null;
  } catch {
    return null;
  }
}

const effectivePort = (u: URL): string => u.port || (u.protocol === 'https:' ? '443' : '80');

/** Hôte qui ne peut pas servir de base au mode sous-domaines : suffixe public (fr, co.uk, github.io) ou adresse IP. */
function isUnsafeBase(hostname: string): boolean {
  const r = parseDomain(hostname, { allowPrivateDomains: true });
  return r.isIp === true || r.domain === null || r.publicSuffix === hostname;
}

/**
 * `true` si l'entrée peut être remplie sur cette page.
 * - Le schéma doit être identique, sauf entrée en http et page en https (plus sûr) ;
 *   une entrée https n'est jamais remplie sur une page http.
 * - Le port effectif doit être identique.
 * - Mode strict : même hôte exactement. Mode sous-domaines : même hôte ou sous-domaine
 *   de l'hôte de l'entrée, si cet hôte n'est pas un suffixe public.
 */
export function originMatches(entryUrl: string, pageUrl: string, mode: MatchMode = 'strict'): boolean {
  const entry = parseEntryUrl(entryUrl);
  const page = parsePageUrl(pageUrl);
  if (!entry || !page) return false;
  if (entry.username || entry.password || page.username || page.password) return false;

  const schemeOk = entry.protocol === page.protocol || (entry.protocol === 'http:' && page.protocol === 'https:');
  if (!schemeOk) return false;
  const entryPort = entry.protocol === page.protocol ? effectivePort(entry) : entry.port || '443';
  if (entryPort !== effectivePort(page)) return false;

  const eh = entry.hostname.replace(/\.$/, '');
  const ph = page.hostname.replace(/\.$/, '');
  if (eh === ph) return true;
  if (mode !== 'sous-domaines') return false;
  return ph.endsWith(`.${eh}`) && !isUnsafeBase(eh);
}
