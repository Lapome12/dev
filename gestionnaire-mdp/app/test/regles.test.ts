import { describe, expect, it } from 'vitest';
import { maitreAcceptable } from '../src/ui/ecrans-entree';
import { normaliserTotp } from '../src/ui/editeur';
import { formaterCode } from '../src/ui/components';

describe('mot de passe maître (PLAN §E)', () => {
  it('refuse les mots de passe faibles', () => {
    expect(maitreAcceptable('')).toBe(false);
    expect(maitreAcceptable('Soleil2019')).toBe(false);
    expect(maitreAcceptable('azerty123')).toBe(false);
  });
  it('accepte une phrase de 5 mots ou un mot de passe fort', () => {
    expect(maitreAcceptable('tulipe orage cactus boussole hibou')).toBe(true);
    expect(maitreAcceptable('Vq7#tL2!mR9pZx4&kW')).toBe(true);
  });
});

describe('graine 2FA', () => {
  it('garde une URI otpauth valide et refuse une URI sans secret', () => {
    const uri = 'otpauth://totp/Demo:moi?secret=JBSWY3DPEHPK3PXP&issuer=Demo';
    expect(normaliserTotp(uri, 'x')).toBe(uri);
    expect(normaliserTotp('otpauth://totp/Demo', 'x')).toBeNull();
  });
  it('transforme une clé base32 nue en URI', () => {
    expect(normaliserTotp('jbsw y3dp ehpk 3pxp', 'Banque')).toBe('otpauth://totp/Banque?secret=JBSWY3DPEHPK3PXP&period=30&digits=6&algorithm=SHA1');
  });
  it('vide = pas de 2FA, texte quelconque = invalide', () => {
    expect(normaliserTotp('  ', 'x')).toBe('');
    expect(normaliserTotp('pas une clé !', 'x')).toBeNull();
  });
});

describe('affichage des codes', () => {
  it('coupe le code en deux groupes', () => {
    expect(formaterCode('482915')).toBe('482 915');
    expect(formaterCode('07319254')).toBe('0731 9254');
  });
});
