// Panneau Générateur : mot de passe ou phrase de passe, tirés par core (crypto.getRandomValues).

import { estimateStrength, generatePassphrase, generatePassword } from '@cadenas/core';
import { bouton, caseACocher, curseur, jaugeForce, motDePasseColore, onglets, ouvrirDialogue, toast } from './components';
import { h } from './dom';

export interface ReglagesGenerateur {
  mode: 'mdp' | 'phrase';
  length: number; lower: boolean; upper: boolean; digits: boolean; symbols: boolean; avoidAmbiguous: boolean;
  words: number; separator: string; capitalize: boolean; addDigit: boolean;
}

// Mémorisé le temps de la session (jamais sur disque).
const reglages: ReglagesGenerateur = {
  mode: 'mdp', length: 20, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: true,
  words: 5, separator: '-', capitalize: false, addDigit: true,
};

export function generer(r: ReglagesGenerateur = reglages): string {
  if (r.mode === 'phrase') return generatePassphrase({ words: r.words, separator: r.separator, capitalize: r.capitalize, addDigit: r.addDigit });
  if (!r.lower && !r.upper && !r.digits && !r.symbols) return '';
  return generatePassword(r);
}

/**
 * Ouvre le générateur en panneau. Avec `surUtiliser`, un bouton « Utiliser » renvoie le résultat
 * (éditeur d'entrée) ; sinon on propose de le copier.
 */
export function ouvrirGenerateur(o: { surUtiliser?: (mdp: string) => void; copier?: (mdp: string) => Promise<void> } = {}): void {
  let courant = '';
  const sortie = h('div', { class: 'sortie-mdp', 'aria-live': 'polite' });
  const force = h('div');
  const zoneReglages = h('div', { class: 'gen' });

  const tirer = () => {
    courant = generer();
    sortie.replaceChildren(courant ? motDePasseColore(courant, true) : h('span', { class: 'doux' }, 'Choisissez au moins un type de caractère.'));
    if (!courant) { force.replaceChildren(); return; }
    const f = estimateStrength(courant);
    force.replaceChildren(jaugeForce(f.score, `${['Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'][f.score]} · ${f.crackTime}`));
  };

  const dessinerReglages = () => {
    const changer = <K extends keyof ReglagesGenerateur>(k: K) => (v: ReglagesGenerateur[K]) => { reglages[k] = v; tirer(); };
    if (reglages.mode === 'mdp') {
      zoneReglages.replaceChildren(
        curseur({ etiquette: 'Longueur', min: 8, max: 64, valeur: reglages.length, unite: 'caractères', surChange: changer('length') }),
        h('div', { class: 'cases' },
          caseACocher('Minuscules', reglages.lower, changer('lower')),
          caseACocher('Majuscules', reglages.upper, changer('upper')),
          caseACocher('Chiffres', reglages.digits, changer('digits')),
          caseACocher('Symboles', reglages.symbols, changer('symbols'))),
        caseACocher('Éviter les caractères ambigus (0 O l 1 I)', reglages.avoidAmbiguous, changer('avoidAmbiguous')));
    } else {
      const sep = h('select', { 'aria-label': 'Séparateur' },
        ...[['-', 'Tiret'], [' ', 'Espace'], ['.', 'Point'], ['_', 'Souligné']].map(([v, t]) => h('option', { value: v, selected: v === reglages.separator }, t)));
      sep.addEventListener('change', () => changer('separator')(sep.value));
      zoneReglages.replaceChildren(
        curseur({ etiquette: 'Nombre de mots', min: 3, max: 12, valeur: reglages.words, unite: 'mots', surChange: changer('words') }),
        h('div', null, h('span', { class: 'etiquette' }, 'Séparateur'), h('div', { class: 'champ' }, sep)),
        h('div', { class: 'cases' },
          caseACocher('Majuscule initiale', reglages.capitalize, changer('capitalize')),
          caseACocher('Ajouter un chiffre', reglages.addDigit, changer('addDigit'))),
        h('p', { class: 'aide' }, 'Mots tirés de la liste EFF de 7 776 mots : environ 12,9 bits par mot.'));
    }
  };

  const action = o.surUtiliser
    ? bouton({ texte: 'Utiliser', icone: 'coche', variante: 'principal', surClic: () => { if (courant) { o.surUtiliser!(courant); d.fermer(); } } })
    : bouton({ texte: 'Copier', icone: 'copier', variante: 'principal', surClic: async () => {
      if (!courant) return;
      if (o.copier) await o.copier(courant);
      else { try { await navigator.clipboard.writeText(courant); } catch { /* sans permission */ } }
      toast('Mot de passe généré copié', { compteARebours: o.copier ? 30 : 0 });
    } });

  const d = ouvrirDialogue({
    titre: 'Générateur', panneau: true,
    contenu: h('div', { class: 'gen' },
      onglets('Type', [{ valeur: 'mdp', texte: 'Mot de passe' }, { valeur: 'phrase', texte: 'Phrase de passe' }], reglages.mode,
        v => { reglages.mode = v; dessinerReglages(); tirer(); }),
      sortie, force,
      h('div', { class: 'groupe-btn' }, action, bouton({ texte: 'Nouveau', icone: 'de', surClic: tirer })),
      zoneReglages,
      h('p', { class: 'aide' }, 'Généré sur votre appareil avec crypto.getRandomValues. Rien n\'est envoyé.')),
  });
  dessinerReglages();
  tirer();
}
