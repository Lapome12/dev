import { describe, expect, it } from 'vitest';
import { clampParam, defaultParams, listPlugins, resolveParams } from '../../src/engine/params';

describe('description des réglages', () => {
  it('chaque plugin a des réglages cohérents', () => {
    for (const def of listPlugins()) {
      const ids = new Set<string>();
      expect(def.name.length).toBeGreaterThan(0);
      for (const p of def.params) {
        expect(ids.has(p.id), `${def.type}.${p.id} en double`).toBe(false);
        ids.add(p.id);
        expect(p.help.length, `${def.type}.${p.id} sans aide`).toBeGreaterThan(5);
        if (p.kind === 'number') {
          expect(typeof p.default).toBe('number');
          expect(p.min).toBeLessThanOrEqual(p.default as number);
          expect(p.max).toBeGreaterThanOrEqual(p.default as number);
        }
        if (p.kind === 'choice' && p.options && p.options.length > 0) {
          expect(p.options.some((o) => o.value === p.default), `${def.type}.${p.id}`).toBe(true);
        }
        if (p.kind === 'toggle') expect(typeof p.default).toBe('boolean');
      }
    }
  });

  it('valeurs par défaut et bornes', () => {
    const d = defaultParams('trio');
    expect(Object.keys(d).length).toBeGreaterThan(3);
    const def = listPlugins().find((p) => p.type === 'trio')!;
    const r = resolveParams(def, { volume: 99, o1onde: 'inconnue' });
    expect(r.volume).toBe(1);
    expect(r.o1onde).toBe(d.o1onde);
    expect(clampParam({ id: 'x', label: 'x', kind: 'number', min: 0, max: 1, default: 0.5, help: 'aide' }, NaN)).toBe(0.5);
  });
});
