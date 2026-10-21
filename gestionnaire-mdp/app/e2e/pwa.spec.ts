// PWA « Cadenas Mobile » (étape 3.8) : manifeste, hors ligne, verrouillage en arrière-plan.
// Émulation Pixel 7 et iPhone 15 (moteur Chromium : seul installé en CI).

import { devices, expect, test } from '@playwright/test';

const MDP = 'tulipe orage cactus boussole hibou';

for (const appareil of ['Pixel 7', 'iPhone 15'] as const) {
  test.describe(appareil, () => {
    const { defaultBrowserType: _moteur, ...profil } = devices[appareil];
    test.use(profil);

    test('manifeste installable et fonctionnement hors ligne', async ({ page, context, request }) => {
      const manifeste = await (await request.get('/manifest.webmanifest')).json();
      expect(manifeste).toMatchObject({ name: 'Cadenas', display: 'standalone', lang: 'fr' });
      expect(manifeste.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
      expect(manifeste.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);

      await page.goto('/index.html');
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload(); // la page est maintenant contrôlée par le service worker
      expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      const origines = await page.evaluate(async (): Promise<string[]> => {
        const c = await caches.open((await caches.keys())[0]!);
        return (await c.keys()).map(r => new URL(r.url).origin);
      });
      expect(new Set(origines)).toEqual(new Set([new URL(page.url()).origin])); // uniquement nos fichiers

      await context.setOffline(true);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Bienvenue dans Cadenas' })).toBeVisible();
      await context.setOffline(false);
    });

    test('version tactile : cibles de 44 px, barre du bas, verrouillage en arrière-plan', async ({ page, context }) => {
      test.slow();
      await context.addInitScript(() => { delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker; });
      await page.goto('/index.html');
      await page.getByRole('button', { name: /Créer un coffre/ }).click();
      await page.getByLabel('Mot de passe maître', { exact: true }).fill(MDP);
      await page.getByLabel('Confirmez le mot de passe maître').fill(MDP);
      await page.getByLabel(/aucune récupération n'est possible/).check();
      await page.getByRole('button', { name: 'Créer le coffre' }).click();
      const barre = page.locator('.barre-bas');
      await expect(barre).toBeVisible({ timeout: 30_000 });
      for (const b of await barre.getByRole('button').all()) {
        const r = (await b.boundingBox())!;
        expect(r.height).toBeGreaterThanOrEqual(44);
      }
      const pied = (await barre.boundingBox())!;
      expect(pied.y + pied.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
      // L'appli passe en arrière-plan : le coffre se verrouille.
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect(page.getByRole('heading', { name: 'Coffre verrouillé' })).toBeVisible();
    });
  });
}
