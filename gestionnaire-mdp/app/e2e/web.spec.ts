import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { action, erreursConsole, interdireReseau } from './outils';

const MDP = 'tulipe orage cactus boussole hibou';

test.describe('version web (WebBackend)', () => {
  test.beforeEach(async ({ context }) => {
    // Sans File System Access : on vérifie le repli (sélecteur <input>, téléchargement).
    await context.addInitScript(() => {
      delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
      delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
    });
  });

  test('créer, ajouter, enregistrer, recharger et rouvrir le coffre', async ({ page }, info) => {
    test.slow(); // Argon2id calibré à ~1 s, plusieurs fois
    const externes = interdireReseau(page);
    const erreurs = erreursConsole(page);
    await page.goto('/index.html');
    await expect(page.getByRole('heading', { name: 'Bienvenue dans Cadenas' })).toBeVisible();
    await expect(page.getByText('mot de passe maître est')).toHaveCount(0); // l'indice n'existe que dans la démo

    await page.getByRole('button', { name: /Créer un coffre/ }).click();
    await page.getByLabel('Nom du coffre').fill('Essai web');
    await page.getByLabel('Mot de passe maître', { exact: true }).fill('Soleil2019');
    await page.getByLabel('Confirmez le mot de passe maître').fill('Soleil2019');
    await page.getByLabel(/aucune récupération n'est possible/).check();
    await page.getByRole('button', { name: 'Créer le coffre' }).click();
    await expect(page.getByText('Mot de passe maître trop faible')).toBeVisible();
    await page.getByLabel('Mot de passe maître', { exact: true }).fill(MDP);
    await page.getByLabel('Confirmez le mot de passe maître').fill(MDP);
    await page.getByRole('button', { name: 'Créer le coffre' }).click();
    await expect(page.locator('.coffre')).toBeVisible({ timeout: 30_000 });

    await action(page, 'Ajouter');
    await page.locator('form.editeur').getByLabel('Titre').fill('Site test');
    await page.locator('form.editeur').getByLabel('Identifiant').fill('moi@exemple.fr');
    await page.locator('form.editeur').getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.locator('.detail h2')).toHaveText('Site test');
    await expect(page.locator('.entree')).toHaveCount(1);

    // Sans File System Access, le coffre s'enregistre seul sur l'appareil (OPFS) : pas de bouton Enregistrer.
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeHidden({ timeout: 15_000 });
    await action(page, 'Réglages');
    const telechargement = page.waitForEvent('download');
    await page.getByRole('button', { name: /copie du coffre/ }).click();
    const fichier = await telechargement;
    expect(fichier.suggestedFilename()).toBe('essai-web.kdbx');
    const chemin = info.outputPath('essai-web.kdbx');
    await fichier.saveAs(chemin);
    // Signature KeePass 2.x (0x9AA2D903, 0xB54BFB67) en tête du fichier
    expect(readFileSync(chemin).subarray(0, 8).toString('hex')).toBe('03d9a29a67fb4bb5');
    expect(await page.evaluate(async () => {
      const d = await navigator.storage.getDirectory();
      return (await (await d.getFileHandle('essai-web.kdbx')).getFile()).size;
    })).toBeGreaterThan(100);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Coffre verrouillé' })).toBeVisible();
    await page.getByPlaceholder('Mot de passe maître').fill(MDP);
    await page.getByRole('button', { name: 'Déverrouiller' }).click();
    await expect(page.locator('.entree')).toHaveCount(1, { timeout: 30_000 });
    expect(externes).toEqual([]);
    expect(erreurs).toEqual([]);
  });

  test('changer le mot de passe maître exige le mot de passe actuel (4.4e)', async ({ page }) => {
    test.slow();
    const NOUVEAU = 'violon sable retard ampoule galet';
    const erreurs = erreursConsole(page);
    await page.goto('/index.html');
    await page.getByRole('button', { name: /Créer un coffre/ }).click();
    await page.getByLabel('Mot de passe maître', { exact: true }).fill(MDP);
    await page.getByLabel('Confirmez le mot de passe maître').fill(MDP);
    await page.getByLabel(/aucune récupération n'est possible/).check();
    await page.getByRole('button', { name: 'Créer le coffre' }).click();
    await expect(page.locator('.coffre')).toBeVisible({ timeout: 30_000 });

    const ouvrir = async () => {
      await action(page, 'Réglages');
      await page.getByRole('button', { name: /Changer le mot de passe maître/ }).click();
    };
    const remplir = async (actuel: string) => {
      const d = page.locator('dialog[open]');
      await d.getByLabel('Mot de passe maître actuel').fill(actuel);
      await d.getByLabel('Nouveau mot de passe maître').fill(NOUVEAU);
      await d.getByLabel('Confirmez le nouveau mot de passe').fill(NOUVEAU);
      await d.getByRole('button', { name: 'Changer la clé' }).click();
    };
    // Mot de passe actuel erroné : refus, rien n'est changé.
    await ouvrir();
    await remplir('pas le bon mot de passe');
    await expect(page.getByText('Mot de passe actuel ou fichier clé actuel incorrect')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+l');
    await page.getByPlaceholder('Mot de passe maître').fill(MDP);
    await page.getByRole('button', { name: 'Déverrouiller' }).click();
    await expect(page.locator('.coffre')).toBeVisible({ timeout: 30_000 });
    // Mot de passe actuel correct : la clé change.
    await ouvrir();
    await remplir(MDP);
    await expect(page.getByText('Clé du coffre changée')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Control+l');
    await page.getByPlaceholder('Mot de passe maître').fill(MDP);
    await page.getByRole('button', { name: 'Déverrouiller' }).click();
    await expect(page.getByText('Mot de passe maître ou fichier clé incorrect')).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder('Mot de passe maître').fill(NOUVEAU);
    await page.getByRole('button', { name: 'Déverrouiller' }).click();
    await expect(page.locator('.coffre')).toBeVisible({ timeout: 30_000 });
    expect(erreurs).toEqual([]);
  });
});
