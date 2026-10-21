import { expect, test } from '@playwright/test';
import { action, deverrouillerDemo, erreursConsole, estTelephone, interdireReseau } from './outils';

test.describe('démo', () => {
  test('déverrouillage : refuse un mauvais mot de passe puis ouvre le coffre', async ({ page }) => {
    const externes = interdireReseau(page);
    const erreurs = erreursConsole(page);
    await page.goto('/demo.html');
    await expect(page.getByRole('heading', { name: 'Coffre verrouillé' })).toBeVisible();
    await expect(page.getByText('Démo : données fictives')).toBeVisible();
    await page.getByPlaceholder('Mot de passe maître').fill('faux');
    await page.getByRole('button', { name: 'Déverrouiller' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'incorrect' })).toBeVisible();
    await page.getByPlaceholder('Mot de passe maître').fill('demo');
    await page.getByRole('button', { name: 'Déverrouiller' }).click();
    await expect(page.getByRole('option')).toHaveCount(25);
    expect(externes).toEqual([]);
    expect(erreurs, erreurs.join('\n')).toEqual([]);
  });

  test('détail : mot de passe masqué, affiché, copie avec compte à rebours, code 2FA', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await deverrouillerDemo(page);
    await page.getByRole('option', { name: /Banque Démo/ }).click();
    const detail = page.locator('.detail');
    await expect(detail.getByText('masqué')).toBeAttached();
    await detail.getByRole('button', { name: 'Afficher le mot de passe' }).click();
    await expect(detail.locator('.mdp')).toHaveText('K8$wq!2Lr#Yz5Np3');
    await detail.getByRole('button', { name: 'Copier le mot de passe' }).click();
    await expect(page.getByRole('status')).toContainText('Effacé du presse-papiers dans');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('K8$wq!2Lr#Yz5Np3');
    await expect(detail.locator('.totp .code')).toHaveText(/^\d{3} \d{3}$/);
  });

  test('recherche insensible aux accents et santé du coffre', async ({ page }) => {
    await deverrouillerDemo(page);
    await page.getByRole('searchbox', { name: 'Rechercher' }).fill('energie');
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).toContainText('Énergie (démo)');
    await page.getByRole('searchbox', { name: 'Rechercher' }).fill('');
    await action(page, 'Santé');
    const sante = page.getByRole('dialog', { name: 'Santé du coffre' });
    await expect(sante.locator('.sante-score b')).toHaveText(/^\d+$/);
    await sante.getByRole('button', { name: /Mots de passe réutilisés/ }).click();
    await expect(page.getByRole('heading', { name: /Mots de passe réutilisés/ })).toBeVisible();
    expect(await page.getByRole('option').count()).toBeGreaterThan(1);
  });

  test('ajout d\'une entrée avec mot de passe généré, puis corbeille', async ({ page }) => {
    await deverrouillerDemo(page);
    await action(page, 'Ajouter');
    const form = page.locator('form.editeur');
    await form.getByLabel('Titre').fill('Nouveau site');
    await form.getByLabel('Identifiant').fill('moi@exemple.fr');
    await expect(form.getByLabel('Mot de passe', { exact: true })).not.toHaveValue('');
    await form.getByLabel('Code 2FA (clé secrète ou lien otpauth://)').fill('pas une clé');
    await form.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(form.getByText('Clé 2FA invalide')).toBeVisible();
    await form.getByLabel('Code 2FA (clé secrète ou lien otpauth://)').fill('JBSW Y3DP EHPK 3PXP');
    await form.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.locator('.detail h2')).toHaveText('Nouveau site');
    await expect(page.locator('.detail .totp .code')).toHaveText(/^\d{3} \d{3}$/);
    await page.locator('.detail').getByRole('button', { name: 'Mettre à la corbeille' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mettre à la corbeille' }).click();
    if (estTelephone(page)) await page.locator('.barre-bas').getByRole('button', { name: 'Groupes' }).click();
    await page.locator('.groupes').getByRole('button', { name: /Corbeille/ }).click();
    await expect(page.getByRole('option')).toHaveCount(1);
  });

  test('générateur : mot de passe et phrase de passe', async ({ page }) => {
    await deverrouillerDemo(page);
    await action(page, 'Générer');
    const gen = page.getByRole('dialog', { name: 'Générateur' });
    await expect(gen.locator('.sortie-mdp .mdp')).toHaveText(/^.{20}$/);
    await gen.getByRole('button', { name: 'Phrase de passe' }).click();
    await expect(gen.locator('.sortie-mdp .mdp')).toHaveText(/^[a-z0-9]+(-[a-z0-9]+){4}$/);
    await page.keyboard.press('Escape');
    await expect(gen).toBeHidden();
  });
});

test.describe('clavier (bureau)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) <= 720, 'raccourcis clavier : bureau');

  test('/, flèches, Ctrl+B, ?, Ctrl+L', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await deverrouillerDemo(page);
    await expect(page.getByRole('searchbox', { name: 'Rechercher' })).toBeFocused();
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { selected: true })).toContainText('Assurance habitation');
    await page.keyboard.press('Control+b');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('AH-778899');
    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox', { name: 'Rechercher' })).toBeFocused();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+?');
    await expect(page.getByRole('dialog', { name: 'Raccourcis clavier' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+l');
    await expect(page.getByRole('heading', { name: 'Coffre verrouillé' })).toBeVisible();
  });
});
