import { describe, expect, it, vi } from 'vitest';
import { newEffect, newProject, stepNote } from '../../src/project/defaults';
import { FrequenceError } from '../../src/project/errors';
import { importSample } from '../../src/project/samples';
import { MAX_FILE_BYTES, openFile, saveFile } from '../../src/project/serialize';
import { createAutosaver, type KeyValueBackend } from '../../src/project/storage';
import { LIMITS, sanitizeProject } from '../../src/project/validate';

function richProject() {
  const p = newProject();
  const pat = p.patterns[0]!;
  const kick = p.channels[0]!;
  pat.notes[kick.id] = [0, 4, 8, 12].map(s => stepNote(s, kick.rootPitch));
  p.mixer[1]!.effects.push(newEffect('reverbe'), newEffect('delai'));
  p.arrangement.clips.push({ id: 'c1', trackId: p.arrangement.tracks[0]!.id, patternId: pat.id, start: 0, length: 1536, offset: 0 });
  p.arrangement.loop = { start: 0, end: 1536 };
  p.samples.push({ id: 's1', name: 'Voix', durationSec: 1.5 });
  return p;
}

const asJson = (o: unknown) => new Blob([JSON.stringify(o)]);

describe('fichier .frequence', () => {
  it('aller-retour sans perte, échantillons compris', async () => {
    const p = richProject();
    const audio = new Uint8Array(70_000).map((_, i) => (i * 7) % 256);
    const blob = saveFile(p, new Map([['s1', audio.buffer]]));
    const { project, samples } = await openFile(blob);
    expect(project).toEqual(p);
    expect(new Uint8Array(samples.get('s1')!)).toEqual(audio);
  });

  it('le projet neuf passe la validation à l’identique', () => {
    const p = newProject();
    expect(sanitizeProject(structuredClone(p))).toEqual(p);
  });

  it('refuse un JSON cassé, un autre format, une version future', async () => {
    await expect(openFile(new Blob(['{ pas du json'])) ).rejects.toThrow(FrequenceError);
    await expect(openFile(asJson({ project: { format: 'autre' } }))).rejects.toThrow('pas un projet Fréquence');
    const futur = { ...newProject(), version: 2 };
    await expect(openFile(asJson({ project: futur }))).rejects.toThrow('plus récente');
    await expect(openFile(asJson([1, 2]))).rejects.toThrow(FrequenceError);
  });

  it('refuse un fichier énorme sans le lire', async () => {
    const enorme = { size: MAX_FILE_BYTES + 1, text: vi.fn() } as unknown as Blob;
    await expect(openFile(enorme)).rejects.toThrow('200 Mo');
    expect((enorme as unknown as { text: ReturnType<typeof vi.fn> }).text).not.toHaveBeenCalled();
  });

  it('ramène les valeurs absurdes dans les bornes', () => {
    const p = richProject() as unknown as Record<string, any>;
    p.bpm = 99999; p.swing = -3; p.masterPitch = 40;
    p.channels[0].volume = 50; p.channels[0].pan = -9; p.channels[0].rootPitch = 500; p.channels[0].mixerTrack = 99;
    p.channels[1].volume = 'fort'; p.channels[1].color = 'red;background:url(x)';
    const n = p.patterns[0].notes[p.channels[0].id][0];
    n.velocity = 7; n.pitch = -5; n.tick = -100; n.length = 0;
    p.mixer[1].effects[0].mix = 3;
    const s = sanitizeProject(p);
    expect(s.bpm).toBe(300); expect(s.swing).toBe(0); expect(s.masterPitch).toBe(12);
    expect(s.channels[0]).toMatchObject({ volume: 1.25, pan: -1, rootPitch: 127, mixerTrack: 12 });
    expect(s.channels[1]!.volume).toBe(0.8);
    expect(s.channels[1]!.color).toMatch(/^#[0-9A-F]{6}$/i);
    expect(s.patterns[0]!.notes[s.channels[0]!.id]![0]).toMatchObject({ velocity: 1, pitch: 0, tick: 0, length: 1 });
    expect(s.mixer[1]!.effects[0]!.mix).toBe(1);
  });

  it('retire les références cassées et complète la console', () => {
    const p = richProject() as unknown as Record<string, any>;
    p.patterns[0].notes['canal-fantome'] = [{ id: 'n', tick: 0, length: 24, pitch: 60, velocity: 1 }];
    p.arrangement.clips.push({ id: 'c2', trackId: 'x', patternId: p.patterns[0].id, start: 0, length: 10, offset: 0 });
    p.mixer = p.mixer.slice(0, 3);
    p.mixer[2].effects = Array.from({ length: 12 }, () => newEffect('eq'));
    const s = sanitizeProject(p);
    expect(s.patterns[0]!.notes['canal-fantome']).toBeUndefined();
    expect(s.arrangement.clips.map(c => c.id)).toEqual(['c1']);
    expect(s.mixer).toHaveLength(13);
    expect(s.mixer[2]!.effects).toHaveLength(8);
  });

  it('refuse les structures piégées', () => {
    const base = () => richProject() as unknown as Record<string, any>;
    const cas: [string, (p: Record<string, any>) => void][] = [
      ['instrument inconnu', p => { p.channels[0].instrument.type = 'piege'; }],
      ['effet inconnu', p => { p.mixer[1].effects[0].type = 'piege'; }],
      ['identifiants en double', p => { p.channels[1].id = p.channels[0].id; }],
      ['trop de canaux', p => { p.channels = Array.from({ length: LIMITS.channels + 1 }, () => p.channels[0]); }],
      ['canaux pas en liste', p => { p.channels = 'abc'; }],
      ['note sans position', p => { p.patterns[0].notes[p.channels[0].id][0].tick = 'x'; }],
      ['identifiant __proto__', p => { p.channels[0].id = '__proto__'; }],
      ['aucun pattern', p => { p.patterns = []; }],
    ];
    for (const [nom, piege] of cas) {
      const p = base();
      piege(p);
      expect(() => sanitizeProject(p), nom).toThrow(FrequenceError);
    }
  });

  it('ignore les réglages piégés sans polluer les prototypes', () => {
    const p = richProject() as unknown as Record<string, any>;
    p.channels[0].instrument.params = JSON.parse('{"__proto__":{"pollue":true},"gcniveau":0.5,"objet":{"a":1}}');
    p.mixer[1].effects[0].params = JSON.parse('{"__proto__":{"pollue":true},"ok":1}');
    const s = sanitizeProject(p);
    const params = s.channels[0]!.instrument.params;
    expect(Object.keys(params)).not.toContain('objet');
    expect(Object.getPrototypeOf(params)).toBe(Object.prototype);
    expect(params.gcniveau).toBe(0.5);
    expect(Object.getPrototypeOf(s.mixer[1]!.effects[0]!.params)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).pollue).toBeUndefined();
  });
});

