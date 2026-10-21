import { expect, test } from './outils';

test('l’extension se charge et le popup obtient l’état du gardien', async ({ contexte, idExtension }) => {
  const page = await contexte.newPage();
  await page.goto(`chrome-extension://${idExtension}/popup.html`);
  await expect(page.locator('#popup')).toContainText('aucun-coffre');
});

test('le manifest respecte les permissions et la CSP du plan (§E)', async ({ contexte, idExtension }) => {
  const page = await contexte.newPage();
  await page.goto(`chrome-extension://${idExtension}/popup.html`);
  const manifest = await page.evaluate(() => chrome.runtime.getManifest());
  expect([...(manifest.permissions ?? [])].sort()).toEqual(
    ['activeTab', 'alarms', 'clipboardWrite', 'idle', 'offscreen', 'scripting', 'storage'].sort(),
  );
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.content_scripts).toBeUndefined();
  expect(manifest.web_accessible_resources).toBeUndefined();
  expect(manifest.externally_connectable).toBeUndefined();
  expect((manifest.content_security_policy as { extension_pages: string }).extension_pages).toBe(
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; img-src 'self' data:; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
});

test('une page web ne peut pas parler au gardien', async ({ contexte, idExtension }) => {
  const page = await contexte.newPage();
  await page.goto('data:text/html,<p>page web</p>');
  const accessible = await page.evaluate((id) => {
    const c = (globalThis as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome;
    return typeof c?.runtime?.sendMessage === 'function' && id.length > 0;
  }, idExtension);
  expect(accessible).toBe(false);
});

test('le gardien refuse un message qui ne vient pas du service worker', async ({ contexte, idExtension }) => {
  const page = await contexte.newPage();
  await page.goto(`chrome-extension://${idExtension}/popup.html`);
  await expect(page.locator('#popup')).toContainText('aucun-coffre'); // le gardien existe
  const reponse = await page.evaluate(() =>
    chrome.runtime.sendMessage({ cible: 'gardien', type: 'vault/status', args: [], page: 'vault' }),
  );
  expect(reponse).toEqual({ ok: false, code: 'refuse', message: 'Expéditeur non autorisé.' });
});
