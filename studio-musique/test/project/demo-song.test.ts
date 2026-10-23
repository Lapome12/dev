import { describe, expect, it } from 'vitest';
import { demoSong, synthBreathWav } from '../../src/project/demo-song';
import { flattenNotes } from '../../src/project/midi-file';
import { openFile, saveFile } from '../../src/project/serialize';
import { sanitizeProject } from '../../src/project/validate';

describe('morceau de démo « Premier jet »', () => {
  const { project, samples } = demoSong();

  it('suit le cahier des charges', () => {
    expect(project.bpm).toBeGreaterThanOrEqual(110);
    expect(project.bpm).toBeLessThanOrEqual(125);
    expect(project.channels).toHaveLength(8);
    expect(project.patterns).toHaveLength(6);
    expect(new Set(project.channels.map(c => c.instrument.type)).size).toBe(5);
    const effets = new Set(project.mixer.flatMap(t => t.effects.map(e => e.type)));
    expect(effets.size).toBeGreaterThanOrEqual(6);
    const fin = Math.max(...project.arrangement.clips.map(c => c.start + c.length));
    const secondes = fin / 96 * 60 / project.bpm;
    expect(secondes).toBeGreaterThan(50);
    expect(secondes).toBeLessThan(75);
    for (const t of project.mixer) expect(t.effects.length).toBeLessThanOrEqual(8);
  });

  it('est un projet valide, qui passe l’aller-retour de fichier', async () => {
    expect(sanitizeProject(structuredClone(project))).toEqual(project);
    const r = await openFile(saveFile(project, samples));
    expect(r.project).toEqual(project);
    expect(r.samples.get(project.samples[0]!.id)!.byteLength).toBe(samples.get(project.samples[0]!.id)!.byteLength);
  });

  it('chaque canal joue, les notes restent dans leurs patterns', () => {
    const flat = flattenNotes(project);
    for (const c of project.channels) expect(flat.get(c.id)!.length, c.name).toBeGreaterThan(0);
    for (const p of project.patterns) for (const list of Object.values(p.notes)) for (const n of list) {
      expect(n.tick + n.length).toBeLessThanOrEqual(p.lengthTicks);
    }
  });

  it('le souffle synthétisé est un WAV valide et toujours le même', () => {
    const a = new Uint8Array(synthBreathWav()), b = new Uint8Array(synthBreathWav());
    expect(String.fromCharCode(...a.slice(0, 4))).toBe('RIFF');
    expect(a).toEqual(b);
    const pcm = new Int16Array(a.buffer, 44);
    const crete = pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(crete).toBeGreaterThan(3000);
  });
});

describe('modèles de projet', () => {
  it('quatre modèles valides, aux tempos annoncés', async () => {
    const { TEMPLATES } = await import('../../src/project/templates');
    expect(TEMPLATES.map(t => t.id)).toEqual(['vide', 'hiphop-90', 'house-124', 'lofi-75']);
    const bpm: Record<string, number> = { vide: 130, 'hiphop-90': 90, 'house-124': 124, 'lofi-75': 75 };
    for (const t of TEMPLATES) {
      const { project } = t.create();
      expect(project.bpm, t.id).toBe(bpm[t.id]);
      expect(sanitizeProject(structuredClone(project)), t.id).toEqual(project);
      if (t.id !== 'vide') {
        const flat = flattenNotes(project);
        for (const c of project.channels) expect(flat.get(c.id)!.length, `${t.id} ${c.name}`).toBeGreaterThan(0);
      }
    }
  });
});
