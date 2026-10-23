// Catalogue des composants de l'interface (étape 1.3) : chaque composant dans ses variantes.
// Ouvrir avec `npm run dev` puis /src/ui/catalogue.html.

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/catalogue.css';
import { aide } from './aide';
import { installerBulles } from './components/bulle';
import { bouton } from './components/button';
import { confirmer, demanderTexte, dialogue } from './components/dialog';
import { fader } from './components/fader';
import { icone, type NomIcone } from './components/icons';
import { boutonRotatif } from './components/knob';
import { boutonMenu, ouvrirMenu } from './components/menu';
import { vuMetre } from './components/meter';
import { champNombre } from './components/number';
import { liste } from './components/select';
import { toast } from './components/toast';
import { interrupteur } from './components/toggle';
import { formaterPan, formaterVolume, volumeDepuisNorme, volumeVersNorme } from './components/valeur';
import { h } from './dom';
import { barreAide } from './views/help-bar';

installerBulles();
const racine = document.getElementById('catalogue');
if (!racine) throw new Error('#catalogue introuvable');

const section = (titre: string, ...contenu: HTMLElement[]) =>
  h('section', { class: 'cat-section' }, h('h2', null, titre), h('div', { class: 'cat-rangee' }, ...contenu));
const legende = (texte: string, el: HTMLElement) => h('figure', { class: 'cat-fig' }, el, h('figcaption', null, texte));

// --- Couleurs ---
const couleurs = ['fond', 'panneau', 'releve', 'filet', 'texte', 'texte-doux', 'accent', 'lecture', 'alerte'];
const nuancier = couleurs.map(c => {
  const p = h('span', { class: 'cat-nuance' });
  p.style.background = `var(--${c})`;
  return legende(`--${c}`, p);
});
const canaux = Array.from({ length: 12 }, (_, i) => {
  const p = h('span', { class: 'cat-nuance petite' });
  p.style.background = `var(--canal-${i + 1})`;
  return legende(String(i + 1), p);
});

// --- Boutons ---
const boutons = [
  bouton({ texte: 'Principal', variante: 'principal', aide: 'Bouton principal d\'une boîte de dialogue.' }),
  bouton({ texte: 'Normal', icone: 'plus', aide: 'Bouton ordinaire avec icône.' }),
  bouton({ texte: 'Discret', variante: 'discret' }),
  bouton({ texte: 'Supprimer', variante: 'danger', icone: 'corbeille' }),
  bouton({ icone: 'lecture', libelle: 'Lecture', raccourci: 'Espace', aide: 'Lance ou arrête la lecture.' }),
  bouton({ texte: 'Désactivé', desactive: true }),
];
const outils = (['crayon', 'gomme', 'selection', 'decoupe'] as NomIcone[]).map((n, i) => {
  const b = bouton({ icone: n, libelle: ['Crayon', 'Gomme', 'Sélection', 'Découpe'][i] ?? n, variante: 'outil', raccourci: ['B', 'E', 'S', 'C'][i] ?? '' });
  b.setAttribute('aria-pressed', String(i === 0));
  return b;
});

// --- Interrupteurs ---
const inters = [
  interrupteur({ libelle: 'Muet', texte: 'M', variante: 'mute', actif: true, aide: 'Coupe le son de ce canal.' }).el,
  interrupteur({ libelle: 'Solo', texte: 'S', variante: 'solo', actif: false, aide: 'N\'écoute que ce canal.' }).el,
  interrupteur({ libelle: 'Métronome', variante: 'temoin', texte: 'Métronome', actif: true }).el,
  interrupteur({ libelle: 'Boucle', icone: 'boucle', actif: false }).el,
];

