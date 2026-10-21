// Stockage local de la version web : IndexedDB ne contient QUE le fichier .kdbx chiffré,
// la poignée du fichier sur disque (API File System Access) et les réglages. Jamais de secret en clair.

export interface FileHandleCompat {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: BufferSource | Blob): Promise<void>; close(): Promise<void> }>;
  queryPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export interface CoffreMemorise {
  nom: string;
  /** Nom du fichier sur disque (ex. personnel.kdbx). */
  fichier: string;
  /** Contenu chiffré du .kdbx, tel qu'écrit sur disque. */
  octets: ArrayBuffer;
  /** Poignée du fichier, si le navigateur la fournit (Chromium). */
  poignee?: FileHandleCompat;
  /** Le fichier sur disque est à jour par rapport à `octets`. */
  surDisque: boolean;
}

const BASE = 'cadenas';
const MAGASIN = 'donnees';

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resoudre, rejeter) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(MAGASIN); };
    r.onsuccess = () => resoudre(r.result);
    r.onerror = () => rejeter(r.error);
  });
}

async function operation<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await ouvrir();
  try {
    return await new Promise<T>((resoudre, rejeter) => {
      const t = db.transaction(MAGASIN, mode);
      const r = f(t.objectStore(MAGASIN));
      t.oncomplete = () => resoudre(r.result as T);
      t.onerror = () => rejeter(t.error);
      t.onabort = () => rejeter(t.error);
    });
  } finally {
    db.close();
  }
}

export const lire = <T>(cle: string): Promise<T | undefined> => operation<T | undefined>('readonly', s => s.get(cle));
export const ecrire = (cle: string, valeur: unknown): Promise<void> => operation<void>('readwrite', s => s.put(valeur, cle));
export const effacer = (cle: string): Promise<void> => operation<void>('readwrite', s => s.delete(cle));

export const CLE_COFFRE = 'coffre';
export const CLE_REGLAGES = 'reglages';

export const stockageDisponible = (): boolean => typeof indexedDB !== 'undefined';
