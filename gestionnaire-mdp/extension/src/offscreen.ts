// Le gardien : seul endroit où le coffre déverrouillé existe en mémoire.
// Il n'a accès qu'à chrome.runtime et n'accepte que les messages relayés par
// le service worker de l'extension. La logique est dans gardien.ts.
import { calibrateKdf, Vault } from '@cadenas/core';
import { Gardien, type EtatCoffre } from './gardien';
import { echec, estMessageGardien, estServiceWorker, succes, versReponseErreur, type EvenementEtat, type EvenementGardienPret } from './messages';
import { stockageIndexedDB } from './storage';

/**
 * Copie dans le presse-papiers depuis le document offscreen (raison CLIPBOARD).
 * navigator.clipboard exige le focus, que ce document n'a jamais : on passe par
 * l'événement « copy », qui permet aussi d'écrire une chaîne vide pour effacer.
 */
function copier(texte: string): void {
  const zone = document.getElementById('presse-papiers') as HTMLTextAreaElement | null;
  const surCopie = (e: ClipboardEvent) => {
    e.clipboardData?.setData('text/plain', texte);
    e.preventDefault();
  };
  document.addEventListener('copy', surCopie);
  try {
    if (zone) {
      zone.value = ' ';
      zone.select();
    }
    document.execCommand('copy');
  } finally {
    document.removeEventListener('copy', surCopie);
    if (zone) zone.value = '';
  }
}

function diffuser(etat: EtatCoffre): void {
  const evenement: EvenementEtat = { evenement: 'etat', etat };
  // Aucune page ouverte : personne n'écoute, ce n'est pas une erreur.
  chrome.runtime.sendMessage(evenement).catch(() => undefined);
}

const gardien = new Gardien({
  coeur: {
    create: (nom, mdp, cle, kdf) => Vault.create(nom, mdp, cle, kdf),
    open: (octets, mdp, cle) => Vault.open(octets, mdp, cle),
    calibrateKdf: () => calibrateKdf(),
  },
  stockage: stockageIndexedDB,
  copier,
  diffuser,
  maintenant: () => Date.now(),
  programmer: (fn, ms) => setTimeout(fn, ms),
  annuler: (m) => clearTimeout(m as ReturnType<typeof setTimeout>),
});

// Le document offscreen n'a pas de limite de durée : une minuterie locale suffit
// pour le verrouillage automatique (l'alarme du service worker sert de secours).
setInterval(() => void gardien.tic(), 15_000);

chrome.runtime.onMessage.addListener((message: unknown, sender, repondre) => {
  if (!estMessageGardien(message)) return false;
  if (!estServiceWorker(sender, chrome.runtime.id, chrome.runtime.getURL(''))) {
    repondre(echec('refuse', 'Expéditeur non autorisé.'));
    return false;
  }
  gardien.traiter(message).then(
    (valeur) => repondre(succes(valeur ?? null)),
    (e: unknown) => repondre(versReponseErreur(e)),
  );
  return true;
});

const pret: EvenementGardienPret = { evenement: 'gardien-pret' };
chrome.runtime.sendMessage(pret).catch(() => undefined);