// --- Réglages ---
const rotatifs = [
  boutonRotatif({ libelle: 'Coupure', min: 20, max: 20000, curve: 'log', defaut: 2000, valeur: 1200, unite: 'Hz', aide: 'fréquence de coupure du filtre.' }).el,
  boutonRotatif({ libelle: 'Résonance', min: 0, max: 100, step: 1, defaut: 10, valeur: 35, unite: '%' }).el,
  boutonRotatif({ libelle: 'Attaque', min: 1, max: 5000, curve: 'log', defaut: 5, valeur: 40, unite: 'ms', taille: 'grand' }).el,
  boutonRotatif({ libelle: 'Pan', min: -1, max: 1, step: 0.01, defaut: 0, valeur: -0.3, bipolaire: true, format: formaterPan }).el,
  boutonRotatif({ libelle: 'Désaccord', min: -100, max: 100, step: 1, defaut: 0, valeur: 7, unite: 'cents', bipolaire: true, taille: 'petit', couleur: 'var(--canal-5)' }).el,
  boutonRotatif({ libelle: 'Volume', min: 0, max: 1.25, defaut: 0.8, valeur: 0.8, format: formaterVolume, taille: 'mini' }).el,
  boutonRotatif({ libelle: 'Désactivé', min: 0, max: 1, defaut: 0.5, valeur: 0.5, desactive: true }).el,
];
const champs = [
  legende('Tempo', champNombre({ libelle: 'Tempo', min: 40, max: 300, step: 0.1, defaut: 130, valeur: 130, format: v => v.toFixed(v % 1 ? 1 : 0).replace('.', ','), aide: 'glisser, molette ou double-clic pour taper.' }).el),
  legende('Swing', champNombre({ libelle: 'Swing', min: 0, max: 100, step: 1, defaut: 0, valeur: 20, unite: '%', largeur: 'etroit' }).el),
  legende('Transposition', champNombre({ libelle: 'Transposition', min: -12, max: 12, step: 1, defaut: 0, valeur: 0, format: v => (v > 0 ? `+${v}` : String(v)) }).el),
];
const choix = [
  liste({ libelle: 'Forme d\'onde', etiquetteVisible: true, valeur: 'scie', options: [
    { value: 'sinus', label: 'Sinus' }, { value: 'triangle', label: 'Triangle' }, { value: 'scie', label: 'Dent de scie' }, { value: 'carre', label: 'Carré' }, { value: 'bruit', label: 'Bruit' },
  ] }).el,
  liste({ libelle: 'Tranche de console', etiquetteVisible: true, valeur: '1', options: Array.from({ length: 13 }, (_, i) => ({ value: String(i), label: i ? `Tranche ${i}` : 'Maître' })) }).el,
];

// --- Console : faders et vu-mètres animés ---
const metres = [vuMetre({ libelle: 'Niveau tranche 1' }), vuMetre({ libelle: 'Niveau maître' })];
const tranches = metres.map((m, i) => h('div', { class: 'cat-tranche' },
  m.el,
  fader({ libelle: i ? 'Volume maître' : 'Volume tranche 1', min: 0, max: 1.25, defaut: 1, valeur: i ? 1 : 0.7, reperes: [1], versNorme: volumeVersNorme, depuisNorme: volumeDepuisNorme, format: formaterVolume }).el));
let t = 0;
const animer = () => {
  t += 1 / 60;
  metres.forEach((m, i) => {
    const base = 0.35 + 0.3 * Math.abs(Math.sin(t * (1.7 + i)));
    const coup = (t * 2) % 1 < 0.08 ? 0.5 + i * 0.4 : 0;
    m.maj(base + coup, base * 0.9 + coup, Math.min(1.3, base + coup + 0.05));
  });
  requestAnimationFrame(animer);
};
requestAnimationFrame(animer);

