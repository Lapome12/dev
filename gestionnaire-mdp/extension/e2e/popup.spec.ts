import { appeler, coffreAvecEntree, expect, test } from './outils';

// Playwright ne voit pas le vrai popup (ouvert au-dessus de l'onglet) : on charge popup.html
// dans un onglet de 380 × 560. L'onglet actif est alors le popup lui-même, donc aucun site à
// remplir ; le remplissage est couvert par remplissage.spec.ts.
const CAPTURES = process.env.CADENAS_CAPTURES;

test('popup : déverrouiller, rechercher, copier, verrouiller', async ({ contexte, extension, idExtension }) => {
  test.setTimeout(60_000);
  await coffreAvecEntree(extension, 'https://exemple.fr');
  await appeler(extension, 'vault/lock');

  const popup = await contexte.newPage();
  await popup.setViewportSize({ width: 380, height: 560 });
  await popup.goto(`chrome-extension://${idExtension}/popup.html`);

  await expect(popup.getByText('Coffre verrouillé.')).toBeVisible();
  if (CAPTURES) await popup.screenshot({ path: `${CAPTURES}/popup-verrouille.png` });
  const mdp = popup.getByLabel('Mot de passe maître', { exact: true });
  await mdp.fill('mauvais mot de passe');
  await popup.getByRole('button', { name: 'Déverrouiller' }).click();
  await expect(popup.getByText('Mot de passe maître ou fichier clé incorrect.')).toBeVisible();
  await mdp.fill('cheval agrafe batterie correct fictif');
  await popup.getByRole('button', { name: 'Déverrouiller' }).click();

  await expect(popup.getByText('Cette page ne peut pas être remplie.')).toBeVisible();
  await expect(popup.getByText('Générateur rapide')).toBeVisible();
  await popup.getByLabel('Rechercher dans le coffre').fill('site');
  await expect(popup.getByText('Site de test')).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Remplir' })).toHaveCount(0); // pas pour ce site
  if (CAPTURES) await popup.screenshot({ path: `${CAPTURES}/popup-recherche.png` });

  await popup.getByRole('button', { name: 'Copier le mot de passe de Site de test' }).click();
  await expect(popup.getByText('Mot de passe copié')).toBeVisible();

  await popup.getByRole('button', { name: 'Verrouiller' }).click();
  await expect(popup.getByText('Coffre verrouillé.')).toBeVisible();
});

test('popup sans coffre : renvoie vers la page Coffre', async ({ contexte, idExtension }) => {
  const popup = await contexte.newPage();
  await popup.setViewportSize({ width: 380, height: 560 });
  await popup.goto(`chrome-extension://${idExtension}/popup.html`);
  await expect(popup.getByRole('button', { name: 'Créer ou ouvrir un coffre' })).toBeVisible();
  if (CAPTURES) await popup.screenshot({ path: `${CAPTURES}/popup-aucun.png` });
});
