import { expect, test } from './outils';

// Données fictives uniquement.
const MDP = 'cheval agrafe batterie correct fictif';

test('créer, modifier, verrouiller et rouvrir un coffre ; rien en clair dans IndexedDB', async ({ contexte, idExtension }) => {
  test.setTimeout(120_000);
  const page = await contexte.newPage();
  await page.goto(`chrome-extension://${idExtension}/popup.html`);

  const appeler = (type: string, ...args: unknown[]) =>
    page.evaluate(([type, args]) => chrome.runtime.sendMessage({ type, args }), [type, args] as const);

  expect(await appeler('vault/status')).toEqual({ ok: true, value: { state: 'aucun-coffre' } });
  expect(await appeler('vault/create', 'Coffre de test', MDP)).toMatchObject({ ok: true });
  expect(await appeler('vault/status')).toMatchObject({ ok: true, value: { state: 'deverrouille', name: 'Coffre de test', dirty: false } });

  // Les opérations du modèle (2.1, Dev 1) ne sont pas encore livrées : on vérifie au moins le format de l'erreur.
  const liste = (await appeler('vault/listGroups')) as { ok: boolean };
  expect(typeof liste.ok).toBe('boolean');

  expect(await appeler('vault/lock')).toMatchObject({ ok: true });
  expect(await appeler('vault/status')).toEqual({ ok: true, value: { state: 'verrouille', name: 'Coffre de test' } });
  expect(await appeler('vault/listEntries', null)).toMatchObject({ ok: false, code: 'verrouille' });
  expect(await appeler('vault/unlock', 'mauvais mot de passe')).toMatchObject({ ok: false, code: 'mauvais-mot-de-passe' });
  expect(await appeler('vault/unlock', MDP)).toMatchObject({ ok: true });

  // IndexedDB ne contient que le .kdbx chiffré (signature KDBX) et jamais le mot de passe.
  const stocke = await page.evaluate(
    () =>
      new Promise<{ debut: number[]; contientMdp: boolean; nom: string }>((ok, ko) => {
        const req = indexedDB.open('cadenas');
        req.onerror = () => ko(req.error);
        req.onsuccess = () => {
          const get = req.result.transaction('coffre').objectStore('coffre').get('courant');
          get.onsuccess = () => {
            const v = get.result as { octets: ArrayBuffer; nom: string };
            const octets = new Uint8Array(v.octets);
            const texte = new TextDecoder('latin1').decode(octets);
            ok({ debut: [...octets.slice(0, 8)], contientMdp: texte.includes('cheval agrafe'), nom: v.nom });
          };
        };
      }),
  );
  expect(stocke.debut).toEqual([0x03, 0xd9, 0xa2, 0x9a, 0x67, 0xfb, 0x4b, 0xb5]);
  expect(stocke.contientMdp).toBe(false);
  expect(stocke.nom).toBe('Coffre de test');

  // chrome.storage ne contient que les réglages.
  expect(await appeler('vault/setSettings', { autoLockMinutes: 5, clipboardSeconds: 20 })).toMatchObject({ ok: true });
  const tout = await page.evaluate(() => chrome.storage.local.get(null));
  expect(Object.keys(tout)).toEqual(['reglages']);
  expect(tout.reglages).toEqual({ autoLockMinutes: 5, clipboardSeconds: 20, theme: 'systeme' });
});

test('le popup n’obtient pas la graine 2FA', async ({ contexte, idExtension }) => {
  const page = await contexte.newPage();
  await page.goto(`chrome-extension://${idExtension}/popup.html`);
  const r = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'vault/getSecret', args: ['x', { field: 'otp' }] }));
  expect(r).toMatchObject({ ok: false, code: 'refuse' });
});
