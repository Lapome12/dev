// Santé du coffre : mots de passe faibles, réutilisés, anciens ou absents.
import type * as kdbxweb from 'kdbxweb';
import { estimateStrength } from './strength';
import { fieldText, liveEntries } from './model';
import type { HealthReport, Id } from './types';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** Score zxcvbn en dessous duquel un mot de passe est signalé comme faible. */
export const WEAK_BELOW = 3;

/** Date à laquelle le mot de passe actuel a été choisi, d'après l'historique KDBX. */
function passwordSince(entry: kdbxweb.KdbxEntry): number {
  const current = fieldText(entry, 'Password');
  let since = entry.times.lastModTime?.getTime() ?? 0;
  for (let i = entry.history.length - 1; i >= 0; i--) {
    const h = entry.history[i]!;
    if (fieldText(h, 'Password') !== current) break;
    since = h.times.lastModTime?.getTime() ?? since;
  }
  return since || (entry.times.creationTime?.getTime() ?? 0);
}

/**
 * Bilan des entrées hors corbeille. Les entrées marquées « exclure des rapports »
 * dans KeePassXC (qualityCheck = false) sont ignorées.
 * `score` : pourcentage d'entrées sans aucun problème (100 si le coffre est vide).
 */
export function healthReport(db: kdbxweb.Kdbx, now = Date.now()): HealthReport {
  const weak: Id[] = [];
  const old: Id[] = [];
  const withoutPassword: Id[] = [];
  const byPassword = new Map<string, Id[]>();
  let total = 0;

  for (const entry of liveEntries(db)) {
    if (entry.qualityCheck === false) continue;
    total++;
    const id = entry.uuid.id;
    const pw = fieldText(entry, 'Password');
    if (!pw) {
      withoutPassword.push(id);
      continue;
    }
    if (estimateStrength(pw).score < WEAK_BELOW) weak.push(id);
    if (now - passwordSince(entry) > YEAR_MS) old.push(id);
    const same = byPassword.get(pw);
    if (same) same.push(id);
    else byPassword.set(pw, [id]);
  }

  const reused = [...byPassword.values()].filter((ids) => ids.length > 1);
  const flagged = new Set([...weak, ...old, ...withoutPassword, ...reused.flat()]);
  const score = total === 0 ? 100 : Math.round((100 * (total - flagged.size)) / total);
  return { weak, reused, old, withoutPassword, score };
}
