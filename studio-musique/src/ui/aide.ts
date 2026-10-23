// Barre d'aide : survoler ou donner le focus à un élément portant data-aide affiche son texte en bas
// de l'écran. Pendant un réglage, les composants y publient la valeur courante.

type Ecouteur = (texte: string) => void;
const ecouteurs = new Set<Ecouteur>();
let courant = '';
let temporaire: string | null = null;

function publier(): void {
  const t = temporaire ?? courant;
  for (const e of ecouteurs) e(t);
}

export function surAide(fn: Ecouteur): () => void {
  ecouteurs.add(fn);
  fn(temporaire ?? courant);
  return () => ecouteurs.delete(fn);
}

/** Texte « de fond » (survol, focus). */
export function definirAide(texte: string): void {
  courant = texte;
  publier();
}

/** Texte prioritaire pendant un geste (valeur d'un bouton qu'on tourne) ; null pour le retirer. */
export function aideTemporaire(texte: string | null): void {
  temporaire = texte;
  publier();
}

/** Attache un texte d'aide à un élément. */
export function aide<T extends Element>(el: T, texte: string): T {
  el.setAttribute('data-aide', texte);
  return el;
}

let installe = false;
/** Écoute le document une seule fois : tout élément [data-aide] alimente la barre. */
export function installerAide(racine: Document = document): void {
  if (installe) return;
  installe = true;
  const lire = (cible: EventTarget | null): string => {
    const el = cible instanceof Element ? cible.closest('[data-aide]') : null;
    return el?.getAttribute('data-aide') ?? '';
  };
  racine.addEventListener('pointerover', e => definirAide(lire(e.target)));
  racine.addEventListener('focusin', e => definirAide(lire(e.target)));
}
