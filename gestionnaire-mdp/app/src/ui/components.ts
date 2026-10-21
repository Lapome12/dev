// Composants de l'interface Cadenas. Chacun renvoie un élément DOM prêt à insérer ;
// catalogue.html les montre tous en clair et en sombre.

import { h, idUnique, type Enfant } from './dom';
import { icone, type NomIcone } from './icons';

// ---------- Boutons ----------

export interface OptionsBouton {
  texte?: string;
  icone?: NomIcone;
  variante?: 'principal' | 'discret' | 'danger' | 'danger principal';
  /** Libellé accessible obligatoire quand le bouton n'a qu'une icône. */
  libelle?: string;
  titre?: string;
  type?: 'button' | 'submit';
  classe?: string;
  desactive?: boolean;
  surClic?: (ev: MouseEvent) => void;
}

export function bouton(o: OptionsBouton): HTMLButtonElement {
  const seuleIcone = !o.texte && !!o.icone;
  const classes = ['btn', o.variante ?? '', seuleIcone ? 'icone' : '', o.classe ?? ''].filter(Boolean).join(' ');
  const b = h('button', {
    type: o.type ?? 'button',
    class: classes,
    'aria-label': o.libelle,
    title: o.titre ?? (seuleIcone ? o.libelle : undefined),
    disabled: o.desactive,
  }, o.icone && icone(o.icone), o.texte && h('span', null, o.texte));
  if (o.surClic) b.addEventListener('click', o.surClic);
  return b;
}

// ---------- Logo et monogramme ----------

export function logo(taille: '' | 'petit' | 'mini' = ''): HTMLElement {
  return h('span', { class: taille ? `logo ${taille}` : 'logo', 'aria-hidden': 'true' }, icone('cadenas'));
}

export function monogramme(titre: string, grand = false): HTMLElement {
  const lettre = Array.from(titre.trim())[0] ?? '?';
  return h('span', { class: grand ? 'monogramme grand' : 'monogramme', 'aria-hidden': 'true' }, lettre);
}

// ---------- Mot de passe coloré ----------

/** Affiche un mot de passe en chasse fixe : chiffres en bleu, symboles en magenta. */
export function motDePasseColore(mdp: string, grand = false): HTMLElement {
  const el = h('span', { class: grand ? 'mdp grand' : 'mdp' });
  for (const ch of mdp) {
    if (/\p{Nd}/u.test(ch)) el.appendChild(h('span', { class: 'c' }, ch));
    else if (/\p{L}/u.test(ch)) el.appendChild(document.createTextNode(ch));
    else el.appendChild(h('span', { class: 's' }, ch));
  }
  return el;
}

export function motDePasseMasque(): HTMLElement {
  return h('span', { class: 'mdp masque' }, h('span', { 'aria-hidden': 'true' }, '••••••••••••'), h('span', { class: 'lecteur' }, 'masqué'));
}

// ---------- Jauge de force ----------

export const LIBELLES_FORCE = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'] as const;

