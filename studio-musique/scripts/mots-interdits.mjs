// Vérifie qu'aucun nom d'un logiciel existant n'apparaît dans le code de Fréquence (PLAN.md §A.1).
// Seul INSPIRATION.md (hors du dépôt) a le droit de les citer.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const ici = fileURLToPath(import.meta.url);
const motif = /fl[\s_-]*studio|fruity|image[\s_-]*line|sytrus|3x[\s_-]*osc|\bfpc\b|gross[\s_-]*beat|harmor|slicex/i;
const ignores = new Set(['node_modules', 'dist', 'playwright-report', 'test-results', '.git']);
const cibles = process.argv.slice(2).length ? process.argv.slice(2) : [racine];

const trouves = [];
function parcourir(chemin) {
  const nom = chemin.split(/[\\/]/).pop();
  if (ignores.has(nom) || chemin === ici) return;
  if (statSync(chemin).isDirectory()) { for (const f of readdirSync(chemin)) parcourir(join(chemin, f)); return; }
  if (nom === 'package-lock.json') return;
  readFileSync(chemin, 'utf8').split('\n').forEach((ligne, i) => {
    if (motif.test(ligne)) trouves.push(`${relative(racine, chemin)}:${i + 1}: ${ligne.trim().slice(0, 120)}`);
  });
}
for (const c of cibles) parcourir(c);
if (trouves.length) {
  console.error('Mots interdits trouvés (PLAN.md §A.1) :\n' + trouves.join('\n'));
  process.exit(1);
}
console.log('Aucun mot interdit.');
