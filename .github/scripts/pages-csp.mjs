// Ajoute la CSP de Cadenas en <meta> à chaque page HTML d'un dossier (GitHub
// Pages ne permet pas d'en-têtes HTTP). Si une page a déjà une CSP, vérifie
// qu'elle est identique. Usage : node pages-csp.mjs <dossier>
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Celle des pages de l'extension (§E du PLAN.md), sans frame-ancestors (ignoré
// en <meta>), plus le manifeste et le service worker de la PWA.
export const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; img-src 'self' data:; " +
  "style-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; " +
  "base-uri 'none'; form-action 'none'";

const META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
const EXISTANTE = /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(["'])(.*?)\1[^>]*>/i;

function pagesHtml(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return pagesHtml(chemin);
    return nom.endsWith('.html') ? [chemin] : [];
  });
}

const dossier = process.argv[2];
if (!dossier) {
  console.error('Usage : node pages-csp.mjs <dossier>');
  process.exit(2);
}
const pages = pagesHtml(dossier);
if (pages.length === 0) {
  console.error(`Aucune page HTML dans ${dossier}`);
  process.exit(1);
}
let erreurs = 0;
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const trouvee = html.match(EXISTANTE);
  if (trouvee) {
    if (trouvee[2] !== CSP) {
      console.error(`${page} : CSP différente de celle attendue\n  trouvée : ${trouvee[2]}\n  attendue : ${CSP}`);
      erreurs++;
    } else console.log(`${page} : CSP déjà présente`);
    continue;
  }
  // La CSP doit précéder tout script ou feuille de style : juste après <head>.
  if (!/<head[^>]*>/i.test(html)) {
    console.error(`${page} : pas de <head>`);
    erreurs++;
    continue;
  }
  writeFileSync(page, html.replace(/<head[^>]*>/i, (tete) => `${tete}\n    ${META}`));
  console.log(`${page} : CSP ajoutée`);
}
process.exit(erreurs ? 1 : 0);
