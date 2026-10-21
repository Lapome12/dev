// Stockage local du coffre : IndexedDB ne contient que le fichier .kdbx CHIFFRÉ
// (tel qu'écrit par core), son nom, et la poignée vers le fichier sur le disque
// (API File System Access). Aucun secret en clair n'est jamais écrit ici.
//
// Le gardien (offscreen.html) et la page vault.html partagent cette base :
// ce sont des pages de la même extension, donc de la même origine.

export interface CoffreStocke {
  /** Le fichier .kdbx chiffré, octet pour octet. */
  octets: ArrayBuffer;
  /** Nom du coffre (affiché sur l'écran de déverrouillage). */
  nom: string;
  /** Nom du fichier sur le disque, s'il y en a un. */
  nomFichier?: string;
  /** Poignée vers le fichier sur le disque, pour y réécrire à chaque enregistrement. */
  poignee?: FileSystemFileHandle;
  /** Date du dernier enregistrement (ms epoch). */
  enregistre: number;
}

/** Ce dont le gardien a besoin ; une version en mémoire sert dans les tests. */
export interface Stockage {
  lire(): Promise<CoffreStocke | null>;
  ecrire(octets: ArrayBuffer, nom: string): Promise<void>;
  /** Réécrit le fichier sur le disque si la permission est déjà accordée. Vrai si c'est fait. */
  ecrireDansFichier(octets: ArrayBuffer): Promise<boolean>;
}

const BASE = 'cadenas';
const MAGASIN = 'coffre';
const CLE = 'courant';

function ouvrirBase(): Promise<IDBDatabase> {
  return new Promise((resoudre, rejeter) => {
    const req = indexedDB.open(BASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(MAGASIN);
    req.onsuccess = () => resoudre(req.result);
    req.onerror = () => rejeter(req.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (m: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const base = await ouvrirBase();
  try {
    return await new Promise<T>((resoudre, rejeter) => {
      const tx = base.transaction(MAGASIN, mode);
      const req = action(tx.objectStore(MAGASIN));
      tx.oncomplete = () => resoudre(req.result);
      tx.onerror = () => rejeter(tx.error);
      tx.onabort = () => rejeter(tx.error);
    });
  } finally {
    base.close();
  }
}

export async function lireCoffre(): Promise<CoffreStocke | null> {
  const v = await transaction('readonly', (m) => m.get(CLE) as IDBRequest<CoffreStocke | undefined>);
  return v ?? null;
}

async function remplacer(coffre: CoffreStocke): Promise<void> {
  await transaction('readwrite', (m) => m.put(coffre, CLE));
}

/** Enregistre une nouvelle version chiffrée en gardant le fichier associé. */
export async function ecrireCoffre(octets: ArrayBuffer, nom: string): Promise<void> {
  const actuel = await lireCoffre();
  await remplacer({ ...(actuel ?? {}), octets, nom, enregistre: Date.now() });
}

/** Remplace le coffre stocké par un fichier choisi sur le disque (vault.html). */
export async function importerCoffre(octets: ArrayBuffer, nomFichier: string, poignee?: FileSystemFileHandle): Promise<void> {
  const nom = nomFichier.replace(/\.kdbx$/i, '');
  await remplacer({ octets, nom, nomFichier, enregistre: Date.now(), ...(poignee ? { poignee } : {}) });
}

/** Associe un fichier sur le disque au coffre stocké (après « Enregistrer sous »). */
export async function associerFichier(poignee: FileSystemFileHandle): Promise<void> {
  const actuel = await lireCoffre();
  if (!actuel) throw new Error('Aucun coffre à associer.');
  await remplacer({ ...actuel, poignee, nomFichier: poignee.name });
}

export async function effacerCoffre(): Promise<void> {
  await transaction('readwrite', (m) => m.delete(CLE));
}

type PoigneeAvecPermission = FileSystemFileHandle & {
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
};

/** Écrit dans le fichier du disque, uniquement si la permission est déjà accordée (aucune demande). */
export async function ecrireDansFichier(octets: ArrayBuffer): Promise<boolean> {
  const coffre = await lireCoffre();
  const poignee = coffre?.poignee as PoigneeAvecPermission | undefined;
  if (!poignee?.queryPermission) return false;
  if ((await poignee.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
  const flux = await poignee.createWritable();
  await flux.write(octets);
  await flux.close();
  return true;
}

/** Demande la permission d'écrire (geste de l'utilisateur requis, dans vault.html). */
export async function demanderPermissionFichier(): Promise<boolean> {
  const coffre = await lireCoffre();
  const poignee = coffre?.poignee as PoigneeAvecPermission | undefined;
  if (!poignee?.requestPermission) return false;
  return (await poignee.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export const stockageIndexedDB: Stockage = {
  lire: lireCoffre,
  ecrire: ecrireCoffre,
  ecrireDansFichier,
};
