// Écran principal du coffre déverrouillé : groupes, liste, détail (trois colonnes, pile sur mobile).

import type { EntryDetail, EntrySummary, GroupInfo, Id, SecretKind } from '../backend';
import {
  anneauTotp, bouton, champ, confirmer, formaterCode, jaugeForce, logo, monogramme, motDePasseColore, motDePasseMasque,
  ouvrirDialogue, puce, toast,
} from './components';
import type { Contexte, EtatOuvert } from './contexte';
import { messageErreur } from './contexte';
import { dateFr, h, hote, remplacer } from './dom';
import { editeurEntree } from './editeur';
import { ouvrirGenerateur } from './generateur';
import { icone, type NomIcone } from './icons';
import { ouvrirReglages, ouvrirSante } from './panneaux';

type Vue =
  | { type: 'tout' }
  | { type: '2fa' }
  | { type: 'groupe'; id: Id }
  | { type: 'filtre'; titre: string; ids: Id[] };

const AN = 365 * 86_400_000;

export interface EcranCoffre { el: HTMLElement; majEtat(s: EtatOuvert): void; detruire(): void }

export function ecranCoffre(ctx: Contexte, etatInitial: EtatOuvert, o: { estDemo: boolean }): EcranCoffre {
  const b = ctx.backend;
  let etat = etatInitial;
  let vue: Vue = { type: 'tout' };
  let recherche = '';
  let sel: Id | null = null;
  let mode: 'fiche' | 'edition' | 'nouveau' = 'fiche';
  let voirMdp = false;
  let groupes: GroupInfo[] = [];
  let toutes: EntrySummary[] = [];
  let liste: EntrySummary[] = [];
  let nbCorbeille = 0;
  let nbARevoir = 0;
  let derniereActivite = Date.now();
  let delaiVerrou = 10;
  let delaiPressePapiers = 30;
  let totpFin = 0;
  let generation = 0; // ignore les réponses d'un rendu périmé

  // ---------- Squelette ----------
  const champRecherche = h('input', { type: 'search', placeholder: 'Rechercher un site, un identifiant…', 'aria-label': 'Rechercher', autocomplete: 'off', spellcheck: 'false' });
  const minuteur = h('span', { class: 'mono' }, '');
  const etatEl = h('span', { class: 'etat' }, 'Déverrouillé · ', minuteur);
  const btnEnregistrer = bouton({ texte: 'Enregistrer', icone: 'enregistrer', variante: 'principal', titre: 'Enregistrer (Ctrl+S)', surClic: () => { void enregistrer(); } });
  const navGroupes = h('nav', { class: 'groupes', 'aria-label': 'Groupes' });
  const titreListe = h('h2', { id: 'titre-liste' });
  const outilsListe = h('span', { class: 'groupe-btn' });
  const corpsListe = h('div', { class: 'liste-corps', role: 'listbox', 'aria-labelledby': 'titre-liste', tabindex: '0' });
  const detail = h('section', { class: 'detail', 'aria-label': 'Détail de l\'entrée' });
  const colonnes = h('div', { class: 'colonnes' },
    navGroupes,
    h('section', { class: 'liste', 'aria-label': 'Entrées' },
      h('div', { class: 'liste-tete' }, titreListe, outilsListe,
        bouton({ icone: 'plus', libelle: 'Nouvelle entrée', titre: 'Nouvelle entrée (N)', surClic: () => nouvelleEntree() })),
      corpsListe),
    detail);

  const actionBarre = (icon: NomIcone, texte: string, surClic: () => void, classe = '') =>
    bouton({ icone: icon, texte, classe: `discret ${classe}`, surClic });
  const el = h('div', { class: 'ecran coffre' },
    h('header', { class: 'barre' },
      bouton({ icone: 'menu', variante: 'discret', libelle: 'Groupes', classe: 'seul-etroit', surClic: () => basculerGroupes() }),
      h('div', { class: 'marque' }, logo('petit'), h('span', null, etat.name)),
      h('label', { class: 'champ recherche' }, icone('loupe', 'doux'), champRecherche, h('kbd', { 'aria-hidden': 'true' }, '/')),
      h('span', { class: 'espace' }),
      etatEl, btnEnregistrer,
      h('div', { class: 'actions' },
        bouton({ icone: 'de', texte: 'Générer', classe: 'large-seul', titre: 'Générateur', surClic: () => ouvrirGen() }),
        bouton({ icone: 'pouls', libelle: 'Santé du coffre', classe: 'large-seul', surClic: () => { void ouvrirSanteCoffre(); } }),
        bouton({ icone: 'reglages', libelle: 'Réglages', classe: 'large-seul', surClic: () => { void ouvrirReglagesCoffre(); } }),
        bouton({ icone: 'cadenas', texte: 'Verrouiller', titre: 'Verrouiller (Ctrl+L)', surClic: () => { void verrouiller(); } }))),
    colonnes,
    h('nav', { class: 'barre-bas', 'aria-label': 'Actions' },
      actionBarre('menu', 'Groupes', () => basculerGroupes()),
      actionBarre('plus', 'Ajouter', () => nouvelleEntree()),
      actionBarre('de', 'Générer', () => ouvrirGen()),
      actionBarre('pouls', 'Santé', () => { void ouvrirSanteCoffre(); }),
      actionBarre('reglages', 'Réglages', () => { void ouvrirReglagesCoffre(); })));

  // ---------- Données ----------

  async function charger(): Promise<void> {
    const g = ++generation;
    const [gs, ts, sante, reglages] = await Promise.all([b.listGroups(), b.listEntries(), b.health(), b.getSettings()]);
    if (g !== generation) return;
    groupes = gs; toutes = ts;
    delaiVerrou = reglages.autoLockMinutes; delaiPressePapiers = reglages.clipboardSeconds;
    nbARevoir = new Set([...sante.weak, ...sante.reused.flat(), ...sante.old, ...sante.withoutPassword]).size;
    const corbeille = groupes.find(x => x.isRecycleBin);
    nbCorbeille = corbeille ? (await b.listEntries(corbeille.id)).length : 0;
    await chargerListe();
  }

  async function chargerListe(): Promise<void> {
    const g = generation;
    let l: EntrySummary[];
    if (recherche) l = await b.search(recherche);
    else if (vue.type === 'groupe') l = await b.listEntries(vue.id);
    else if (vue.type === '2fa') l = toutes.filter(e => e.hasTotp);
    else if (vue.type === 'filtre') { const ids = new Set(vue.ids); l = toutes.filter(e => ids.has(e.id)); }
    else l = toutes;
    if (g !== generation) return;
    liste = l;
    if (!sel || (mode === 'fiche' && !liste.some(e => e.id === sel))) sel = liste[0]?.id ?? null;
    dessinerGroupes(); dessinerListe(); await dessinerDetail();
  }

  const racine = () => groupes.find(x => x.parentId === null);
  const corbeille = () => groupes.find(x => x.isRecycleBin);
  const nomGroupe = (id: Id) => groupes.find(x => x.id === id)?.name ?? '';
  const dansCorbeille = (id: Id) => corbeille()?.id === id;

  // ---------- Groupes ----------

  function dessinerGroupes(): void {
    const bouts: HTMLElement[] = [];
    const lien = (v: Vue, nom: string, ic: NomIcone, n: number | string, niveau = 0, ton = '') => {
      const courant = !recherche && JSON.stringify(v) === JSON.stringify(vue);
      return h('button', { type: 'button', class: 'groupe', 'aria-current': String(courant), 'data-niveau': niveau,
        onclick: () => { allerVue(v); } },
        icone(ic), h('span', { class: 'nom' }, nom), h('span', { class: ton ? `n ${ton}` : 'n' }, n));
    };
    bouts.push(lien({ type: 'tout' }, 'Toutes les entrées', 'tout', toutes.length));
    bouts.push(lien({ type: '2fa' }, 'Codes 2FA', 'horloge', toutes.filter(e => e.hasTotp).length));
    const r = racine();
    bouts.push(h('h2', null, 'Groupes', bouton({ icone: 'plus', variante: 'discret', libelle: 'Nouveau groupe', surClic: () => nouveauGroupe() })));
    const compte = (id: Id) => toutes.filter(e => e.groupId === id).length;
    const enfants = (parent: Id, niveau: number) => {
      for (const g of groupes.filter(x => x.parentId === parent && !x.isRecycleBin)) {
        bouts.push(lien({ type: 'groupe', id: g.id }, g.name, 'dossier', compte(g.id), Math.min(niveau, 3)));
        enfants(g.id, niveau + 1);
      }
    };
    if (r) {
      if (compte(r.id)) bouts.push(lien({ type: 'groupe', id: r.id }, 'Sans groupe', 'dossier', compte(r.id)));
      enfants(r.id, 0);
    }
    bouts.push(h('h2', null, 'Coffre'));
    bouts.push(h('button', { type: 'button', class: 'groupe', onclick: () => { void ouvrirSanteCoffre(); } },
      icone('pouls'), h('span', { class: 'nom' }, 'Santé du coffre'), h('span', { class: nbARevoir ? 'n alerte' : 'n' }, nbARevoir)));
    const c = corbeille();
    if (c) bouts.push(lien({ type: 'groupe', id: c.id }, 'Corbeille', 'corbeille', nbCorbeille));
    remplacer(navGroupes, bouts);
  }

  function allerVue(v: Vue): void {
    vue = v; recherche = ''; champRecherche.value = ''; mode = 'fiche'; sel = null;
    colonnes.classList.remove('voir-groupes', 'voir-detail');
    void chargerListe();
  }

  function basculerGroupes(): void {
    colonnes.classList.toggle('voir-groupes');
    if (colonnes.classList.contains('voir-groupes')) navGroupes.querySelector<HTMLElement>('.groupe')?.focus();
  }

  function nouveauGroupe(): void {
    const c = champ({ etiquette: 'Nom du groupe', requis: true });
    const valider = async () => {
      const nom = c.entree.value.trim();
      if (!nom) { c.erreur('Donnez un nom au groupe.'); return; }
      try {
        const id = await b.addGroup(nom, racine()?.id ?? null);
        d.fermer(); await charger(); allerVue({ type: 'groupe', id });
      } catch (e) { c.erreur(messageErreur(e)); }
    };
    c.entree.addEventListener('keydown', ev => { if ((ev as KeyboardEvent).key === 'Enter') { ev.preventDefault(); void valider(); } });
    const d = ouvrirDialogue({ titre: 'Nouveau groupe', contenu: c.bloc,
      pied: [bouton({ texte: 'Annuler', surClic: () => d.fermer() }), bouton({ texte: 'Créer', variante: 'principal', surClic: () => { void valider(); } })] });
    c.entree.focus();
  }

  function renommerGroupe(id: Id): void {
    const c = champ({ etiquette: 'Nouveau nom', valeur: nomGroupe(id), requis: true });
    const valider = async () => {
      const nom = c.entree.value.trim();
      if (!nom) { c.erreur('Donnez un nom au groupe.'); return; }
      try { await b.renameGroup(id, nom); d.fermer(); await charger(); } catch (e) { c.erreur(messageErreur(e)); }
    };
    c.entree.addEventListener('keydown', ev => { if ((ev as KeyboardEvent).key === 'Enter') { ev.preventDefault(); void valider(); } });
    const d = ouvrirDialogue({ titre: 'Renommer le groupe', contenu: c.bloc,
      pied: [bouton({ texte: 'Annuler', surClic: () => d.fermer() }), bouton({ texte: 'Renommer', variante: 'principal', surClic: () => { void valider(); } })] });
    c.entree.select();
  }

  async function supprimerGroupe(id: Id): Promise<void> {
    const ok = await confirmer({ titre: `Supprimer « ${nomGroupe(id)} » ?`, message: 'Ses entrées seront placées dans la corbeille.', valider: 'Supprimer', danger: true });
    if (!ok) return;
    try { await b.deleteGroup(id); allerVue({ type: 'tout' }); await charger(); } catch (e) { toast(messageErreur(e)); }
  }

  // ---------- Liste ----------

  function titreVue(): string {
    if (recherche) return `Résultats pour « ${recherche} »`;
    if (vue.type === 'tout') return 'Toutes les entrées';
    if (vue.type === '2fa') return 'Codes 2FA';
    if (vue.type === 'filtre') return vue.titre;
    return vue.id === racine()?.id ? 'Sans groupe' : nomGroupe(vue.id);
  }

  function dessinerListe(): void {
    remplacer(titreListe, titreVue(), ' ', h('span', { class: 'n' }, liste.length));
    const outils: HTMLElement[] = [];
    if (!recherche && vue.type === 'groupe' && vue.id !== racine()?.id && !dansCorbeille(vue.id)) {
      const id = vue.id;
      outils.push(bouton({ icone: 'crayon', variante: 'discret', libelle: 'Renommer le groupe', surClic: () => renommerGroupe(id) }),
        bouton({ icone: 'corbeille', variante: 'discret', libelle: 'Supprimer le groupe', surClic: () => { void supprimerGroupe(id); } }));
    }
    remplacer(outilsListe, outils);
    if (!liste.length) {
      remplacer(corpsListe, h('div', { class: 'vide' }, recherche ? 'Aucune entrée ne correspond.' : 'Aucune entrée ici pour l\'instant.'));
      corpsListe.removeAttribute('aria-activedescendant');
      return;
    }
    remplacer(corpsListe, liste.map(e => h('div', {
      class: 'entree', role: 'option', id: `entree-${cssId(e.id)}`, 'aria-selected': String(e.id === sel),
      onclick: () => choisir(e.id, true),
    },
    monogramme(e.title),
    h('span', { class: 'txt' }, h('span', { class: 'titre' }, e.title || 'Sans titre'), h('span', { class: 'ident' }, e.username || hote(e.url))),
    e.hasTotp && puce('2FA'))));
    if (sel) corpsListe.setAttribute('aria-activedescendant', `entree-${cssId(sel)}`);
  }

  function choisir(id: Id, ouvrirDetail: boolean): void {
    sel = id; mode = 'fiche'; voirMdp = false;
    for (const x of Array.from(corpsListe.children)) x.setAttribute('aria-selected', String(x.id === `entree-${cssId(id)}`));
    corpsListe.setAttribute('aria-activedescendant', `entree-${cssId(id)}`);
    document.getElementById(`entree-${cssId(id)}`)?.scrollIntoView({ block: 'nearest' });
    if (ouvrirDetail) colonnes.classList.add('voir-detail');
    void dessinerDetail();
  }

  function deplacer(pas: number): void {
    if (!liste.length) return;
    const i = liste.findIndex(e => e.id === sel);
    const j = Math.min(liste.length - 1, Math.max(0, i + pas));
    const cible = liste[j];
    if (cible) choisir(cible.id, false);
  }

  // ---------- Détail ----------

  async function dessinerDetail(): Promise<void> {
    totpFin = 0;
    const g = generation;
    if (mode !== 'fiche') {
      const e = mode === 'edition' && sel ? await b.getEntry(sel) : undefined;
      const form = await editeurEntree({
        backend: b, groupes, entree: e,
        groupeParDefaut: vue.type === 'groupe' && !dansCorbeille(vue.id) ? vue.id
          : (e?.groupId ?? groupes.find(x => x.parentId === racine()?.id && !x.isRecycleBin)?.id ?? racine()?.id ?? ''),
        surFin: id => { mode = 'fiche'; if (id) sel = id; void charger(); },
      });
      if (g !== generation) return;
      remplacer(detail, h('button', { type: 'button', class: 'btn discret retour', onclick: () => { mode = 'fiche'; colonnes.classList.remove('voir-detail'); void dessinerDetail(); } }, icone('retour'), 'Retour'), form);
      return;
    }
    if (!sel) { remplacer(detail, h('div', { class: 'vide' }, liste.length ? 'Choisissez une entrée.' : '')); return; }
    let e: EntryDetail;
    try { e = await b.getEntry(sel); } catch { remplacer(detail); return; }
    if (g !== generation || e.id !== sel) return;
    const mdp = await b.getSecret(e.id, 'password').catch(() => '');
    if (g !== generation || e.id !== sel) return;

    const age = Date.now() - e.modified;
    const sante = await b.health().catch(() => null);
    const reutilise = !!sante?.reused.some(ids => ids.includes(e.id));
    const vieux = age > AN;
    const enCorbeille = dansCorbeille(e.groupId);

    const outil = (ic: NomIcone, libelle: string, surClic: () => void, titre?: string) =>
      bouton({ icone: ic, variante: 'discret', libelle, titre: titre ?? libelle, surClic });

    const lignes: HTMLElement[] = [];
    const ligne = (etiq: string, val: Node | string, ...outils: HTMLElement[]) =>
      lignes.push(h('div', { class: 'ligne' }, h('span', { class: 'etiq' }, etiq), h('span', { class: 'val' }, val), h('span', { class: 'outils' }, ...outils)));

    if (e.username) ligne('Identifiant', e.username, outil('copier', 'Copier l\'identifiant', () => { void copier('username'); }, 'Copier l\'identifiant (Ctrl+B)'));
    if (mdp) {
      const val = h('span', null, voirMdp ? motDePasseColore(mdp) : motDePasseMasque(), h('br'), jaugeForce(e.passwordStrength),
        (reutilise || vieux) && h('span', { class: 'remarque' }, [reutilise && 'Réutilisé ailleurs', vieux && 'Plus d\'un an sans changement'].filter(Boolean).join(' · ')));
      const voir = outil(voirMdp ? 'oeil-barre' : 'oeil', voirMdp ? 'Masquer le mot de passe' : 'Afficher le mot de passe', () => { voirMdp = !voirMdp; void dessinerDetail(); });
      voir.setAttribute('aria-pressed', String(voirMdp));
      ligne('Mot de passe', val, voir, outil('copier', 'Copier le mot de passe', () => { void copier('password'); }, 'Copier le mot de passe (Ctrl+C)'));
    } else {
      ligne('Mot de passe', h('span', { class: 'remarque' }, 'Aucun mot de passe enregistré.'));
    }
    if (e.hasTotp) {
      const anneau = anneauTotp();
      const code = h('span', { class: 'code', 'aria-live': 'off' }, '··· ···');
      const reste = h('span', { class: 'doux petit chiffres' });
      ligne('Code 2FA', h('span', { class: 'totp' }, code, anneau.el, reste), outil('copier', 'Copier le code 2FA', () => { void copier('totp'); }));
      totpCourant = { id: e.id, code, anneau: anneau, reste };
    }
    if (e.url) {
      const lien = /^https?:\/\//i.test(e.url)
        ? h('a', { href: e.url, target: '_blank', rel: 'noopener noreferrer' }, hote(e.url))
        : h('span', { class: 'mono' }, e.url);
      ligne('Site web', h('span', null, lien,
        e.url.startsWith('http:') && h('span', { class: 'remarque' }, 'Connexion non chiffrée (http) : remplissage limité à cette adresse exacte.')));
    }
    for (const f of e.fields) {
      const valeur = f.protected ? motDePasseMasque() : h('span', null, f.value);
      ligne(f.key, valeur, outil('copier', `Copier « ${f.key} »`, () => { void copier({ field: f.key }); }));
    }
    if (e.tags.length) ligne('Étiquettes', h('span', { class: 'etiquettes' }, e.tags.map(t => puce(t))));
    if (e.notes) ligne('Notes', h('span', { class: 'notes' }, e.notes));

    remplacer(detail, h('div', { class: 'detail-carte' },
      h('button', { type: 'button', class: 'btn discret retour', onclick: () => colonnes.classList.remove('voir-detail') }, icone('retour'), 'Retour'),
      h('div', { class: 'detail-tete' },
        monogramme(e.title, true),
        h('div', { class: 'titres' }, h('h1', null, e.title || 'Sans titre'), h('div', { class: 'doux' }, groupes.find(x => x.id === e.groupId)?.parentId === null ? 'Sans groupe' : nomGroupe(e.groupId))),
        h('div', { class: 'actions' },
          !enCorbeille && bouton({ icone: 'crayon', texte: 'Modifier', surClic: () => { mode = 'edition'; void dessinerDetail(); } }),
          bouton({ icone: 'corbeille', variante: 'discret', libelle: enCorbeille ? 'Supprimer définitivement' : 'Mettre à la corbeille', surClic: () => { void supprimer(e); } }))),
      h('div', { class: 'champs' }, lignes),
      h('div', { class: 'meta' },
        h('span', null, `Modifié le ${dateFr(e.modified)}`),
        h('span', null, `Créé le ${dateFr(e.created)}`),
        e.historyCount > 0 && h('span', null, e.historyCount > 1 ? `${e.historyCount} versions dans l'historique` : '1 version dans l\'historique'))));
    if (e.hasTotp) void majTotp(true);
  }

  let totpCourant: { id: Id; code: HTMLElement; anneau: ReturnType<typeof anneauTotp>; reste: HTMLElement } | null = null;

  async function majTotp(forcer = false): Promise<void> {
    const t = totpCourant;
    if (!t || !t.code.isConnected) { totpCourant = null; return; }
    const restant = Math.ceil((totpFin - Date.now()) / 1000);
    if (forcer || restant <= 0) {
      try {
        const r = await b.getTotp(t.id);
        totpFin = Date.now() + r.remaining * 1000;
        t.code.textContent = formaterCode(r.code);
        t.anneau.maj(r.remaining, r.period);
        t.reste.textContent = `${r.remaining} s`;
        (t as { periode?: number }).periode = r.period;
      } catch { t.code.textContent = '—'; }
      return;
    }
    const periode = (t as { periode?: number }).periode ?? 30;
    t.anneau.maj(restant, periode);
    t.reste.textContent = `${restant} s`;
  }

  // ---------- Actions ----------

  async function copier(kind: SecretKind | 'username'): Promise<void> {
    if (!sel) return;
    const libelle = kind === 'password' ? 'Mot de passe copié' : kind === 'totp' ? 'Code 2FA copié'
      : typeof kind === 'object' ? `« ${kind.field} » copié` : 'Copié';
    try {
      if (kind === 'username') {
        const e = liste.find(x => x.id === sel) ?? (await b.getEntry(sel));
        await ecrirePressePapiers(e.username);
        toast('Identifiant copié');
        return;
      }
      await b.copySecret(sel, kind);
      toast(libelle, { compteARebours: delaiPressePapiers });
    } catch (e) { toast(messageErreur(e)); }
  }

  async function copierGenere(mdp: string): Promise<void> {
    await ecrirePressePapiers(mdp);
    window.setTimeout(() => { void ecrirePressePapiers(''); }, delaiPressePapiers * 1000);
  }

  function ouvrirGen(): void { ouvrirGenerateur({ copier: copierGenere }); }

  async function ouvrirSanteCoffre(): Promise<void> {
    try {
      const r = await b.health();
      ouvrirSante(r, (titre, ids) => allerVue({ type: 'filtre', titre, ids }));
    } catch (e) { toast(messageErreur(e)); }
  }

  async function ouvrirReglagesCoffre(): Promise<void> {
    await ouvrirReglages(ctx, { estDemo: o.estDemo });
  }

  function nouvelleEntree(): void {
    mode = 'nouveau';
    colonnes.classList.remove('voir-groupes');
    colonnes.classList.add('voir-detail');
    void dessinerDetail();
  }

  async function supprimer(e: EntryDetail): Promise<void> {
    const definitif = dansCorbeille(e.groupId);
    const ok = await confirmer(definitif
      ? { titre: 'Supprimer définitivement ?', message: `« ${e.title} » sera effacée du coffre. Cette action est irréversible.`, valider: 'Supprimer', danger: true }
      : { titre: 'Mettre à la corbeille ?', message: `« ${e.title} » pourra être retrouvée dans la corbeille.`, valider: 'Mettre à la corbeille', danger: true });
    if (!ok) return;
    try {
      await b.deleteEntry(e.id);
      sel = null;
      colonnes.classList.remove('voir-detail');
      toast(definitif ? 'Entrée supprimée' : 'Entrée placée dans la corbeille');
      await charger();
    } catch (err) { toast(messageErreur(err)); }
  }

  async function enregistrer(): Promise<void> {
    try { await b.save(); toast('Coffre enregistré'); } catch (e) { toast(messageErreur(e)); }
  }

  async function verrouiller(): Promise<void> {
    await b.lock();
    await ctx.rafraichir();
  }

  // ---------- Événements ----------

  let minuterieRecherche = 0;
  champRecherche.addEventListener('input', () => {
    window.clearTimeout(minuterieRecherche);
    minuterieRecherche = window.setTimeout(() => { recherche = champRecherche.value.trim(); mode = 'fiche'; sel = null; void chargerListe(); }, 80);
  });
  champRecherche.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); corpsListe.focus(); deplacer(liste.findIndex(e => e.id === sel) < 0 ? 0 : 1); }
    if (ev.key === 'Enter' && liste[0]) { ev.preventDefault(); choisir(sel ?? liste[0].id, true); corpsListe.focus(); }
  });
  corpsListe.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && sel) { ev.preventDefault(); choisir(sel, true); }
    if (ev.key === 'Home') { ev.preventDefault(); deplacer(-liste.length); }
    if (ev.key === 'End') { ev.preventDefault(); deplacer(liste.length); }
  });

  const surTouche = (ev: KeyboardEvent) => {
    if (document.querySelector('dialog[open]')) return; // la boîte ouverte gère ses touches (Échap…)
    const cible = ev.target as HTMLElement | null;
    const dansChamp = !!cible && (/^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName) || cible.isContentEditable);
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (mod && k === 'l') { ev.preventDefault(); void verrouiller(); return; }
    if (mod && k === 's') { ev.preventDefault(); void enregistrer(); return; }
    if ((mod && k === 'k') || (ev.key === '/' && !dansChamp)) { ev.preventDefault(); champRecherche.focus(); champRecherche.select(); return; }
    if (ev.key === 'Escape') {
      if (colonnes.classList.contains('voir-groupes')) colonnes.classList.remove('voir-groupes');
      else if (mode !== 'fiche') { mode = 'fiche'; void dessinerDetail(); }
      else if (document.activeElement === champRecherche && champRecherche.value) { champRecherche.value = ''; recherche = ''; void chargerListe(); }
      else if (colonnes.classList.contains('voir-detail')) colonnes.classList.remove('voir-detail');
      else (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    if (dansChamp || mode !== 'fiche') return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); deplacer(ev.key === 'ArrowDown' ? 1 : -1); return; }
    if (mod && k === 'c' && !String(window.getSelection() ?? '')) { ev.preventDefault(); void copier('password'); return; }
    if (mod && k === 'b') { ev.preventDefault(); void copier('username'); return; }
    if (!mod && !ev.altKey && k === 'n') { ev.preventDefault(); nouvelleEntree(); }
  };
  document.addEventListener('keydown', surTouche);

  const activite = () => { derniereActivite = Date.now(); };
  const evenementsActivite = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  for (const ev of evenementsActivite) window.addEventListener(ev, activite, { passive: true });

  const tic = window.setInterval(() => {
    const reste = Math.max(0, delaiVerrou * 60_000 - (Date.now() - derniereActivite));
    minuteur.textContent = `${Math.floor(reste / 60_000)}:${String(Math.floor(reste / 1000) % 60).padStart(2, '0')}`;
    void majTotp();
  }, 1000);

  function majEtat(s: EtatOuvert): void {
    etat = s;
    btnEnregistrer.hidden = !s.dirty || o.estDemo;
    etatEl.classList.toggle('modifie', s.dirty && !o.estDemo);
    remplacer(etatEl, s.dirty && !o.estDemo ? 'Modifications non enregistrées' : ['Déverrouillé · ', minuteur]);
  }

  majEtat(etat);
  void charger().catch(e => toast(messageErreur(e)));

  return {
    el,
    majEtat(s) { majEtat(s); void charger().catch(() => {}); },
    detruire() {
      generation++;
      window.clearInterval(tic);
      document.removeEventListener('keydown', surTouche);
      for (const ev of evenementsActivite) window.removeEventListener(ev, activite);
      for (const d of Array.from(document.querySelectorAll('dialog[open]'))) (d as HTMLDialogElement).close();
    },
  };
}

/** Identifiant utilisable dans un attribut id (les UUID KDBX en base64 contiennent + / =). */
function cssId(id: Id): string {
  return id.replace(/[^A-Za-z0-9_-]/g, c => `_${c.charCodeAt(0).toString(16)}`);
}

async function ecrirePressePapiers(texte: string): Promise<void> {
  try { await navigator.clipboard.writeText(texte); } catch { /* sans permission */ }
}
