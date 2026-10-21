import { coffreAvecEntree, expect, test } from './outils';

test('vault.html monte l’interface sans violation de CSP', async ({ contexte, idExtension, extension }) => {
  await coffreAvecEntree(extension, 'https://exemple.fr');
  const page = await contexte.newPage();
  const erreurs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text());
  });
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(`chrome-extension://${idExtension}/vault.html`);
  await expect(page.getByText('Site de test').first()).toBeVisible({ timeout: 15_000 });
  expect(erreurs).toEqual([]);
});