export function jaugeForce(score: 0 | 1 | 2 | 3 | 4, texte: string = LIBELLES_FORCE[score]): HTMLElement {
  // La jauge a 4 barres : un score 0 n'en allume aucune mais reste rouge par son libellé.
  return h('span', { class: 'force', 'data-n': score },
    h('span', { class: 'jauge', 'data-n': score, 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
    h('span', null, texte));
}

// ---------- Anneau TOTP ----------

const CIRCONFERENCE = 2 * Math.PI * 10;

export interface AnneauTotp { el: SVGSVGElement; maj(restant: number, periode: number): void }

export function anneauTotp(): AnneauTotp {
  const SVG = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(SVG, 'svg');
  el.setAttribute('class', 'anneau');
  el.setAttribute('viewBox', '0 0 26 26');
  el.setAttribute('aria-hidden', 'true');
  const cercle = (classe: string) => {
    const c = document.createElementNS(SVG, 'circle');
    c.setAttribute('class', classe);
    c.setAttribute('cx', '13'); c.setAttribute('cy', '13'); c.setAttribute('r', '10');
    el.appendChild(c);
    return c;
  };
  cercle('fond-a');
  const plein = cercle('plein-a');
  plein.setAttribute('stroke-dasharray', CIRCONFERENCE.toFixed(2));
  return {
    el,
    maj(restant, periode) {
      plein.setAttribute('stroke-dashoffset', (CIRCONFERENCE * (1 - restant / periode)).toFixed(2));
      el.classList.toggle('fin', restant <= 5);
    },
  };
}

/** Code à 6 ou 8 chiffres coupé en deux groupes pour la lecture : « 123 456 ». */
export const formaterCode = (code: string): string => {
  const m = Math.ceil(code.length / 2);
  return `${code.slice(0, m)} ${code.slice(m)}`;
};

// ---------- Badges ----------

export function puce(texte: string, ton: '' | 'alerte' | 'danger' | 'ok' = ''): HTMLElement {
  return h('span', { class: ton ? `puce ${ton}` : 'puce' }, texte);
}

export function pastille(n: number, ton: 'danger' | 'alerte' | 'ok'): HTMLElement {
  return h('span', { class: `pastille ${n ? ton : 'ok'}` }, n);
}

export function encart(ton: '' | 'alerte' | 'danger', ...contenu: Enfant[]): HTMLElement {
  const ic: NomIcone = ton ? 'avertissement' : 'info';
  return h('div', { class: ton ? `encart ${ton}` : 'encart', role: ton === 'danger' ? 'alert' : undefined }, icone(ic), h('div', null, ...contenu));
}

// ---------- Champs ----------

export interface OptionsChamp {
  etiquette: string;
  nom?: string;
  valeur?: string;
  type?: 'text' | 'email' | 'url' | 'password' | 'search' | 'number';
  placeholder?: string;
  aide?: string;
  mono?: boolean;
  requis?: boolean;
  autocomplete?: string;
  multiligne?: boolean;
  suffixe?: Enfant;
}

export interface Champ { bloc: HTMLElement; entree: HTMLInputElement | HTMLTextAreaElement; erreur(msg: string): void }

export function champ(o: OptionsChamp): Champ {
  const id = idUnique('ch');
  const idAide = o.aide ? `${id}-aide` : undefined;
  const idErr = `${id}-err`;
  const commun = {
    id, name: o.nom ?? id, placeholder: o.placeholder, required: o.requis,
    class: o.mono ? 'mono' : undefined, autocomplete: o.autocomplete ?? 'off', spellcheck: 'false',
    'aria-describedby': [idAide, idErr].filter(Boolean).join(' '),
  };
  const entree = o.multiligne
    ? h('textarea', { ...commun, rows: 4 })
    : h('input', { ...commun, type: o.type ?? 'text' });
  entree.value = o.valeur ?? '';
  const cadre = h('div', { class: 'champ' }, entree, o.suffixe);
  const err = h('div', { class: 'erreur', id: idErr, 'aria-live': 'polite' });
  const bloc = h('div', null,
    h('label', { class: 'etiquette', for: id }, o.etiquette), cadre,
    o.aide && h('div', { class: 'aide', id: idAide }, o.aide), err);
  return {
    bloc, entree,
    erreur(msg) {
      err.textContent = msg;
      cadre.classList.toggle('invalide', !!msg);
      entree.setAttribute('aria-invalid', msg ? 'true' : 'false');
    },
  };
}

/** Champ mot de passe avec bouton Afficher / Masquer, et boutons supplémentaires optionnels. */
export function champMotDePasse(o: Omit<OptionsChamp, 'type' | 'mono'> & { outils?: HTMLElement[] }): Champ & { entree: HTMLInputElement } {
  const voir = bouton({ icone: 'oeil', variante: 'discret', libelle: 'Afficher le mot de passe' });
  voir.setAttribute('aria-pressed', 'false');
  const c = champ({ ...o, type: 'password', mono: true, autocomplete: o.autocomplete ?? 'off', suffixe: [voir, ...(o.outils ?? [])] });
  const entree = c.entree as HTMLInputElement;
  voir.addEventListener('click', () => {
    const visible = entree.type === 'password';
    entree.type = visible ? 'text' : 'password';
    voir.setAttribute('aria-pressed', String(visible));
    voir.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    voir.replaceChildren(icone(visible ? 'oeil-barre' : 'oeil'));
  });
  return { ...c, entree };
}

// ---------- Choix segmenté ----------

export function onglets<T extends string>(
  libelle: string, choix: { valeur: T; texte: string }[], courant: T, surChoix: (v: T) => void,
): HTMLElement {
  const groupe = h('div', { class: 'onglets', role: 'group', 'aria-label': libelle });
  for (const c of choix) {
    const b = h('button', { type: 'button', 'aria-pressed': String(c.valeur === courant) }, c.texte);
    b.addEventListener('click', () => {
      for (const autre of Array.from(groupe.children)) autre.setAttribute('aria-pressed', String(autre === b));
      surChoix(c.valeur);
    });
    groupe.appendChild(b);
  }
  return groupe;
}

export function caseACocher(texte: string, coche: boolean, surChange: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', checked: coche });
  input.addEventListener('change', () => surChange(input.checked));
  return h('label', { class: 'case' }, input, texte);
}

export function curseur(o: { etiquette: string; min: number; max: number; valeur: number; unite?: string; surChange: (v: number) => void }): HTMLElement {
  const id = idUnique('rg');
  const lu = h('b', { class: 'mono' }, o.valeur);
  const input = h('input', { id, type: 'range', min: o.min, max: o.max, value: o.valeur });
  input.addEventListener('input', () => {
    lu.textContent = input.value;
    o.surChange(Number(input.value));
  });
  return h('div', { class: 'reglage' },
    h('div', { class: 'reglage-l' }, h('label', { for: id }, o.etiquette), h('span', null, lu, o.unite && ` ${o.unite}`)),
    input);
}

// ---------- Boîtes de dialogue ----------

export interface Dialogue { el: HTMLDialogElement; fermer(): void }

/**
 * Ouvre une boîte de dialogue modale native (<dialog>) : piège du focus, Échap et rôle ARIA
 * sont gérés par le navigateur. `panneau` l'affiche en volet latéral droit.
 */
export function ouvrirDialogue(o: {
  titre: string; contenu: Enfant; pied?: Enfant; panneau?: boolean; surFermeture?: () => void; hote?: HTMLElement;
}): Dialogue {
  const idTitre = idUnique('dlg');
  const fermer = () => el.close();
  const el = h('dialog', { class: o.panneau ? 'panneau' : 'boite', 'aria-labelledby': idTitre },
    h('div', { class: 'dialogue-corps' },
      h('div', { class: 'dialogue-tete' },
        h('h2', { id: idTitre }, o.titre),
        bouton({ icone: 'fermer', variante: 'discret', libelle: 'Fermer', surClic: fermer })),
      o.contenu,
      o.pied && h('div', { class: 'dialogue-pied' }, o.pied)));
  el.addEventListener('click', ev => { if (ev.target === el) fermer(); }); // clic sur le voile
  el.addEventListener('close', () => { el.remove(); o.surFermeture?.(); });
  (o.hote ?? document.body).appendChild(el);
  el.showModal();
  return { el, fermer };
}

/** Demande une confirmation ; renvoie true si l'utilisateur valide. */
export function confirmer(o: { titre: string; message: string; valider: string; danger?: boolean }): Promise<boolean> {
  return new Promise(resoudre => {
    let ok = false;
    const valider = bouton({ texte: o.valider, variante: o.danger ? 'danger principal' : 'principal', surClic: () => { ok = true; d.fermer(); } });
    const d = ouvrirDialogue({
      titre: o.titre,
      contenu: h('p', null, o.message),
      pied: [bouton({ texte: 'Annuler', surClic: () => d.fermer() }), valider],
      surFermeture: () => resoudre(ok),
    });
    valider.focus();
  });
}

// ---------- Toast ----------

let toastCourant: { el: HTMLElement; minuterie: number } | null = null;

/**
 * Message bref en bas de l'écran. Avec `compteARebours`, affiche « Effacé dans N s »
 * (le backend efface réellement le presse-papiers ; ceci n'est que l'affichage).
 */
export function toast(message: string, o: { compteARebours?: number; duree?: number } = {}): void {
  if (toastCourant) { clearInterval(toastCourant.minuterie); toastCourant.el.remove(); }
  const texte = h('span');
  const el = h('div', { class: 'toast', role: 'status' }, icone(o.compteARebours ? 'copier' : 'coche'), texte);
  document.body.appendChild(el);
  let reste = o.compteARebours ?? 0;
  const maj = () => {
    texte.replaceChildren(message);
    if (reste > 0) texte.append('. Effacé du presse-papiers dans ', h('span', { class: 'mono' }, `${reste} s`));
  };
  maj();
  const fin = () => {
    if (toastCourant?.el === el) { clearInterval(toastCourant.minuterie); toastCourant = null; }
    el.remove();
  };
  const minuterie = window.setInterval(() => {
    if (o.compteARebours) {
      reste -= 1;
      if (reste <= 0) {
        texte.replaceChildren('Presse-papiers effacé.');
        clearInterval(minuterie);
        window.setTimeout(fin, 1800);
        return;
      }
      maj();
    }
  }, 1000);
  toastCourant = { el, minuterie };
  if (!o.compteARebours) { clearInterval(minuterie); window.setTimeout(fin, o.duree ?? 2200); }
}