describe('import de sons', () => {
  const fichier = (name: string, size = 10) => Object.assign(new Blob([new Uint8Array(size)]), { name });
  const decode = (duration: number) => async (_: ArrayBuffer) => ({ duration } as AudioBuffer);

  it('accepte un .wav court', async () => {
    const r = await importSample(fichier('Ma voix.WAV'), decode(3));
    expect(r.ref).toMatchObject({ name: 'Ma voix', durationSec: 3 });
    expect(r.data.byteLength).toBe(10);
  });
  it('refuse les autres formats, les sons trop longs, illisibles', async () => {
    await expect(importSample(fichier('a.exe'), decode(1))).rejects.toThrow('Format');
    await expect(importSample(fichier('a.mp3'), decode(121))).rejects.toThrow('2 minutes');
    await expect(importSample(fichier('a.ogg'), async () => { throw new Error('x'); })).rejects.toThrow('Impossible de lire');
  });
});

describe('sauvegarde automatique', () => {
  function memoire(): KeyValueBackend & { data: Map<string, unknown>; puts: number } {
    const data = new Map<string, unknown>();
    const b = {
      data, puts: 0,
      get: async (s: string, k: string) => data.get(`${s}/${k}`),
      put: async (s: string, k: string, v: unknown) => { b.puts++; data.set(`${s}/${k}`, structuredClone(v)); },
    };
    return b;
  }

  it('écrit au plus une fois toutes les 2 s, la dernière version', async () => {
    vi.useFakeTimers();
    let t = 0;
    const b = memoire();
    const a = createAutosaver(b, () => t);
    const p = newProject();
    for (let i = 0; i < 10; i++) { p.bpm = 100 + i; a.autosave(structuredClone(p)); }
    await vi.advanceTimersByTimeAsync(0);
    expect(b.puts).toBe(1);
    p.bpm = 150; a.autosave(structuredClone(p));
    t = 1000; await vi.advanceTimersByTimeAsync(1000);
    expect(b.puts).toBe(1);
    t = 2000; await vi.advanceTimersByTimeAsync(1000);
    expect(b.puts).toBe(2);
    expect((b.data.get('projet/courant') as { bpm: number }).bpm).toBe(150);
    vi.useRealTimers();
  });

  it('restaure projet et sons, ignore une sauvegarde abîmée', async () => {
    const b = memoire();
    const a = createAutosaver(b);
    expect(await a.restore()).toBeNull();
    const p = richProject();
    a.autosave(p);
    await a.flush();
    await a.storeSample('s1', new Uint8Array([1, 2, 3]).buffer);
    const r = await a.restore();
    expect(r?.project).toEqual(p);
    expect(new Uint8Array(r!.samples.get('s1')!)).toEqual(new Uint8Array([1, 2, 3]));
    b.data.set('projet/courant', { format: 'frequence', version: 1, channels: 'x' });
    expect(await a.restore()).toBeNull();
  });
});
