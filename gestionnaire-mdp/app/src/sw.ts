// Service worker de Cadenas Mobile (étape 3.8). Il ne met en cache QUE les fichiers de
// l'application (liste injectée au build) et ne contacte jamais un autre site :
// toute requête vers une autre origine est laissée au navigateur, qui la bloque par la CSP.
// Le coffre n'est jamais dans ce cache : il vit chiffré dans IndexedDB / OPFS.

/// <reference lib="webworker" />
export {};
declare const self: ServiceWorkerGlobalScope;
declare const FICHIERS: string[]; // injecté par le build (vite.config.ts)
declare const VERSION: string;

const CACHE = `cadenas-${VERSION}`;

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)));
  // Pas de skipWaiting automatique : la page annonce la mise à jour et l'utilisateur choisit.
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    for (const nom of await caches.keys()) if (nom.startsWith('cadenas-') && nom !== CACHE) await caches.delete(nom);
    await self.clients.claim();
  })());
});

self.addEventListener('message', ev => {
  if (ev.data === 'activer') void self.skipWaiting();
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const trouve = await cache.match(req, { ignoreSearch: true, ignoreVary: true }) // « Vary: Origin » des serveurs : les modules crossorigin ne correspondraient pas
      ?? (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    return trouve ?? fetch(req);
  })());
});
