// Icônes maison en SVG (16×16, trait). Toutes dessinées pour Fréquence.

import { svg } from '../dom';

const TRACES = {
  lecture: 'M5 3.5v9l7.5-4.5z',
  pause: 'M5 3.5v9M11 3.5v9',
  arret: 'M4 4h8v8H4z',
  enregistrer: 'M8 3a5 5 0 1 0 0 10A5 5 0 1 0 8 3z',
  metronome: 'M6 2.5h4l2.5 11h-9zM8 11.5l3.5-7',
  annuler: 'M5.5 5.5H10a3.5 3.5 0 0 1 0 7H6M5.5 5.5 8 3M5.5 5.5 8 8',
  retablir: 'M10.5 5.5H6a3.5 3.5 0 0 0 0 7h4M10.5 5.5 8 3M10.5 5.5 8 8',
  menu: 'M2.5 4h11M2.5 8h11M2.5 12h11',
  plus: 'M8 3v10M3 8h10',
  moins: 'M3 8h10',
  fermer: 'M4 4l8 8M12 4l-8 8',
  crayon: 'M3 13l1-3.5 7-7 2.5 2.5-7 7zM9.5 4l2.5 2.5',
  gomme: 'M6.5 13 2.5 9l6-6 5 5-5 5zM5 6.5l5 5M6.5 13H13',
  selection: 'M3 3h3M10 3h3v3M13 10v3h-3M6 13H3v-3M3 6v0',
  decoupe: 'M5 11.5a1.5 1.5 0 1 0 0 .01M11 11.5a1.5 1.5 0 1 0 0 .01M6 10.5 11 3M10 10.5 5 3',
  aimant: 'M4 3v5a4 4 0 0 0 8 0V3M4 6h2.5M9.5 6H12M6.5 3v5a1.5 1.5 0 0 0 3 0V3',
  haut_parleur: 'M3 6h2.5L9 3v10L5.5 10H3zM11.5 5.5a3.5 3.5 0 0 1 0 5',
  muet: 'M3 6h2.5L9 3v10L5.5 10H3zM11 6l3 4M14 6l-3 4',
  casque: 'M3 10V8a5 5 0 0 1 10 0v2M3 10h2.5v3.5H3zM10.5 10H13v3.5h-2.5z',
  piano: 'M2.5 3h11v10h-11zM6 3v6M10 3v6M6 9v4M10 9v4',
  grille: 'M2.5 2.5h11v11h-11zM2.5 6.2h11M2.5 9.8h11M6.2 2.5v11M9.8 2.5v11',
  pistes: 'M2.5 4h7M2.5 8h11M2.5 12h5',
  console: 'M4 2.5v11M8 2.5v11M12 2.5v11M2.5 9h3M6.5 5h3M10.5 11h3',
  dossier: 'M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z',
  disquette: 'M3 3h8l2 2v8H3zM5.5 3v3h4V3M5 13V9.5h6V13',
  export: 'M8 2.5v8M5 5.5l3-3 3 3M3 10v3h10v-3',
  import: 'M8 10V2.5M5 7.5l3 3 3-3M3 10v3h10v-3',
  dupliquer: 'M5.5 5.5h7v7h-7zM3.5 10.5v-7h7',
  corbeille: 'M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5',
  bypass: 'M8 2.5v5M4.8 4.5a5 5 0 1 0 6.4 0',
  reglages: 'M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6M8.5 3v3M5.5 10v3',
  chevron_bas: 'M4 6l4 4 4-4',
  chevron_droite: 'M6 4l4 4-4 4',
  boucle: 'M4 6.5A3.5 3.5 0 0 1 7.5 3H11M9 1l2 2-2 2M12 9.5A3.5 3.5 0 0 1 8.5 13H5M7 15l-2-2 2-2',
  aide: 'M6 6a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2V10M8 12.5v.01',
  clavier: 'M2 4.5h12v7H2zM4.5 7h.01M7 7h.01M9.5 7h.01M12 7h.01M5 9.5h6',
  ecouter: 'M5 3.5v9l7.5-4.5z',
  note: 'M6 12a2 2 0 1 1-2-2 2 2 0 0 1 2 2V3.5l6-1.5v8.5a2 2 0 1 1-2-2 2 2 0 0 1 2 2',
  poignee: 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01',
} as const;

export type NomIcone = keyof typeof TRACES;

export function icone(nom: NomIcone): SVGSVGElement {
  const el = svg('svg', { viewBox: '0 0 16 16', class: `icone i-${nom}`, 'aria-hidden': 'true', focusable: 'false' });
  el.appendChild(svg('path', { d: TRACES[nom] }));
  return el;
}
