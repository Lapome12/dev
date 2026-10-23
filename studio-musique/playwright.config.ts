import { defineConfig } from '@playwright/test';

// Tests de bout en bout sur l'artefact réel (npm run build:artefact), servi par vite preview :
// on teste exactement le fichier livré, avec sa CSP. Les tests de rendu audio du moteur
// (test/engine/*.spec.ts, Dev 1) sont autonomes et tournent dans le même Chromium.
// En local, FREQUENCE_CHROMIUM peut désigner un Chromium déjà installé.
const navigateur = process.env.FREQUENCE_CHROMIUM
  ? { launchOptions: { executablePath: process.env.FREQUENCE_CHROMIUM } }
  : {};

export default defineConfig({
  testDir: '.',
  testMatch: ['e2e/**/*.spec.ts', 'test/engine/*.spec.ts'],
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4175', trace: 'retain-on-failure', viewport: { width: 1440, height: 900 }, ...navigateur },
  webServer: {
    command: 'npx vite preview --outDir dist/artefact --port 4175 --strictPort',
    url: 'http://localhost:4175/frequence.html',
    reuseExistingServer: !process.env.CI,
  },
});
