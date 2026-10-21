// Le gardien : seul endroit où le coffre déverrouillé existe en mémoire.
// Il n'a accès qu'à chrome.runtime et n'accepte que les messages relayés par
// le service worker de l'extension.
import { echec, estMessageGardien, estServiceWorker, succes, versReponseErreur, type MessageGardien, type Reponse } from './messages';

async function traiter(message: MessageGardien): Promise<Reponse> {
  switch (message.type) {
    case 'vault/status':
      return succes({ state: 'aucun-coffre' });
    default:
      return echec('interne', `Pas encore disponible : ${message.type}`);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, repondre) => {
  if (!estMessageGardien(message)) return false;
  if (!estServiceWorker(sender, chrome.runtime.id, chrome.runtime.getURL(''))) {
    repondre(echec('refuse', 'Expéditeur non autorisé.'));
    return false;
  }
  traiter(message).then(repondre, (e: unknown) => repondre(versReponseErreur(e)));
  return true;
});
