// Fenêtre rapide de l'extension (380 × 560) : comptes de l'onglet actif en tête,
// recherche, copie, remplissage, générateur rapide, ajout pour ce site.
// Elle ne parle qu'au gardien, via ExtensionBackend et les requêtes fill/*.
import '@cadenas/app/styles/tokens.css';
import '@cadenas/app/styles/base.css';
import '@cadenas/app/styles/components.css';
import './popup.css';
import type { EntrySummary } from '@cadenas/core';
import { generatePassword } from '@cadenas/core';
import { bouton, champ, champMotDePasse, logo, monogramme, motDePasseColore, toast } from '@cadenas/app/ui/components';
import { h, hote, remplacer } from '@cadenas/app/ui/dom';
import { icone } from '@cadenas/app/ui/icons';
import { ExtensionBackend } from './backend-extension';
import type { EtatCoffre } from './gardien';
import { ErreurCadenas, type Reponse } from './messages';

const backend = new ExtensionBackend();
const racine = document.getElementById('popup') as HTMLElement;

interface Candidats {
  url: string | null;
  entrees: EntrySummary[];
}

async function requete<T>(type: 'fill/candidates' | 'fill/run', ...args: unknown[]): Promise<T> {
  const r = (await chrome.runtime.sendMessage({ type, args })) as Reponse<T> | undefined;
  if (!r) throw new ErreurCadenas('interne', 'Cadenas ne répond pas.');
  if (!r.ok) throw new ErreurCadenas(r.code, r.message);
  return r.value;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ouvrirCoffre(): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL('vault.html') });
  window.close();
}

function barre(etat: EtatCoffre): HTMLElement {
  const ouvert = etat.state === 'deverrouille';
  return h(
    'header',
    { class: 'popup-barre' },
    logo('mini'),
    h('span', { class: 'popup-titre' }, 'Cadenas'),
    h('span', { class: 'popup-etat' }, etat.state === 'aucun-coffre' ? '' : ouvert ? 'Déverrouillé' : 'Verrouillé'),
    ouvert &&
      bouton({
        icone: 'cadenas',
        variante: 'discret',
        libelle: 'Verrouiller',
        surClic: () => void backend.lock(),
      }),
  );
}

function pied(): HTMLElement {
  return h(
    'footer',
    { class: 'popup-pied' },
    bouton({ texte: 'Ouvrir le coffre', icone: 'dossier', variante: 'discret', surClic: ouvrirCoffre }),
    h('span', { class: 'popup-raccourci' }, 'Remplir : ', h('kbd', null, 'Ctrl+Maj+L')),
  );
}

// ---------- Écrans ----------

function ecranAucunCoffre(): HTMLElement {
  return h(
    'section',
    { class: 'popup-centre' },
    h('p', null, 'Aucun coffre pour l’instant.'),
    h('p', { class: 'aide' }, 'Créez un coffre ou ouvrez un fichier .kdbx existant (KeePass, KeePassXC…).'),
    bouton({ texte: 'Créer ou ouvrir un coffre', variante: 'principal', classe: 'large', surClic: ouvrirCoffre }),
  );
}

function ecranVerrouille(etat: Extract<EtatCoffre, { state: 'verrouille' }>): HTMLElement {
  const mdp = champMotDePasse({ etiquette: 'Mot de passe maître', autocomplete: 'current-password', requis: true });
  const valider = bouton({ texte: 'Déverrouiller', variante: 'principal', type: 'submit', classe: 'large' });
  const formulaire = h(
    'form',
    { class: 'popup-centre' },
    h('p', null, 'Coffre verrouillé. Saisissez votre mot de passe maître.'),
    h('p', { class: 'popup-nom' }, etat.name, etat.fileName ? h('small', null, etat.fileName) : null),
    mdp.bloc,
    valider,
  );
  formulaire.addEventListener('submit', (ev) => {
    ev.preventDefault();
    valider.disabled = true;
    mdp.erreur('');
    backend.unlock(mdp.entree.value).then(
      () => undefined, // l'événement d'état redessine
      (e: unknown) => {
        valider.disabled = false;
        mdp.erreur(message(e));
        mdp.entree.select();
      },
    );
  });
  queueMicrotask(() => mdp.entree.focus());
  return formulaire;
}

