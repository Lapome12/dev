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
  it('cinq modèles valides, aux tempos annoncés', async () => {
    const { TEMPLATES } = await import('../../src/project/templates');
    expect(TEMPLATES.map(t => t.id)).toEqual(['vide', 'hiphop-90', 'house-124', 'techno-132', 'lofi-75']);
    const bpm: Record<string, number> = { vide: 130, 'hiphop-90': 90, 'house-124': 124, 'techno-132': 132, 'lofi-75': 75 };
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

describe('modèles techno et house (étape 6)', () => {
  it('au moins 4 patterns, 32 mesures, et les instruments et effets de l’étape 6', async () => {
    const { findTemplate } = await import('../../src/project/templates');
    const attendus: Record<string, { instruments: string[]; effets: string[] }> = {
      'techno-132': { instruments: ['frappe', 'acide', 'accord'], effets: ['sidechain', 'porte', 'reverbe'] },
      'house-124': { instruments: ['frappe', 'accord'], effets: ['sidechain'] },
    };
    for (const [id, a] of Object.entries(attendus)) {
      const { project } = findTemplate(id)!.create();
      expect(project.patterns.length, id).toBeGreaterThanOrEqual(4);
      const fin = Math.max(...project.arrangement.clips.map(c => c.start + c.length));
      expect(fin / (96 * 4), id).toBeGreaterThanOrEqual(32);
      const instruments = new Set(project.channels.map(c => c.instrument.type));
      for (const t of a.instruments) expect(instruments.has(t as never), `${id} ${t}`).toBe(true);
      const effets = new Set(project.mixer.flatMap(t => t.effects.map(e => e.type)));
      for (const t of a.effets) expect(effets.has(t as never), `${id} ${t}`).toBe(true);
      // Le sidechain écoute la grosse caisse, sur la tranche 1.
      const kick = project.channels.find(c => c.name === 'Grosse caisse')!;
      expect(kick.mixerTrack, id).toBe(1);
      for (const e of project.mixer.flatMap(t => t.effects)) if (e.type === 'sidechain') expect(e.params.source, id).toBe(1);
    }
  });
});
