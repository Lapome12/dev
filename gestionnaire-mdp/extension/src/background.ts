// Service worker de Cadenas. Il ne garde jamais le coffre (il est arrêté après
// ~30 s d'inactivité) : il contrôle les expéditeurs, réveille le gardien
// offscreen et lui relaie les demandes.
//
// Les réponses du gardien (y compris celles de getSecret) transitent par ici :
// le service worker ne les journalise JAMAIS, ne les met jamais en cache et ne
// les écrit nulle part. Il les remet telles quelles à la page qui a demandé.
import type { EntrySummary } from '@cadenas/core';
import { remplir, sonder, type RapportSonde } from './fill';
import type { Identifiants } from './gardien';
import { REGLAGES_DEFAUT, type Reglages } from './reglages';
import {
  echec,
  ErreurCadenas,
  estGardienPret,
  estRequete,
  METHODES_SECRETES,
  pageExpeditrice,
  secretAutorise,
  succes,
  versReponseErreur,
  type MessageGardien,
  type Reponse,
  type Requete,
  type TypeInterne,
} from './messages';

const URL_GARDIEN = 'offscreen.html';

let creationGardien: Promise<void> | null = null;

/** Le gardien existe-t-il déjà ? (sans le créer) */
async function gardienPresent(): Promise<boolean> {
  const existants = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(URL_GARDIEN)],
  });
  return existants.length > 0;
}

/** Le gardien annonce qu'il écoute (son module peut finir de charger après createDocument). */
function attendreGardienPret(): Promise<void> {
  return new Promise((resoudre) => {
    const fin = () => {
      chrome.runtime.onMessage.removeListener(ecoute);
      clearTimeout(delai);
      resoudre();
    };
    const ecoute = (m: unknown, sender: chrome.runtime.MessageSender) => {
      if (estGardienPret(m) && sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL(URL_GARDIEN)) fin();
      return false;
    };
    const delai = setTimeout(fin, 5000);
    chrome.runtime.onMessage.addListener(ecoute);
  });
}

/** Crée le document offscreen s'il n'existe pas encore (une extension n'en a qu'un). */
export async function assurerGardien(): Promise<void> {
  if (!(await gardienPresent())) {
    creationGardien ??= (async () => {
      const pret = attendreGardienPret();
      await chrome.offscreen.createDocument({
        url: URL_GARDIEN,
        reasons: [chrome.offscreen.Reason.CLIPBOARD],
        justification: 'Garder le coffre déverrouillé en mémoire et effacer le presse-papiers après une copie.',
      });
      await pret;
      // Un gardien neuf part des réglages par défaut : on lui donne ceux de l'utilisateur.
      await envoyer('interne/reglages', [await lireReglages()]);
    })().finally(() => {
      creationGardien = null;
    });
  }
  // Le document peut exister sans écouter encore : on attend la fin d'une création en cours.
  if (creationGardien) await creationGardien;
}