function ligneEntree(e: EntrySummary, remplissable: boolean): HTMLElement {
  const copier = (quoi: 'identifiant' | 'password' | 'totp') => async () => {
    try {
      const { clipboardSeconds } = await backend.getSettings();
      if (quoi === 'identifiant') {
        await navigator.clipboard.writeText(e.username);
        toast('Identifiant copié');
      } else {
        await backend.copySecret(e.id, quoi);
        toast(quoi === 'totp' ? 'Code 2FA copié' : 'Mot de passe copié', { compteARebours: clipboardSeconds });
      }
    } catch (err) {
      toast(message(err));
    }
  };
  const remplir = async () => {
    try {
      await requete('fill/run', e.id);
      window.close();
    } catch (err) {
      toast(message(err), { duree: 4000 });
    }
  };
  return h(
    'li',
    { class: 'popup-entree' },
    monogramme(e.title || hote(e.url)),
    h('span', { class: 'popup-texte' }, e.title || hote(e.url), h('small', null, e.username || hote(e.url))),
    h(
      'span',
      { class: 'popup-actions' },
      e.username && bouton({ icone: 'copier', variante: 'discret', libelle: `Copier l’identifiant de ${e.title}`, surClic: copier('identifiant') }),
      bouton({ icone: 'cle', variante: 'discret', libelle: `Copier le mot de passe de ${e.title}`, surClic: copier('password') }),
      e.hasTotp && bouton({ icone: 'horloge', variante: 'discret', libelle: `Copier le code 2FA de ${e.title}`, surClic: copier('totp') }),
      remplissable && bouton({ texte: 'Remplir', variante: 'principal', classe: 'petit', surClic: () => void remplir() }),
    ),
  );
}

function liste(entrees: EntrySummary[], remplissables: Set<string>, vide: string): HTMLElement {
  if (entrees.length === 0) return h('p', { class: 'popup-vide' }, vide);
  return h('ul', { class: 'popup-liste' }, entrees.map((e) => ligneEntree(e, remplissables.has(e.id))));
}

function generateurRapide(): HTMLElement {
  const zone = h('div', { class: 'popup-genere' });
  let actuel = '';
  const tirer = () => {
    actuel = generatePassword({ length: 20, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: true });
    remplacer(zone, motDePasseColore(actuel));
  };
  tirer();
  return h(
    'section',
    { class: 'popup-bloc' },
    h('h2', null, 'Générateur rapide'),
    h(
      'div',
      { class: 'popup-ligne' },
      zone,
      bouton({ icone: 'de', variante: 'discret', libelle: 'Générer un autre mot de passe', surClic: tirer }),
      bouton({
        icone: 'copier',
        variante: 'discret',
        libelle: 'Copier le mot de passe généré',
        surClic: () => void navigator.clipboard.writeText(actuel).then(() => toast('Mot de passe généré copié')),
      }),
    ),
  );
}

function formulaireAjout(url: string, retour: () => void): HTMLElement {
  const origine = new URL(url).origin;
  const titre = champ({ etiquette: 'Nom', valeur: hote(url), requis: true });
  const ident = champ({ etiquette: 'Identifiant', autocomplete: 'off' });
  const mdp = champMotDePasse({ etiquette: 'Mot de passe', requis: true });
  mdp.entree.value = generatePassword({ length: 20, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: true });
  const f = h(
    'form',
    { class: 'popup-bloc' },
    h('h2', null, 'Ajouter pour ', h('span', { class: 'mono' }, origine)),
    titre.bloc,
    ident.bloc,
    mdp.bloc,
    h(
      'div',
      { class: 'popup-ligne' },
      bouton({ texte: 'Annuler', surClic: retour }),
      bouton({ texte: 'Enregistrer', variante: 'principal', type: 'submit' }),
    ),
  );
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void (async () => {
      try {
        const groupes = await backend.listGroups();
        const racineCoffre = groupes.find((g) => g.parentId === null);
        if (!racineCoffre) throw new Error('Groupe racine introuvable.');
        await backend.addEntry({
          groupId: racineCoffre.id,
          title: titre.entree.value.trim() || hote(url),
          username: ident.entree.value.trim(),
          password: mdp.entree.value,
          url: origine,
          notes: '',
          tags: [],
          fields: [],
        });
        toast('Entrée ajoutée');
        retour();
      } catch (e) {
        mdp.erreur(message(e));
      }
    })();
  });
  queueMicrotask(() => ident.entree.focus());
  return f;
}

