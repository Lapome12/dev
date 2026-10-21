// Petit utilitaire DOM. Tout le texte passe par des nœuds texte : aucune donnée du coffre n'est
// jamais interprétée comme du HTML, et aucun attribut style n'est écrit (CSP style-src 'self').

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
      if (cle === 'style') throw new Error('Attribut style interdit (CSP) : utilisez une classe.');
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

export function q<T extends Element = HTMLElement>(sel: string, racine: ParentNode = document): T {
  const el = racine.querySelector<T>(sel);
  if (!el) throw new Error(`Élément introuvable : ${sel}`);
  return el;
}

let compteur = 0;
export const idUnique = (prefixe = 'c'): string => `${prefixe}-${++compteur}`;

export const sansAccents = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function hote(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

export const dateFr = (t: number): string =>
  new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
