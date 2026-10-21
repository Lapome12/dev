import type { Page } from '@playwright/test';
import { appeler, coffreAvecEntree, expect, test } from './outils';

test.use({ distribution: 'dist-e2e' });

/** Lit le presse-papiers comme le ferait l'utilisateur : Ctrl+V dans une zone de texte vide. */
async function coller(page: Page): Promise<string> {
  await page.bringToFront();
  const zone = page.locator('#zone');
  await zone.fill('');
  await zone.focus();
  await page.keyboard.press('Control+V');
  return zone.inputValue();
}

test('copie le mot de passe puis l’efface après le délai réglé', async ({ contexte, extension, port }) => {
  test.setTimeout(60_000);
  const id = await coffreAvecEntree(extension, 'https://exemple.fr');
  expect(await appeler(extension, 'vault/setSettings', { clipboardSeconds: 5 })).toMatchObject({ ok: true });
  const page = await contexte.newPage();
  await page.goto(`http://exemple.test:${port}/coller.html`);

  expect(await appeler(extension, 'vault/copySecret', id, 'password')).toMatchObject({ ok: true });
  expect(await coller(page)).toBe('Mot-de-passe-fictif-42');
  await expect.poll(() => coller(page), { timeout: 10_000, intervals: [1000] }).toBe('');
});

test('le verrouillage efface aussi le presse-papiers', async ({ contexte, extension, port }) => {
  const id = await coffreAvecEntree(extension, 'https://exemple.fr');
  const page = await contexte.newPage();
  await page.goto(`http://exemple.test:${port}/coller.html`);
  await appeler(extension, 'vault/copySecret', id, 'password');
  expect(await coller(page)).toBe('Mot-de-passe-fictif-42');
  await appeler(extension, 'vault/lock');
  expect(await coller(page)).toBe('');
});
