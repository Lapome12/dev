// Captures de l'interface (étape 3.4) : 375, 768 et 1440 px, en clair et en sombre.
// Lancées seulement avec CAPTURES=<dossier>, par exemple :
//   CAPTURES=/mnt/project-files/gestionnaire-mdp/captures npx playwright test captures --project=bureau

import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const dossier = process.env.CAPTURES;
const LARGEURS = [375, 768, 1440] as const;
const THEMES = [['clair', 'light'], ['sombre', 'dark']] as const;

test.describe('captures', () => {
  test.skip(!dossier, 'CAPTURES non défini');
  test.skip(({ viewport }) => (viewport?.width ?? 0) <= 720, 'un seul projet suffit');

  for (const largeur of LARGEURS) {
    for (const [theme, schema] of THEMES) {
      test(`${largeur} px, ${theme}`, async ({ browser }) => {
        const ctx = await browser.newContext({
          viewport: { width: largeur, height: largeur < 720 ? 812 : 900 }, colorScheme: schema,
          deviceScaleFactor: largeur < 720 ? 2 : 1, hasTouch: largeur < 720,
        });
        const page = await ctx.newPage();
        const nom = (etape: string) => join(dossier!, `cadenas-${largeur}-${theme}-${etape}.png`);
        await page.goto('/demo.html');
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: nom('1-verrou') });
        await page.getByPlaceholder('Mot de passe maître').fill('demo');
        await page.getByRole('button', { name: 'Déverrouiller' }).click();
        await page.getByRole('option', { name: /Banque Démo/ }).click();
        await page.locator('.detail').getByRole('button', { name: 'Afficher le mot de passe' }).click();
        await expect(page.locator('.detail .totp .code')).toHaveText(/\d/);
        await page.screenshot({ path: nom('2-coffre') });
        await ctx.close();
      });
    }
  }
});
