import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crc32, isZip, unzipStored, zipStored } from '../../src/project/zip';
import { preparerTelechargement, telecharger } from '../../src/ui/services';

const octets = (s: string) => new TextEncoder().encode(s);
const aUnzip = (() => { try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe('zip sans compression', () => {
  it('calcule le CRC-32 standard', () => {
    expect(crc32(octets('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('relit ce qu’il écrit, noms accentués compris', () => {
    const son = new Uint8Array(70_000).map((_, i) => (i * 31) & 0xff);
    const zip = zipStored([{ name: 'Premier jet.frequence', data: octets('{"a":1}') }, { name: 'Mélodie - été.wav', data: son }]);
    expect(isZip(zip)).toBe(true);
    const relu = unzipStored(zip);
    expect(relu.map(e => e.name)).toEqual(['Premier jet.frequence', 'Mélodie - été.wav']);
    expect(new TextDecoder().decode(relu[0]!.data)).toBe('{"a":1}');
    expect(relu[1]!.data).toEqual(son);
  });

  it.skipIf(!aUnzip)('s’ouvre avec unzip, contenu et CRC vérifiés', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'frequence-zip-'));
    try {
      const data = new Uint8Array(5000).map((_, i) => (i * 7) & 0xff);
      writeFileSync(join(dossier, 'a.zip'), zipStored([{ name: 'Mon morceau.wav', data }]));
      execFileSync('unzip', ['-t', '-q', 'a.zip'], { cwd: dossier });
      execFileSync('unzip', ['-q', 'a.zip', '-d', 'sortie'], { cwd: dossier });
      expect(new Uint8Array(readFileSync(join(dossier, 'sortie', 'Mon morceau.wav')))).toEqual(data);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('lit une archive faite par l’outil zip (sans compression)', () => {
    if (!aUnzip) return;
    let zipDispo = true;
    try { execFileSync('zip', ['-v'], { stdio: 'ignore' }); } catch { zipDispo = false; }
    if (!zipDispo) return;
    const dossier = mkdtempSync(join(tmpdir(), 'frequence-zip-'));
    try {
      writeFileSync(join(dossier, 'chanson.mid'), Buffer.from('MThd....'));
      execFileSync('zip', ['-0', '-q', 'b.zip', 'chanson.mid'], { cwd: dossier });
      const relu = unzipStored(new Uint8Array(readFileSync(join(dossier, 'b.zip'))));
      expect(relu.map(e => e.name)).toEqual(['chanson.mid']);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('refuse une archive abîmée ou compressée avec un message clair', () => {
    const zip = zipStored([{ name: 'x.txt', data: octets('bonjour') }]);
    const abime = zip.slice();
    abime[35] = abime[35]! ^ 0xff;                          // un octet du contenu
    expect(() => unzipStored(abime)).toThrow(/corrompu/);
    expect(() => unzipStored(octets('pas une archive du tout, vraiment'))).toThrow(/abîmée/);
    const compresse = zip.slice();
    const central = compresse.length - 22 - (46 + 5);
    new DataView(compresse.buffer).setUint16(central + 10, 8, true);   // méthode « deflate »
    expect(() => unzipStored(compresse)).toThrow(/compressée/);
  });
});

describe('téléchargements dans claude.ai', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('emballe .wav, .mid et .frequence dans un .zip, laisse passer .json', async () => {
    for (const nom of ['Mon morceau.wav', 'Mon morceau.mid', 'Mon morceau.frequence']) {
      const f = await preparerTelechargement(new Blob([octets('contenu')]), nom);
      expect(f.nom).toBe(`${nom}.zip`);
      const relu = unzipStored(new Uint8Array(await f.data.arrayBuffer()));
      expect(relu.map(e => [e.name, new TextDecoder().decode(e.data)])).toEqual([[nom, 'contenu']]);
    }
    const json = new Blob(['{}']);
    expect(await preparerTelechargement(json, 'notes.json')).toEqual({ data: json, nom: 'notes.json' });
  });

  it('passe par la capacité « downloads » et distingue accepté, refusé et indisponible', async () => {
    const save = vi.fn();
    vi.stubGlobal('window', { claude: { use: async (n: string) => (n === 'downloads' ? { save } : null) } });
    save.mockResolvedValueOnce({ status: 'saved' });
    expect(await telecharger(new Blob(['x']), 'Démo.wav')).toEqual({ statut: 'enregistre', nom: 'Démo.wav.zip' });
    expect(save.mock.calls[0]![0].filename).toBe('Démo.wav.zip');
    save.mockRejectedValueOnce({ code: 'declined', message: '' });
    expect((await telecharger(new Blob(['x']), 'Démo.wav')).statut).toBe('refuse');
    save.mockRejectedValueOnce({ code: 'rate_limited', message: '' });
    await expect(telecharger(new Blob(['x']), 'Démo.wav')).rejects.toThrow(/déjà ouverte/);

    // « unavailable » : retour au lien classique.
    const clic = vi.fn();
    vi.stubGlobal('document', { createElement: () => ({ click: clic, remove() {} }), body: { appendChild() {} } });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL() {} });
    save.mockRejectedValueOnce({ code: 'unavailable', message: '' });
    expect(await telecharger(new Blob(['x']), 'Démo.wav')).toEqual({ statut: 'lien', nom: 'Démo.wav' });
    expect(clic).toHaveBeenCalledOnce();
  });
});
