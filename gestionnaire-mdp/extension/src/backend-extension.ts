// ExtensionBackend : l'implémentation de VaultBackend (contrat §D.2) utilisée
// par vault.html et popup.html. Chaque appel devient un message au service
// worker, qui le relaie au gardien. Les fichiers (ouvrir, enregistrer sous,
// exporter) se manipulent ici, car ils demandent un geste de l'utilisateur.
import type { VaultBackend } from '@cadenas/app/backend';
import type { EntryDetail, EntryInput, EntrySummary, GroupInfo, HealthReport, Id, SecretKind } from '@cadenas/core';
import type { CodeTotp, EtatCoffre } from './gardien';
import type { Reglages } from './reglages';
import { ErreurCadenas, estEvenementEtat, octetsVersBase64, type MethodeVault, type Reponse } from './messages';
import { associerFichier, demanderPermissionFichier, importerCoffre, lireCoffre } from './storage';

const TYPES_KDBX = [{ description: 'Coffre KeePass (KDBX)', accept: { 'application/octet-stream': ['.kdbx'] } }];

type FenetreFichiers = typeof globalThis & {
  showOpenFilePicker?(o: unknown): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(o: unknown): Promise<FileSystemFileHandle>;
};

function estAnnulation(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

async function envoyer<T>(methode: MethodeVault, ...args: unknown[]): Promise<T> {
  const r = (await chrome.runtime.sendMessage({ type: `vault/${methode}`, args })) as Reponse<T> | undefined;
  if (!r) throw new ErreurCadenas('interne', 'Cadenas ne répond pas. Rechargez la page.');
  if (!r.ok) throw new ErreurCadenas(r.code, r.message);
  return r.value;
}

const enBase64 = (o?: Uint8Array) => (o ? octetsVersBase64(o) : undefined);

export class ExtensionBackend implements VaultBackend {
  status(): Promise<EtatCoffre> {
    return envoyer('status');
  }

  async create(name: string, password: string, keyFile?: Uint8Array): Promise<void> {
    // On demande d'abord où enregistrer le fichier, tant que le clic de l'utilisateur
    // est récent (l'API l'exige). Annuler reste possible : le coffre vit alors dans
    // l'extension et pourra être exporté plus tard.
    let poignee: FileSystemFileHandle | undefined;
    const w = globalThis as FenetreFichiers;
    if (w.showSaveFilePicker) {
      try {
        poignee = await w.showSaveFilePicker({ suggestedName: `${name || 'Coffre'}.kdbx`, types: TYPES_KDBX });
      } catch (e) {
        if (!estAnnulation(e)) throw e;
      }
    }
    await envoyer('create', name, password, enBase64(keyFile));
    if (poignee) {
      await associerFichier(poignee);
      await this.#ecrireFichierSiBesoin(false);
    }
  }

  async openFile(): Promise<void> {
    const w = globalThis as FenetreFichiers;
    let fichier: File;
    let poignee: FileSystemFileHandle | undefined;
    try {
      if (w.showOpenFilePicker) {
        [poignee] = await w.showOpenFilePicker({ types: TYPES_KDBX, multiple: false });
        if (!poignee) return;
        fichier = await poignee.getFile();
      } else {
        const choisi = await choisirAvecInput();
        if (!choisi) return;
        fichier = choisi;
      }
    } catch (e) {
      if (estAnnulation(e)) return;
      throw e;
    }
    await importerCoffre(await fichier.arrayBuffer(), fichier.name, poignee);
    await envoyer('openFile');
  }

  unlock(password: string, keyFile?: Uint8Array): Promise<void> {
    return envoyer('unlock', password, enBase64(keyFile));
  }

  lock(): Promise<void> {
    return envoyer('lock');
  }

  async save(): Promise<void> {
    await this.#ecrireFichierSiBesoin(true);
  }

  /**
   * Le gardien enregistre (chiffré) et écrit le fichier s'il en a déjà la permission.
   * Sinon, et si `demander`, on demande la permission ici (geste de l'utilisateur)
   * puis on écrit nous-mêmes les octets chiffrés qu'il vient d'enregistrer.
   */
  async #ecrireFichierSiBesoin(demander: boolean): Promise<void> {
    const { fichierEcrit } = await envoyer<{ fichierEcrit: boolean }>('save');
    if (fichierEcrit) return;
    const coffre = await lireCoffre();
    if (!coffre?.poignee) return;
    const permis = await demanderPermissionFichier().catch(() => false);
    if (!permis && demander) throw new ErreurCadenas('refuse', 'Cadenas n’a pas l’autorisation d’écrire dans le fichier du coffre.');
    if (!permis) return;
    const flux = await coffre.poignee.createWritable();
    await flux.write(coffre.octets);
    await flux.close();
  }

  async exportFile(): Promise<void> {
    await envoyer('exportFile');
    const coffre = await lireCoffre();
    if (!coffre) throw new ErreurCadenas('introuvable', 'Aucun coffre à exporter.');
    const url = URL.createObjectURL(new Blob([coffre.octets], { type: 'application/octet-stream' }));
    try {
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = coffre.nomFichier ?? `${coffre.nom || 'Coffre'}.kdbx`;
      lien.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }

  listGroups(): Promise<GroupInfo[]> {
    return envoyer('listGroups');
  }
  listEntries(groupId?: Id): Promise<EntrySummary[]> {
    return envoyer('listEntries', groupId ?? null);
  }
  search(q: string): Promise<EntrySummary[]> {
    return envoyer('search', q);
  }
  getEntry(id: Id): Promise<EntryDetail> {
    return envoyer('getEntry', id);
  }
  getSecret(id: Id, kind: SecretKind): Promise<string> {
    return envoyer('getSecret', id, kind);
  }
  getTotp(id: Id): Promise<CodeTotp> {
    return envoyer('getTotp', id);
  }
  copySecret(id: Id, kind: SecretKind): Promise<void> {
    return envoyer('copySecret', id, kind);
  }
  addEntry(i: EntryInput): Promise<Id> {
    return envoyer('addEntry', i);
  }
  updateEntry(id: Id, i: EntryInput): Promise<void> {
    return envoyer('updateEntry', id, i);
  }
  deleteEntry(id: Id): Promise<void> {
    return envoyer('deleteEntry', id);
  }
  addGroup(name: string, parentId: Id | null): Promise<Id> {
    return envoyer('addGroup', name, parentId);
  }
  renameGroup(id: Id, n: string): Promise<void> {
    return envoyer('renameGroup', id, n);
  }
  deleteGroup(id: Id): Promise<void> {
    return envoyer('deleteGroup', id);
  }
  changeMasterKey(password: string, keyFile?: Uint8Array): Promise<void> {
    return envoyer('changeMasterKey', password, enBase64(keyFile));
  }
  health(): Promise<HealthReport> {
    return envoyer('health');
  }
  getSettings(): Promise<Reglages> {
    return envoyer('getSettings');
  }
  setSettings(s: Partial<Reglages>): Promise<void> {
    return envoyer('setSettings', s);
  }

  onChange(cb: (s: EtatCoffre) => void): () => void {
    const ecoute = (message: unknown) => {
      if (estEvenementEtat(message)) cb(message.etat as EtatCoffre);
      return false;
    };
    chrome.runtime.onMessage.addListener(ecoute);
    return () => chrome.runtime.onMessage.removeListener(ecoute);
  }
}

/** Repli sans File System Access : simple sélecteur de fichier. */
function choisirAvecInput(): Promise<File | null> {
  return new Promise((resoudre) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.kdbx';
    input.addEventListener('change', () => resoudre(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resoudre(null), { once: true });
    input.click();
  });
}
