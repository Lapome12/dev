import type { Page } from '@playwright/test';
import { appeler, coffreAvecEntree, expect, test } from './outils';

// Build de test : mêmes fichiers que l'extension livrée, plus l'accès aux sites *.test.
test.use({ distribution: 'dist-e2e' });
test.setTimeout(60_000);

async function ouvrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.bringToFront(); // l'onglet visé devient l'onglet actif
}

const valeurs = (page: Page) =>
  page.evaluate(() => ({
    u: (document.getElementById('u') as HTMLInputElement | null)?.value ?? '',
    p: (document.getElementById('p') as HTMLInputElement | null)?.value ?? '',
  }));

test('remplit un formulaire de connexion sur le bon site, événements compris', async ({ contexte, extension, port }) => {
  const id = await coffreAvecEntree(extension, `http://exemple.test:${port}`);
  const site = await contexte.newPage();
  await ouvrir(site, `http://exemple.test:${port}/connexion.html`);

  const candidats = await appeler(extension, 'fill/candidates');
  expect(candidats).toMatchObject({ ok: true, value: { entrees: [{ id, title: 'Site de test' }] } });

  expect(await appeler(extension, 'fill/run', id)).toEqual({ ok: true, value: { remplis: 1 } });
  expect(await valeurs(site)).toEqual({ u: 'demo@exemple.fr', p: 'Mot-de-passe-fictif-42' });
  expect(await site.evaluate(() => (window as unknown as { recu: unknown }).recu)).toEqual({
    u: 'demo@exemple.fr',
    p: 'Mot-de-passe-fictif-42',
  });
});

test('remplit une iframe de la même origine', async ({ contexte, extension, port }) => {
  const id = await coffreAvecEntree(extension, `http://exemple.test:${port}`);
  const site = await contexte.newPage();
  await ouvrir(site, `http://exemple.test:${port}/iframe-meme.html`);
  await site.frameLocator('#cadre').locator('#p').waitFor();
  expect(await appeler(extension, 'fill/run', id)).toEqual({ ok: true, value: { remplis: 1 } });
  await expect(site.frameLocator('#cadre').locator('#p')).toHaveValue('Mot-de-passe-fictif-42');
});

test.describe('pages piégées : rien n’est rempli', () => {
  const pieges: { nom: string; entree: (port: number) => string; page: (port: number) => string }[] = [
    { nom: 'formulaire invisible', entree: (p) => `http://exemple.test:${p}`, page: (p) => `http://exemple.test:${p}/invisible.html` },
    { nom: 'champ recouvert', entree: (p) => `http://exemple.test:${p}`, page: (p) => `http://exemple.test:${p}/recouvert.html` },
    { nom: 'sous-domaine', entree: (p) => `http://exemple.test:${p}`, page: (p) => `http://connexion.exemple.test:${p}/connexion.html` },
    { nom: 'http au lieu de https', entree: (p) => `https://exemple.test:${p}`, page: (p) => `http://exemple.test:${p}/connexion.html` },
    { nom: 'domaine sosie', entree: (p) => `http://exemple.test:${p}`, page: (p) => `http://exemp1e.test:${p}/connexion.html` },
    { nom: 'autre port', entree: (p) => `http://exemple.test:${p}`, page: (p) => `http://exemple.test:${p + 1}/connexion.html` },
  ];

  for (const piege of pieges) {
    test(piege.nom, async ({ contexte, extension, port }) => {
      const id = await coffreAvecEntree(extension, piege.entree(port));
      const site = await contexte.newPage();
      await ouvrir(site, piege.page(port)).catch(() => undefined); // l'autre port ne répond pas
      const r = await appeler(extension, 'fill/run', id);
      expect(r).toMatchObject({ ok: false, code: 'refuse' });
      if (piege.nom !== 'autre port') expect(await valeurs(site)).toEqual({ u: '', p: '' });
    });
  }

  test('iframe d’une autre origine', async ({ contexte, extension, port }) => {
    const id = await coffreAvecEntree(extension, `http://exemple.test:${port}`);
    const site = await contexte.newPage();
    await ouvrir(site, `http://exemple.test:${port}/iframe-autre.html`);
    await site.frameLocator('#cadre').locator('#p').waitFor();
    expect(await appeler(extension, 'fill/run', id)).toMatchObject({ ok: false, code: 'refuse' });
    await expect(site.frameLocator('#cadre').locator('#p')).toHaveValue('');
  });

  test('l’entrée d’un site n’est jamais proposée ailleurs', async ({ contexte, extension, port }) => {
    await coffreAvecEntree(extension, `http://exemple.test:${port}`);
    const site = await contexte.newPage();
    await ouvrir(site, `http://exemp1e.test:${port}/connexion.html`);
    expect(await appeler(extension, 'fill/candidates')).toMatchObject({ ok: true, value: { entrees: [] } });
  });
});

test('coffre verrouillé : remplissage refusé', async ({ contexte, extension, port }) => {
  const id = await coffreAvecEntree(extension, `http://exemple.test:${port}`);
  await appeler(extension, 'vault/lock');
  const site = await contexte.newPage();
  await ouvrir(site, `http://exemple.test:${port}/connexion.html`);
  expect(await appeler(extension, 'fill/run', id)).toMatchObject({ ok: false, code: 'verrouille' });
  expect(await valeurs(site)).toEqual({ u: '', p: '' });
});