async function envoyer(type: MessageGardien['type'], args: unknown[], page?: MessageGardien['page']): Promise<Reponse> {
  const message: MessageGardien = { cible: 'gardien', type, args, ...(page ? { page } : {}) };
  // Juste après sa création, le gardien peut ne pas encore écouter (son module se charge) :
  // on réessaie brièvement plutôt que d'échouer.
  for (let essai = 0; ; essai++) {
    try {
      const reponse = (await chrome.runtime.sendMessage(message)) as Reponse | undefined;
      // Pas de réponse : seule une page a reçu le message, le gardien ne l'a pas traité.
      if (reponse !== undefined) return reponse;
      if (essai >= 40) return echec('interne', 'Le gardien ne répond pas.');
      await new Promise((r) => setTimeout(r, 50));
    } catch (e) {
      const absent = e instanceof Error && e.message.includes('Receiving end does not exist');
      if (!absent || essai >= 40) throw e;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

/** Envoie une demande au gardien (créé si besoin) et renvoie sa réponse telle quelle. */
export async function demanderAuGardien(
  type: MessageGardien['type'],
  args: unknown[],
  page?: MessageGardien['page'],
): Promise<Reponse> {
  await assurerGardien();
  return envoyer(type, args, page);
}

/** Demande interne, seulement si le gardien existe déjà (sinon le coffre est fermé de toute façon). */
async function siGardien(type: TypeInterne, args: unknown[] = []): Promise<Reponse | null> {
  if (!(await gardienPresent())) return null;
  return envoyer(type, args);
}

// --- Réglages : seul chrome.storage.local les contient (jamais de secret). ---

const CLE_REGLAGES = 'reglages';

function valider(r: Partial<Reglages>): Partial<Reglages> {
  const propre: Partial<Reglages> = {};
  if (typeof r.autoLockMinutes === 'number' && Number.isFinite(r.autoLockMinutes)) {
    propre.autoLockMinutes = Math.min(Math.max(Math.round(r.autoLockMinutes), 1), 240);
  }
  if (typeof r.clipboardSeconds === 'number' && Number.isFinite(r.clipboardSeconds)) {
    propre.clipboardSeconds = Math.min(Math.max(Math.round(r.clipboardSeconds), 5), 300);
  }
  if (r.theme === 'systeme' || r.theme === 'clair' || r.theme === 'sombre') propre.theme = r.theme;
  return propre;
}

export async function lireReglages(): Promise<Reglages> {
  const stocke = (await chrome.storage.local.get(CLE_REGLAGES))[CLE_REGLAGES] as Partial<Reglages> | undefined;
  return { ...REGLAGES_DEFAUT, ...valider(stocke ?? {}) };
}

async function ecrireReglages(modif: Partial<Reglages>): Promise<void> {
  const reglages = { ...(await lireReglages()), ...valider(modif) };
  await chrome.storage.local.set({ [CLE_REGLAGES]: reglages });
  await siGardien('interne/reglages', [reglages]);
}

// --- Traitement des requêtes des pages ---

async function traiter(requete: Requete, page: 'popup' | 'vault'): Promise<Reponse> {
  if (requete.type === 'fill/candidates') return succes(await candidats());
  if (requete.type === 'fill/run') {
    const onglet = await ongletActif();
    return succes(await remplirOnglet(onglet, String(requete.args[0])));
  }
  if (requete.type === 'vault/getSettings') return succes(await lireReglages());
  if (requete.type === 'vault/setSettings') {
    await ecrireReglages((requete.args[0] ?? {}) as Partial<Reglages>);
    return succes(null);
  }
  const methode = requete.type.slice(6);
  if ((METHODES_SECRETES as readonly string[]).includes(methode) && !secretAutorise(page, requete.args[1])) {
    return echec('refuse', 'Demande refusée.');
  }
  return demanderAuGardien(requete.type, requete.args, page);
}

chrome.runtime.onMessage.addListener((message: unknown, sender, repondre) => {
  // Les messages destinés au gardien (ou diffusés par lui) ne concernent pas le service worker.
  if (!estRequete(message)) return false;
  const page = pageExpeditrice(sender, chrome.runtime.id, chrome.runtime.getURL(''));
  if (page === null) {
    repondre(echec('refuse', 'Expéditeur non autorisé.'));
    return false;
  }
  traiter(message, page).then(repondre, (e: unknown) => repondre(versReponseErreur(e)));
  return true; // réponse asynchrone
});

// Aucune page web ne peut parler à l'extension (pas d'externally_connectable) ;
// on refuse quand même explicitement tout message externe.
chrome.runtime.onMessageExternal.addListener((_message, _sender, repondre) => {
  repondre(echec('refuse', 'Expéditeur non autorisé.'));
  return false;
});

// --- Verrouillage automatique ---

const ALARME = 'cadenas-tic';

function installerAlarmes(): void {
  void chrome.alarms.create(ALARME, { periodInMinutes: 0.5 });
  chrome.idle.setDetectionInterval(60);
}
chrome.runtime.onInstalled.addListener(installerAlarmes);
chrome.runtime.onStartup.addListener(installerAlarmes);

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name === ALARME) void siGardien('interne/tic').catch(() => undefined);
});

// Session du système verrouillée : on verrouille le coffre tout de suite.
chrome.idle.onStateChanged.addListener((etat) => {
  if (etat === 'locked') void siGardien('interne/verrouiller').catch(() => undefined);
});

