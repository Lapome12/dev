import { expect, test } from '@playwright/test';

// Étape 1.5 : l'artefact en un seul fichier démarre sous sa CSP, sans aucune requête réseau,
// et le Web Audio y produit du son.
test('l’artefact démarre sans requête réseau ni violation de CSP', async ({ page }) => {
  const requetes: string[] = [];
  const erreurs: string[] = [];
  page.on('request', r => { if (!r.url().endsWith('/frequence.html')) requetes.push(r.url()); });
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  page.on('pageerror', e => erreurs.push(e.message));
  await page.goto('/frequence.html');
  await expect(page.locator('#app')).not.toBeEmpty();
  await page.waitForTimeout(500);
  expect(requetes).toEqual([]);
  expect(erreurs).toEqual([]);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("default-src 'none'");
});

test('un bip rendu hors ligne n’est pas silencieux', async ({ page }) => {
  await page.goto('/frequence.html');
  const crete = await page.evaluate(async () => {
    const ctx = new OfflineAudioContext(1, 44100 / 4, 44100);
    const osc = new OscillatorNode(ctx, { frequency: 440 });
    const gain = new GainNode(ctx, { gain: 0.5 });
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    const rendu = await ctx.startRendering();
    return rendu.getChannelData(0).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  });
  expect(crete).toBeGreaterThan(0.4);
  expect(crete).toBeLessThanOrEqual(0.5001);
});
