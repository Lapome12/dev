import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = (chemin: string) => fileURLToPath(new URL(chemin, import.meta.url));

interface Options {
  /** 'dist' : l'extension livrée ; 'dist-e2e' : la même avec accès aux sites *.test. */
  distribution: 'dist' | 'dist-e2e';
}

interface Fixtures {
  contexte: BrowserContext;
  idExtension: string;
  /** Page de l'extension (popup.html ouvert dans un onglet) pour envoyer des requêtes. */
  extension: Page;
  /** Port du serveur des pages de test, joignable sous n'importe quel nom en *.test. */
  port: number;
}

/** Sert e2e/pages/<nom>.html ; le nom d'hôte (*.test) est libre, tout pointe ici. */
function serveurPages(): Promise<Server> {
  const serveur = createServer((req, res) => {
    const nom = (req.url ?? '/').split('?')[0]?.replace(/^\/+/, '') || 'connexion.html';
    if (!/^[a-z0-9-]+\.html$/.test(nom)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const port = (serveur.address() as AddressInfo).port;
      const html = readFileSync(join(ici('./pages'), nom), 'utf8').replaceAll('{{PORT}}', String(port));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => serveur.listen(0, '127.0.0.1', () => ok(serveur)));
}

export const test = base.extend<Fixtures & Options>({
  distribution: ['dist', { option: true }],
  port: async ({}, use) => {
    const serveur = await serveurPages();
    await use((serveur.address() as AddressInfo).port);
    serveur.close();
  },
  contexte: async ({ distribution, port: _port }, use) => {
    const dist = ici(`../${distribution}`);
    const profil = mkdtempSync(join(tmpdir(), 'cadenas-e2e-'));
    const contexte = await chromium.launchPersistentContext(profil, {
      // Le shell headless de Playwright ne charge pas les extensions : on prend le Chromium complet.
      ...(process.env.CADENAS_CHROMIUM ? { executablePath: process.env.CADENAS_CHROMIUM } : { channel: 'chromium' }),
      headless: true,
      args: [
        `--disable-extensions-except=${dist}`,
        `--load-extension=${dist}`,
        '--host-resolver-rules=MAP *.test 127.0.0.1',
      ],
    });
    await use(contexte);
    await contexte.close();
  },
  idExtension: async ({ contexte }, use) => {
    const sw = contexte.serviceWorkers()[0] ?? (await contexte.waitForEvent('serviceworker'));
    await use(new URL(sw.url()).host);
  },
  extension: async ({ contexte, idExtension }, use) => {
    const page = await contexte.newPage();
    await page.goto(`chrome-extension://${idExtension}/popup.html`);
    await use(page);
  },
});

/** Envoie une requête au service worker depuis une page de l'extension. */
export function appeler(page: Page, type: string, ...args: unknown[]): Promise<{ ok: boolean; value?: unknown; code?: string; message?: string }> {
  return page.evaluate(([type, args]) => chrome.runtime.sendMessage({ type, args }), [type, args] as const);
}

/** Crée un coffre de test et y ajoute une entrée fictive pour `url`. Renvoie son id. */
export async function coffreAvecEntree(page: Page, url: string): Promise<string> {
  const creer = await appeler(page, 'vault/create', 'Coffre de test', 'cheval agrafe batterie correct fictif');
  if (!creer.ok) throw new Error(`création : ${creer.message}`);
  const groupes = (await appeler(page, 'vault/listGroups')).value as { id: string; parentId: string | null }[];
  const racine = groupes.find((g) => g.parentId === null);
  const r = await appeler(page, 'vault/addEntry', {
    groupId: racine?.id,
    title: 'Site de test',
    username: 'demo@exemple.fr',
    password: 'Mot-de-passe-fictif-42',
    url,
    notes: '',
    tags: [],
    fields: [],
  });
  if (!r.ok) throw new Error(`ajout : ${r.message}`);
  return r.value as string;
}

export { expect } from '@playwright/test';
