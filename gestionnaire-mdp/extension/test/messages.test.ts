import { describe, expect, it } from 'vitest';
import {
  base64VersOctets,
  estMessageGardien,
  estRequete,
  estServiceWorker,
  octetsVersBase64,
  pageExpeditrice,
  versReponseErreur,
} from '../src/messages';

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const BASE = `chrome-extension://${ID}/`;

describe('pageExpeditrice', () => {
  it('reconnaît le popup et la page coffre', () => {
    expect(pageExpeditrice({ id: ID, url: `${BASE}popup.html` }, ID, BASE)).toBe('popup');
    expect(pageExpeditrice({ id: ID, url: `${BASE}vault.html#/entree/1` }, ID, BASE)).toBe('vault');
  });

  it('refuse une autre extension, une page web ou une page inconnue', () => {
    expect(pageExpeditrice({ id: 'autre', url: `${BASE}popup.html` }, ID, BASE)).toBeNull();
    expect(pageExpeditrice({ id: ID, url: 'https://exemple.fr/popup.html' }, ID, BASE)).toBeNull();
    expect(pageExpeditrice({ id: ID, url: 'chrome-extension://autre/popup.html' }, ID, BASE)).toBeNull();
    expect(pageExpeditrice({ id: ID, url: `${BASE}offscreen.html` }, ID, BASE)).toBeNull();
    expect(pageExpeditrice({ id: ID }, ID, BASE)).toBeNull();
    expect(pageExpeditrice({ id: ID, url: 'pas une url' }, ID, BASE)).toBeNull();
  });
});

describe('estServiceWorker', () => {
  it('accepte seulement background.js de cette extension, hors onglet', () => {
    expect(estServiceWorker({ id: ID, url: `${BASE}background.js` }, ID, BASE)).toBe(true);
    expect(estServiceWorker({ id: ID, url: `${BASE}popup.html` }, ID, BASE)).toBe(false);
    expect(estServiceWorker({ id: 'autre', url: `${BASE}background.js` }, ID, BASE)).toBe(false);
    expect(estServiceWorker({ id: ID, url: `${BASE}background.js`, tab: { id: 1 } as chrome.tabs.Tab }, ID, BASE)).toBe(false);
  });
});

describe('formes des messages', () => {
  it('valide les requêtes du contrat §D.3', () => {
    expect(estRequete({ type: 'vault/status', args: [] })).toBe(true);
    expect(estRequete({ type: 'fill/run', args: ['id'] })).toBe(true);
    expect(estRequete({ type: 'vault/inexistant', args: [] })).toBe(false);
    expect(estRequete({ type: 'vault/status' })).toBe(false);
    expect(estRequete(null)).toBe(false);
    expect(estRequete({ cible: 'gardien', type: 'vault/status', args: [] })).toBe(false);
  });

  it('distingue les messages destinés au gardien', () => {
    expect(estMessageGardien({ cible: 'gardien', type: 'vault/lock', args: [] })).toBe(true);
    expect(estMessageGardien({ type: 'vault/lock', args: [] })).toBe(false);
  });
});

describe('utilitaires', () => {
  it('garde le code des erreurs du coffre', () => {
    const e = Object.assign(new Error('Mot de passe incorrect.'), { code: 'mauvais-mot-de-passe' });
    expect(versReponseErreur(e)).toEqual({ ok: false, code: 'mauvais-mot-de-passe', message: 'Mot de passe incorrect.' });
    expect(versReponseErreur(new Error('x'))).toMatchObject({ code: 'interne' });
  });

  it('encode les octets en base64 aller-retour', () => {
    const o = new Uint8Array(70_000).map((_, i) => i % 256);
    expect(base64VersOctets(octetsVersBase64(o))).toEqual(o);
  });
});
