// Fonctions injectées dans la page par chrome.scripting.executeScript, après un
// geste de l'utilisateur dans l'extension (clic ou raccourci). Rien n'écoute en
// permanence dans les pages et aucune interface n'y est ajoutée (§A.4, §E).
//
// Chaque fonction est sérialisée telle quelle par Chrome : elle ne doit utiliser
// ni import ni variable extérieure. Les aides sont donc définies à l'intérieur.

/** Ce que la sonde rapporte d'un cadre. Aucun contenu de la page n'en sort. */
export interface RapportSonde {
  url: string;
  origine: string;
  /** Champ mot de passe visible et non recouvert. */
  motDePasse: boolean;
  /** Champ identifiant visible et non recouvert. */
  identifiant: boolean;
}

export interface ResultatRemplissage {
  rempli: boolean;
  raison?: 'origine' | 'aucun-champ' | 'invisible';
}

/** Sonde un cadre : son URL et la présence de champs utilisables. Ne modifie rien. */
export function sonder(): RapportSonde {
  const visible = (el: HTMLElement): boolean => {
    if (el.hasAttribute('disabled') || el.hasAttribute('readonly')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    // Opacité cumulée : plusieurs ancêtres à 0,3 rendent le champ aussi invisible qu'un seul à 0,02.
    let opacite = 1;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.visibility === 'hidden' || s.display === 'none') return false;
      opacite *= Number.parseFloat(s.opacity);
      if (opacite < 0.1) return false;
    }
    // Recouvert par autre chose (faux bouton, bannière) : on refuse.
    const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
    const dessus = document.elementFromPoint(x, y);
    return dessus === el || (dessus instanceof HTMLLabelElement && dessus.control === el);
  };
  const mdp = [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')].filter(visible);
  const types = 'input[type="email"], input[type="text"], input[type="tel"], input:not([type])';
  const ident = [...document.querySelectorAll<HTMLInputElement>(types)].filter(
    (i) => /user|login|mail|ident|compte|account|pseudo/i.test(`${i.name} ${i.id} ${i.autocomplete} ${i.type}`) && visible(i),
  );
  return { url: location.href, origine: location.origin, motDePasse: mdp.length > 0, identifiant: ident.length > 0 };
}

/**
 * Remplit le cadre. Revérifie l'origine (le cadre a pu changer de page depuis la
 * sonde) et la visibilité de chaque champ juste avant d'écrire.
 */
export function remplir(origineAttendue: string, identifiant: string, motDePasse: string): ResultatRemplissage {
  if (location.origin !== origineAttendue) return { rempli: false, raison: 'origine' };

  const visible = (el: HTMLElement): boolean => {
    if (el.hasAttribute('disabled') || el.hasAttribute('readonly')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    // Opacité cumulée : plusieurs ancêtres à 0,3 rendent le champ aussi invisible qu'un seul à 0,02.
    let opacite = 1;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.visibility === 'hidden' || s.display === 'none') return false;
      opacite *= Number.parseFloat(s.opacity);
      if (opacite < 0.1) return false;
    }
    const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
    const dessus = document.elementFromPoint(x, y);
    return dessus === el || (dessus instanceof HTMLLabelElement && dessus.control === el);
  };

  // Valeur posée par le setter natif, puis événements : React, Vue et Angular la voient.
  const ecrire = (champ: HTMLInputElement, valeur: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    champ.focus();
    if (setter) setter.call(champ, valeur);
    else champ.value = valeur;
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    champ.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const tousMdp = [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')];
  const mdp = tousMdp.find(visible);
  if (tousMdp.length > 0 && !mdp) return { rempli: false, raison: 'invisible' };

  // Identifiant : le champ texte/e-mail visible qui précède le mot de passe dans le formulaire.
  const types = 'input[type="email"], input[type="text"], input[type="tel"], input:not([type])';
  const portee: ParentNode = mdp?.form ?? document;
  const candidats = [...portee.querySelectorAll<HTMLInputElement>(types)].filter(visible);
  const avant = mdp ? candidats.filter((c) => c.compareDocumentPosition(mdp) & Node.DOCUMENT_POSITION_FOLLOWING) : candidats;
  // Sans champ mot de passe (connexion en deux temps), seul un champ nommé comme un identifiant convient.
  const ident =
    avant.filter((c) => /user|login|mail|ident|compte|account|pseudo/i.test(`${c.name} ${c.id} ${c.autocomplete} ${c.type}`)).at(-1) ??
    (mdp ? avant.at(-1) : undefined);

  if (!mdp && !ident) return { rempli: false, raison: 'aucun-champ' };
  if (ident && identifiant) ecrire(ident, identifiant);
  if (mdp) ecrire(mdp, motDePasse);
  return { rempli: true };
}
