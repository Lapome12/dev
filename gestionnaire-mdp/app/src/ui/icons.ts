// Icônes SVG maison, trait 1,5 px en currentColor (PLAN §F). Tracés en coordonnées 24 × 24.

const TRACES = {
  cadenas: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/>',
  'cadenas-ouvert': '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/><path d="M12 14.5v2.5"/>',
  copier: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  oeil: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  'oeil-barre': '<path d="M4 4l16 16"/><path d="M9.9 6A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3 3.7M6.3 7.6A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1.1"/><path d="M10 10a3 3 0 0 0 4 4"/>',
  loupe: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  de: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle class="plein" cx="9" cy="9" r="1.1"/><circle class="plein" cx="15" cy="15" r="1.1"/><circle class="plein" cx="15" cy="9" r="1.1"/><circle class="plein" cx="9" cy="15" r="1.1"/>',
  pouls: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  puzzle: '<path d="M9.5 4.5a2 2 0 1 1 4 0V6H18v4.5h-1.5a2 2 0 1 0 0 4H18V19H6v-4.5h1.5a2 2 0 1 0 0-4H6V6h3.5Z"/>',
  soleil: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  lune: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>',
  dossier: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z"/>',
  tout: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  corbeille: '<path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 12.5h9l1-12.5"/>',
  fermer: '<path d="m6 6 12 12M18 6 6 18"/>',
  retour: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  crayon: '<path d="M4.5 19.5 5.5 15 15.5 5a2.1 2.1 0 0 1 3 3l-10 10Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  fichier: '<path d="M6.5 3.5h7l4 4v13h-11Z"/><path d="M13.5 3.5v4h4"/>',
  cle: '<circle cx="8" cy="15" r="3.5"/><path d="m10.5 12.5 8-8M16 7l2.5 2.5M14 9l2 2"/>',
  horloge: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5Z"/>',
  avertissement: '<path d="M12 4 21 19.5H3Z"/><path d="M12 10v4"/><circle class="plein" cx="12" cy="16.8" r=".9"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle class="plein" cx="12" cy="8" r=".9"/>',
  coche: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  reglages: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  telecharger: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  importer: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  enregistrer: '<path d="M5 4.5h11l3 3V19a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 19Z"/><path d="M8 4.5V9h7V4.5M8 19.5v-5h8v5"/>',
  partager: '<circle cx="17" cy="6" r="2.5"/><circle cx="7" cy="12" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="m9.2 10.8 5.6-3.6M9.2 13.2l5.6 3.6"/>',
  menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
  etiquette: '<path d="M4 4.5h7.5l8.5 8.5-7 7-8.5-8.5Z"/><circle cx="8.5" cy="9" r="1.3"/>',
  bouclier: '<path d="M12 3.5 19 6v5.5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
} as const;

export type NomIcone = keyof typeof TRACES;
export const NOMS_ICONES = Object.keys(TRACES) as NomIcone[];

const SVG = 'http://www.w3.org/2000/svg';
const gabarits = new Map<NomIcone, SVGSVGElement>();

/** Crée une icône décorative (aria-hidden). Les tracés sont des constantes du module, jamais des données. */
export function icone(nom: NomIcone, classe = ''): SVGSVGElement {
  let g = gabarits.get(nom);
  if (!g) {
    g = document.createElementNS(SVG, 'svg');
    g.setAttribute('viewBox', '0 0 24 24');
    g.setAttribute('aria-hidden', 'true');
    g.setAttribute('focusable', 'false');
    // Analyse via DOMParser en SVG : pas d'innerHTML sur un document HTML.
    const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG}">${TRACES[nom]}</svg>`, 'image/svg+xml');
    for (const n of Array.from(doc.documentElement.childNodes)) g.appendChild(document.importNode(n, true));
    gabarits.set(nom, g);
  }
  const svg = g.cloneNode(true) as SVGSVGElement;
  svg.setAttribute('class', classe ? `i ${classe}` : 'i');
  return svg;
}
