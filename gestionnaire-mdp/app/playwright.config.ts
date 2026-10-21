import { defineConfig, devices } from '@playwright/test';

// Tests de bout en bout de l'interface, sur le build (npm run build -w app) servi par vite preview.
// En local, CADENAS_CHROMIUM peut désigner un Chromium déjà installé (comme pour l'extension).
const navigateur = process.env.CADENAS_CHROMIUM
  ? { launchOptions: { executablePath: process.env.CADENAS_CHROMIUM } }
  : { channel: 'chromium' as const };

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure', ...navigateur },
  webServer: { command: 'npx vite preview --port 4174 --strictPort', url: 'http://localhost:4174/demo.html', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'bureau', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'telephone', use: { ...devices['Pixel 7'], ...navigateur } },
  ],
});