async function ecranDeverrouille(): Promise<HTMLElement> {
  const contenu = h('div', { class: 'popup-contenu' });
  let candidats: Candidats = { url: null, entrees: [] };
  try {
    candidats = await requete<Candidats>('fill/candidates');
  } catch {
    // Onglet inaccessible (page interne du navigateur) : on affiche seulement la recherche.
  }
  const remplissables = new Set(candidats.entrees.map((e) => e.id));

  const recherche = champ({ etiquette: 'Rechercher dans le coffre', type: 'search', placeholder: 'Nom, identifiant, site…' });
  const resultats = h('div');

  const accueil = () => {
    remplacer(
      resultats,
      candidats.url
        ? h(
            'section',
            { class: 'popup-bloc' },
            h('h2', null, 'Pour ', h('span', { class: 'mono' }, new URL(candidats.url).origin)),
            liste(candidats.entrees, remplissables, 'Aucun compte enregistré pour cette adresse exacte.'),
            bouton({
              texte: 'Ajouter pour ce site',
              icone: 'plus',
              variante: 'discret',
              surClic: () => {
                const url = candidats.url;
                if (url) remplacer(resultats, formulaireAjout(url, () => void redessiner()));
              },
            }),
          )
        : h('p', { class: 'popup-vide' }, 'Cette page ne peut pas être remplie.'),
      generateurRapide(),
    );
  };

  let minuterie: ReturnType<typeof setTimeout> | undefined;
  recherche.entree.addEventListener('input', () => {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      const q = recherche.entree.value.trim();
      if (!q) return accueil();
      backend.search(q).then(
        (trouves) => remplacer(resultats, h('section', { class: 'popup-bloc' }, liste(trouves.slice(0, 30), remplissables, 'Aucun résultat.'))),
        (e: unknown) => toast(message(e)),
      );
    }, 120);
  });

  accueil();
  remplacer(contenu, recherche.bloc, resultats);
  queueMicrotask(() => recherche.entree.focus());
  return contenu;
}

// ---------- Dessin ----------

let dessinEnCours = 0;

async function redessiner(etat?: EtatCoffre): Promise<void> {
  const n = ++dessinEnCours;
  try {
    const e = etat ?? (await backend.status());
    const corps =
      e.state === 'aucun-coffre' ? ecranAucunCoffre() : e.state === 'verrouille' ? ecranVerrouille(e) : await ecranDeverrouille();
    if (n === dessinEnCours) remplacer(racine, barre(e), h('main', { class: 'popup-corps' }, corps), pied());
  } catch (e) {
    if (n === dessinEnCours) remplacer(racine, h('p', { class: 'popup-vide' }, icone('avertissement'), ' ', message(e)));
  }
}

backend.getSettings().then(
  (r) => {
    if (r.theme !== 'systeme') document.documentElement.dataset.theme = r.theme;
  },
  () => undefined,
);
backend.onChange((etat) => {
  // Un enregistrement automatique ne change pas l'écran ; un (dé)verrouillage, si.
  if (etat.state !== 'deverrouille' || racine.dataset.etat !== 'deverrouille') void redessiner(etat);
  racine.dataset.etat = etat.state;
});
void backend.status().then((e) => {
  racine.dataset.etat = e.state;
  return redessiner(e);
});
