// Service worker de Cadenas. Il ne garde jamais le coffre (il est arrêté après
// ~30 s d'inactivité) : il contrôle les expéditeurs, réveille le gardien
// offscreen et lui relaie les demandes.
import {
  echec,
  estRequete,
  METHODES_SECRETES,
  pageExpeditrice,
  versReponseErreur,
  type MessageGardien,
  type Reponse,
  type Requete,
  type TypeInterne,
} from './messages';

const URL_GARDIEN = 'offscreen.html';

let creationGardien: Promise<void> | null = null;

/** Crée le document offscreen s'il n'existe pas encore (une extension n'en a qu'un). */
export async function assurerGardien(): Promise<void> {
  const url = chrome.runtime.getURL(URL_GARDIEN);
  const existants = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (existants.length > 0) return;
  creationGardien ??= chrome.offscreen
    .createDocument({
      url: URL_GARDIEN,
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: 'Garder le coffre déverrouillé en mémoire et effacer le presse-papiers après une copie.',
    })
    .finally(() => {
      creationGardien = null;
    });
  await creationGardien;
}

/** Envoie une demande au gardien et renvoie sa réponse telle quelle. */
export async function demanderAuGardien(
  type: MessageGardien['type'],
  args: unknown[],
  page?: MessageGardien['page'],
): Promise<Reponse> {
  await assurerGardien();
  const message: MessageGardien = { cible: 'gardien', type, args, ...(page ? { page } : {}) };
  const reponse = (await chrome.runtime.sendMessage(message)) as Reponse | undefined;
  return reponse ?? echec('interne', 'Le gardien ne répond pas.');
}

export function interne(type: TypeInterne, args: unknown[] = []): Promise<Reponse> {
  return demanderAuGardien(type, args);
}

async function traiter(requete: Requete, page: 'popup' | 'vault'): Promise<Reponse> {
  if (requete.type === 'fill/candidates' || requete.type === 'fill/run') {
    return echec('interne', 'Remplissage pas encore disponible.');
  }
  const methode = requete.type.slice(6);
  if ((METHODES_SECRETES as readonly string[]).includes(methode) && page !== 'vault' && page !== 'popup') {
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
