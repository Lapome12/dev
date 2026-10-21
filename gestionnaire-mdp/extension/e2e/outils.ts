import { chromium, test as base, type BrowserContext, type Worker } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));

/** Contexte Chromium avec l'extension construite (npm run build) chargée. */
export const test = base.extend<{ contexte: BrowserContext; idExtension: string; serviceWorker: Worker }>({
  contexte: async ({}, use) => {
    const profil = mkdtempSync(join(tmpdir(), 'cadenas-e2e-'));
    const contexte = await chromium.launchPersistentContext(profil, {
      ...(process.env.CADENAS_CHROMIUM ? { executablePath: process.env.CADENAS_CHROMIUM } : {}),
      headless: true,
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    await use(contexte);
    await contexte.close();
  },
  serviceWorker: async ({ contexte }, use) => {
    const sw = contexte.serviceWorkers()[0] ?? (await contexte.waitForEvent('serviceworker'));
    await use(sw);
  },
  idExtension: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

export { expect } from '@playwright/test';
