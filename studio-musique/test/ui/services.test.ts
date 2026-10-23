import { describe, expect, it } from 'vitest';
import { Echantillons, nomFichier } from '../../src/ui/services';
import { RACCOURCIS } from '../../src/ui/views/raccourcis';

describe('services de fichiers', () => {
  it('nom de fichier sûr', () => {
    expect(nomFichier('Mon morceau', 'frequence')).toBe('Mon morceau.frequence');
    expect(nomFichier('a/b:c*?', 'wav')).toBe('a b c.wav');
    expect(nomFichier('   ', 'mid')).toBe('Sans titre.mid');
  });

  it('garde une copie des octets d\'un son (decodeAudioData détache le tampon)', async () => {
    const vus: string[] = [];
    const e = new Echantillons({
      decodeSample: async (d: ArrayBuffer) => { vus.push(`decode:${d.byteLength}`); return { duration: 1 } as AudioBuffer; },
      setSampleAudio: id => { vus.push(`set:${id}`); },
    });
    await e.ajouter('s1', new Uint8Array([1, 2, 3]).buffer);
    expect(e.octets.get('s1')?.byteLength).toBe(3);
    expect(vus).toEqual(['decode:3', 'set:s1']);
    const echecs = await new Echantillons({ decodeSample: async () => { throw new Error('x'); } }).remplacerTout(new Map([['a', new ArrayBuffer(1)]]));
    expect(echecs).toEqual(['a']);
  });

  it('la liste des raccourcis couvre ceux du plan', () => {
    const touches = RACCOURCIS.flatMap(g => g.liste.map(([k]) => k)).join(' ');
    for (const k of ['Espace', 'Ctrl+Espace', 'L', 'Alt+1', 'Ctrl+Z', 'Ctrl+S', 'Ctrl+E', 'Suppr', 'Ctrl+D', 'Q', 'B', 'E', 'S', 'C']) expect(touches).toContain(k);
  });
});
