// Sauvegarde automatique dans IndexedDB (étape 2.7), au plus une fois toutes les 2 s.
// Le projet et les échantillons sont rangés séparément : un échantillon n'est écrit qu'une fois.
import type { Id, Project } from './types';
import { sanitizeProject } from './validate';
import { migrate } from './serialize';

export const AUTOSAVE_INTERVAL_MS = 2000;

export interface KeyValueBackend {
  get(store: 'projet' | 'sons', key: string): Promise<unknown>;
  put(store: 'projet' | 'sons', key: string, value: unknown): Promise<void>;
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

export function indexedDbBackend(name = 'frequence'): KeyValueBackend {
  let db: Promise<IDBDatabase> | null = null;
  const open = () => db ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('projet'); r.result.createObjectStore('sons'); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { db = null; reject(r.error); };
  });
  return {
    async get(store, key) { return request((await open()).transaction(store).objectStore(store).get(key)); },
    async put(store, key, value) {
      const tx = (await open()).transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    },
  };
}

export interface Autosaver {
  autosave(p: Project): void;
  storeSample(id: Id, data: ArrayBuffer): Promise<void>;
  flush(): Promise<void>;
  restore(): Promise<{ project: Project; samples: Map<Id, ArrayBuffer> } | null>;
}

export function createAutosaver(backend: KeyValueBackend, now = () => Date.now()): Autosaver {
  let pending: Project | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = -Infinity;
  let writing: Promise<void> = Promise.resolve();

  const write = () => {
    timer = null;
    const p = pending;
    pending = null;
    if (!p) return writing;
    last = now();
    writing = writing.then(() => backend.put('projet', 'courant', p)).catch(e => { console.warn('Sauvegarde automatique impossible', e); });
    return writing;
  };

  return {
    autosave(p) {
      pending = p;
      if (timer) return;
      const wait = Math.max(0, last + AUTOSAVE_INTERVAL_MS - now());
      timer = setTimeout(write, wait);
    },
    async storeSample(id, data) {
      try { await backend.put('sons', id, data); } catch (e) { console.warn('Son non sauvegardé', e); }
    },
    async flush() {
      if (timer) clearTimeout(timer);
      await write();
    },
    async restore() {
      let raw: unknown;
      try { raw = await backend.get('projet', 'courant'); } catch { return null; }
      if (raw === undefined || raw === null) return null;
      let project: Project;
      try { project = sanitizeProject(migrate(raw)); } catch { return null; }
      const samples = new Map<Id, ArrayBuffer>();
      for (const ref of project.samples) {
        const data = await backend.get('sons', ref.id).catch(() => undefined);
        if (data instanceof ArrayBuffer) samples.set(ref.id, data);
      }
      return { project, samples };
    },
  };
}

let shared: Autosaver | null = null;
const autosaver = () => shared ??= createAutosaver(indexedDbBackend());

/** §D.4 : sauvegarde le projet dans IndexedDB, au plus une fois toutes les 2 s. */
export function autosave(p: Project): void { autosaver().autosave(p); }
/** À appeler à l'import d'un son, pour qu'il survive au rechargement. */
export function autosaveSample(id: Id, data: ArrayBuffer): Promise<void> { return autosaver().storeSample(id, data); }
/** Écrit tout de suite la dernière version (fermeture de l'onglet). */
export function flushAutosave(): Promise<void> { return autosaver().flush(); }
export function restoreAutosave(): Promise<{ project: Project; samples: Map<Id, ArrayBuffer> } | null> { return autosaver().restore(); }
