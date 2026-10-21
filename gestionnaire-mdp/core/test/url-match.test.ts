import { describe, expect, it } from 'vitest';
import { originMatches } from '../src/index';

describe('originMatches (mode strict)', () => {
  const ok: [string, string][] = [
    ['https://exemple.fr', 'https://exemple.fr/connexion?x=1#y'],
    ['https://exemple.fr/chemin', 'https://exemple.fr/autre'],
    ['exemple.fr', 'https://exemple.fr/'],
    ['HTTPS://EXEMPLE.FR', 'https://exemple.fr'],
    ['https://exemple.fr:443', 'https://exemple.fr'],
    ['http://exemple.fr', 'https://exemple.fr'], // montée en https acceptée
    ['http://exemple.fr', 'http://exemple.fr'],
    ['https://exemple.fr:8443', 'https://exemple.fr:8443/x'],
    ['https://café.fr', 'https://xn--caf-dma.fr/'], // IDN normalisé en punycode
    ['https://exemple.fr.', 'https://exemple.fr'],
  ];
  const refused: [string, string, string][] = [
    ['https://exemple.fr', 'http://exemple.fr', 'https enregistré, page en http'],
    ['https://exemple.fr', 'https://compte.exemple.fr', 'sous-domaine en mode strict'],
    ['https://compte.exemple.fr', 'https://exemple.fr', 'domaine parent'],
    ['https://paypal.com', 'https://paypa1.com', 'domaine sosie'],
    ['https://exemple.fr', 'https://exemple.fr.attaquant.com', 'suffixe trompeur'],
    ['https://exemple.fr', 'https://attaquant-exemple.fr', 'préfixe trompeur'],
    ['https://exemple.fr', 'https://exemple.fr:8443', 'port différent'],
    ['http://exemple.fr:8080', 'https://exemple.fr', 'port explicite différent'],
    ['https://раураl.com', 'https://paypal.com', 'homoglyphes cyrilliques'],
    ['https://exemple.fr', 'https://user:pass@exemple.fr', 'identifiants dans l’URL'],
    ['https://exemple.fr', 'javascript:alert(1)', 'schéma javascript'],
    ['https://exemple.fr', 'file:///etc/passwd', 'schéma file'],
    ['ftp://exemple.fr', 'ftp://exemple.fr', 'schéma non web'],
    ['', 'https://exemple.fr', 'URL vide'],
    ['https://exemple.fr', 'pas une url', 'page invalide'],
  ];
  it.each(ok)('%s → %s accepté', (e, p) => expect(originMatches(e, p)).toBe(true));
  it.each(refused)('%s → %s refusé (%s)', (e, p) => expect(originMatches(e, p)).toBe(false));
});

describe('originMatches (mode sous-domaines)', () => {
  it('accepte les sous-domaines d’un domaine enregistrable', () => {
    expect(originMatches('https://exemple.fr', 'https://compte.exemple.fr', 'sous-domaines')).toBe(true);
    expect(originMatches('https://exemple.fr', 'https://a.b.exemple.fr', 'sous-domaines')).toBe(true);
    expect(originMatches('https://banque.co.uk', 'https://www.banque.co.uk', 'sous-domaines')).toBe(true);
  });
  it('refuse quand l’entrée est un suffixe public ou une IP', () => {
    expect(originMatches('https://github.io', 'https://attaquant.github.io', 'sous-domaines')).toBe(false);
    expect(originMatches('https://co.uk', 'https://banque.co.uk', 'sous-domaines')).toBe(false);
    expect(originMatches('https://fr', 'https://exemple.fr', 'sous-domaines')).toBe(false);
    expect(originMatches('https://1.2.3.4', 'https://5.1.2.3.4', 'sous-domaines')).toBe(false);
  });
  it('un site github.io n’ouvre pas ses voisins', () => {
    expect(originMatches('https://moi.github.io', 'https://autre.github.io', 'sous-domaines')).toBe(false);
  });
  it('garde les règles de schéma et de port', () => {
    expect(originMatches('https://exemple.fr', 'http://compte.exemple.fr', 'sous-domaines')).toBe(false);
    expect(originMatches('https://exemple.fr', 'https://compte.exemple.fr:8443', 'sous-domaines')).toBe(false);
    expect(originMatches('https://exemple.fr', 'https://compteexemple.fr', 'sous-domaines')).toBe(false);
  });
});