// --- Remplissage (§E) : uniquement sur geste de l'utilisateur, origine exacte ---

/** Résultat d'une demande au gardien, ou exception portant son code. */
async function valeur<T>(r: Promise<Reponse>): Promise<T> {
  const reponse = await r;
  if (!reponse.ok) throw new ErreurCadenas(reponse.code, reponse.message);
  return reponse.value as T;
}

async function ongletActif(): Promise<chrome.tabs.Tab> {
  const [onglet] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!onglet?.id) throw new ErreurCadenas('refuse', 'Aucun onglet actif.');
  return onglet;
}

export interface Candidats {
  /** URL de l'onglet (connue grâce à activeTab, après le clic sur l'icône). */
  url: string | null;
  entrees: EntrySummary[];
}

/** Entrées qui correspondent à l'onglet actif (origine exacte, règles de core). */
async function candidats(): Promise<Candidats> {
  const onglet = await ongletActif();
  const url = onglet.url && /^https?:/.test(onglet.url) ? onglet.url : null;
  if (!url) return { url: null, entrees: [] };
  return { url, entrees: await valeur<EntrySummary[]>(demanderAuGardien('interne/candidats', [url])) };
}

/**
 * 1. Sonde tous les cadres de l'onglet (origine, champs visibles), sans rien modifier.
 * 2. Le gardien ne remet les identifiants que si la page principale correspond à l'entrée,
 *    et seulement pour les cadres dont l'origine correspond.
 * 3. On remplit ces cadres-là, par identifiant de document (pas de course avec une navigation).
 */
async function remplirOnglet(onglet: chrome.tabs.Tab, entryId: string): Promise<{ remplis: number }> {
  const tabId = onglet.id;
  if (tabId === undefined) throw new ErreurCadenas('refuse', 'Aucun onglet actif.');
  // Pages internes du navigateur, page d'erreur, magasin d'extensions : pas d'accès, donc refus.
  const sondes = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: sonder }).catch(() => {
    throw new ErreurCadenas('refuse', 'Cadenas ne peut pas remplir cette page.');
  });
  const cadres = sondes.filter(
    (r): r is chrome.scripting.InjectionResult<RapportSonde> => !!r.result && (r.result.motDePasse || r.result.identifiant),
  );
  if (cadres.length === 0) throw new ErreurCadenas('refuse', 'Aucun champ de connexion visible sur cette page.');

  // Cadre principal : sa sonde (frameId 0) donne l'URL réelle de la page, même sans champ.
  const principal = sondes.find((r) => r.frameId === 0)?.result as RapportSonde | undefined;
  if (!principal) throw new ErreurCadenas('refuse', 'Cadenas ne peut pas remplir cette page.');
  const ids = await valeur<Identifiants>(
    demanderAuGardien('interne/identifiants', [entryId, cadres.map((c) => c.result?.url ?? ''), principal.url]),
  );
  let remplis = 0;
  for (const cadre of cadres) {
    const rapport = cadre.result;
    if (!rapport || !ids.urls.includes(rapport.url)) continue;
    const [r] = await chrome.scripting.executeScript({
      target: { tabId, documentIds: [cadre.documentId] },
      func: remplir,
      args: [rapport.origine, ids.username, ids.password],
    });
    if (r?.result?.rempli) remplis++;
  }
  if (remplis === 0) throw new ErreurCadenas('refuse', 'Remplissage refusé : champ invisible, recouvert ou page modifiée.');
  return { remplis };
}

// Raccourci Ctrl+Maj+L : une seule entrée pour ce site, on remplit ; sinon on ouvre le popup.
chrome.commands.onCommand.addListener((commande, onglet) => {
  if (commande !== 'remplir') return;
  void (async () => {
    try {
      const { entrees } = await candidats();
      if (entrees.length === 1 && entrees[0] && onglet?.id !== undefined) {
        await remplirOnglet(onglet, entrees[0].id);
        return;
      }
    } catch {
      // Coffre verrouillé, page sans champ… : le popup expliquera.
    }
    await chrome.action.openPopup().catch(() => undefined);
  })();
});