// --- Menus, dialogues, toasts ---
const menuBtn = boutonMenu(bouton({ texte: 'Projet', icone: 'menu' }), () => [
  { titre: 'Fichier' },
  { texte: 'Nouveau…', raccourci: 'Ctrl+N', action: () => toast('Nouveau projet') },
  { texte: 'Ouvrir…', raccourci: 'Ctrl+O', action: () => toast('Ouvrir') },
  { texte: 'Enregistrer', raccourci: 'Ctrl+S', action: () => toast('Projet enregistré', 'ok') },
  { separateur: true },
  { texte: 'Métronome', coche: true, action: () => toast('Métronome') },
  { texte: 'Exporter en WAV…', raccourci: 'Ctrl+E', action: () => toast('Export') },
  { texte: 'Indisponible', desactive: true, action: () => undefined },
  { separateur: true },
  { texte: 'Tout effacer', danger: true, action: () => toast('Effacé', 'alerte') },
]);
const zoneContexte = aide(h('div', { class: 'cat-contexte', tabindex: 0 }, 'Clic droit ici'), 'Zone de démonstration du menu contextuel.');
zoneContexte.addEventListener('contextmenu', e => {
  e.preventDefault();
  ouvrirMenu([
    { texte: 'Couper', raccourci: 'Ctrl+X', action: () => toast('Couper') },
    { texte: 'Dupliquer', raccourci: 'Ctrl+D', action: () => toast('Dupliquer') },
    { texte: 'Supprimer', raccourci: 'Suppr', danger: true, action: () => toast('Supprimé', 'alerte') },
  ], { x: e.clientX, y: e.clientY }, 'Actions');
});
const dialogues = [
  menuBtn,
  zoneContexte,
  bouton({ texte: 'Dialogue', surClic: () => dialogue({ titre: 'Exporter en WAV', contenu: h('p', null, 'Exemple de boîte de dialogue avec ses actions.'), actions: [{ texte: 'Annuler', variante: 'discret' }, { texte: 'Exporter', variante: 'principal', defaut: true }] }) }),
  bouton({ texte: 'Confirmer', surClic: async () => toast((await confirmer('Supprimer le pattern ?', 'Les clips qui l\'utilisent disparaîtront aussi.', 'Supprimer', true)) ? 'Supprimé' : 'Annulé') }),
  bouton({ texte: 'Renommer', surClic: async () => { const n = await demanderTexte('Renommer le pattern', 'Nom', 'Pattern 1'); if (n) toast(`Nouveau nom : ${n}`, 'ok'); } }),
  bouton({ texte: 'Toast', surClic: () => toast('Projet enregistré.', 'ok') }),
  bouton({ texte: 'Toast alerte', surClic: () => toast('Fichier illisible : ce n\'est pas un projet Fréquence.', 'alerte') }),
];

const icones = (['lecture', 'pause', 'arret', 'enregistrer', 'metronome', 'annuler', 'retablir', 'menu', 'plus', 'fermer', 'crayon', 'gomme', 'selection', 'decoupe', 'aimant', 'haut_parleur', 'muet', 'casque', 'piano', 'grille', 'pistes', 'console', 'dossier', 'disquette', 'export', 'import', 'dupliquer', 'corbeille', 'bypass', 'reglages', 'boucle', 'aide', 'clavier', 'note', 'poignee'] as NomIcone[])
  .map(n => h('span', { class: 'cat-icone', 'data-bulle': n }, icone(n)));

racine.append(
  h('header', { class: 'cat-entete' }, h('h1', null, 'Fréquence'), h('p', { class: 'doux' }, 'Catalogue des composants de l\'interface (étape 1.3). Survolez un élément : la barre d\'aide en bas explique ce qu\'il fait.')),
  h('main', { class: 'cat-corps' },
    section('Couleurs', ...nuancier),
    section('Couleurs des canaux', ...canaux),
    section('Boutons', ...boutons, ...outils),
    section('Interrupteurs', ...inters),
    section('Boutons rotatifs', ...rotatifs),
    section('Champs numériques et listes', ...champs, ...choix),
    section('Faders et vu-mètres', ...tranches),
    section('Menus, dialogues, toasts', ...dialogues),
    section('Icônes', ...icones)),
  barreAide());
