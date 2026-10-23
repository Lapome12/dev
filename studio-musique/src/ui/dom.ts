// Petit utilitaire DOM de l'interface. Tout le texte passe par des nœuds texte, et aucun attribut
// style n'est écrit (CSP par empreintes) : les valeurs dynamiques passent par element.style (CSSOM).

export type Enfant = Node | string | number | false | null | undefined | Enfant[];
type Attributs = Record<string, string | number | boolean | null | undefined | EventListener>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attributs | null = null,
  ...enfants: Enfant[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [cle, val] of Object.entries(attrs)) {
      if (val === null || val === undefined || val === false) continue;
      if (cle === 'style') throw new Error('Attribut style interdit (CSP) : utilisez une classe ou element.style.');
      if (cle.startsWith('on') && typeof val === 'function') {
        el.addEventListener(cle.slice(2), val);
      } else if (cle === 'class') {
        el.className = String(val);
      } else {
        el.setAttribute(cle, val === true ? '' : String(val));
      }
    }
  }
  ajouter(el, enfants);
  return el;
}

export function ajouter(parent: Node, enfants: Enfant[]): void {
  for (const e of enfants) {
    if (e === null || e === undefined || e === false) continue;
    if (Array.isArray(e)) ajouter(parent, e);
    else parent.appendChild(typeof e === 'string' || typeof e === 'number' ? document.createTextNode(String(e)) : e);
  }
}

export function remplacer(parent: Element, ...enfants: Enfant[]): void {
  parent.replaceChildren();
  ajouter(parent, enfants);
}

const SVG = 'http://www.w3.org/2000/svg';
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [cle, val] of Object.entries(attrs)) el.setAttribute(cle, String(val));
  return el;
}

let compteur = 0;
export const idUnique = (prefixe = 'f'): string => `${prefixe}-${++compteur}`;

export const borner = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Lit un jeton de couleur de tokens.css (pour les dessins sur canvas). */
export function jeton(nom: string, racine: Element = document.documentElement): string {
  return getComputedStyle(racine).getPropertyValue(`--${nom}`).trim();
}

/** Prépare un canvas net sur écran haute densité ; renvoie le contexte mis à l'échelle. */
export function preparerCanvas(c: HTMLCanvasElement, largeur: number, hauteur: number): CanvasRenderingContext2D {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const l = Math.max(1, Math.round(largeur * dpr));
  const ht = Math.max(1, Math.round(hauteur * dpr));
  if (c.width !== l || c.height !== ht) { c.width = l; c.height = ht; }
  c.style.width = `${largeur}px`;
  c.style.height = `${hauteur}px`;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible.');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
