import { describe, expect, it } from 'vitest';
import { pluginDef } from '../../src/engine/params';
import { newChannel } from '../../src/project/defaults';
import { findPreset, listPresets, PRESET_SOURCES } from '../../src/project/presets';

describe('presets', () => {
  it('assez de presets par instrument (§2.8)', () => {
    const count = (t: Parameters<typeof listPresets>[0]) => listPresets(t).length;
    expect(count('trio')).toBeGreaterThanOrEqual(25);
    expect(count('prisme')).toBeGreaterThanOrEqual(12);
    expect(count('frappe')).toBeGreaterThanOrEqual(3);
    expect(count('corde')).toBeGreaterThanOrEqual(6);
    expect(count('echantillon')).toBeGreaterThanOrEqual(2);
    // Étape 6 : effets techno et house.
    for (const t of ['porte', 'phaser', 'autofiltre', 'saturation'] as const) expect(count(t), t).toBeGreaterThanOrEqual(3);
  });

  it('ids uniques, noms français non vides, catégories (les noms interdits sont vérifiés par scripts/mots-interdits.mjs)', () => {
    const all = listPresets();
    expect(new Set(all.map(p => p.id)).size).toBe(all.length);
    expect(new Set(all.map(p => `${p.type}/${p.name}`)).size).toBe(all.length);
    for (const p of all) {
      expect(p.name.trim(), p.id).not.toBe('');
      expect(p.category.trim(), p.id).not.toBe('');
    }
  });

  it('chaque réglage écrit existe et reste dans les bornes du PluginDef', () => {
    for (const [type, specs] of PRESET_SOURCES) {
      const def = pluginDef(type);
      for (const s of specs) {
        for (const [k, v] of Object.entries(s.params)) {
          const d = def.params.find(x => x.id === k);
          expect(d, `${s.id} : réglage inconnu ${k}`).toBeDefined();
          if (d!.kind === 'number') {
            expect(typeof v, `${s.id}.${k}`).toBe('number');
            expect(v as number, `${s.id}.${k}`).toBeGreaterThanOrEqual(d!.min ?? -Infinity);
            expect(v as number, `${s.id}.${k}`).toBeLessThanOrEqual(d!.max ?? Infinity);
          } else if (d!.kind === 'toggle') {
            expect(typeof v, `${s.id}.${k}`).toBe('boolean');
          } else if (d!.options) {
            expect(d!.options.map(o => o.value), `${s.id}.${k}`).toContain(v);
          } else {
            expect(typeof v, `${s.id}.${k}`).toBe('string');     // choix libre (son, motif de la Porte)
            if (type === 'porte' && k === 'motif') expect(v, s.id).toMatch(/^[x.]{16}$/);
          }
        }
      }
    }
  });

  it('un preset est complet et s’applique à un canal neuf', () => {
    const p = findPreset('trio-basse-acide')!;
    expect(Object.keys(p.params).sort()).toEqual(pluginDef('trio').params.map(d => d.id).sort());
    const c = newChannel('trio', 'trio-basse-acide');
    expect(c.name).toBe('Basse acide');
    expect(c.instrument.params.resonance).toBe(12);
    c.instrument.params.resonance = 1;
    expect(findPreset('trio-basse-acide')!.params.resonance).toBe(12);   // copie, pas de partage
  });
});
