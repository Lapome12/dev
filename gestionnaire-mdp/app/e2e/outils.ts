import { expect, type Page } from '@playwright/test';

/** Échoue si la page tente de joindre autre chose qu'elle-même (aucune requête réseau, §E). */
export function interdireReseau(page: Page): string[] {
  const externes: string[] = [];
  page.on('request', r => {
    const u = new URL(r.url());
    if (!['blob:', 'data:'].includes(u.protocol) && u.host !== 'localhost:4174') externes.push(r.url());
  });
  return externes;
}

export function erreursConsole(page: Page): string[] {
  const erreurs: string[] = [];
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  page.on('pageerror', e => erreurs.push(e.message));
  return erreurs;
}

export const estTelephone = (page: Page): boolean => (page.viewportSize()?.width ?? 1440) <= 720;

export async function deverrouillerDemo(page: Page): Promise<void> {
  await page.goto('/demo.html');
  await page.getByPlaceholder('Mot de passe maître').fill('demo');
  await page.getByRole('button', { name: 'Déverrouiller' }).click();
  await expect(page.locator('.coffre')).toBeVisible();
}

/** Action de la barre du haut (bureau) ou de la barre du bas (téléphone). */
export async function action(page: Page, nom: 'Générer' | 'Santé' | 'Réglages' | 'Ajouter'): Promise<void> {
  if (estTelephone(page)) { await page.locator('.barre-bas').getByRole('button', { name: nom }).click(); return; }
  const libelles = { Générer: 'Générer', Santé: 'Santé du coffre', Réglages: 'Réglages', Ajouter: 'Nouvelle entrée' } as const;
  await page.locator('.coffre').getByRole('button', { name: libelles[nom], exact: true }).first().click();
}
