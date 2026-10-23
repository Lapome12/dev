// Presets maison (§D.4, étape 2.8). Tous créés par nous et nommés en français.
// Chaque preset est complet : valeurs par défaut du plugin, puis ses propres réglages.
import { defaultParams } from '../plugin-params';
import type { EffectType, InstrumentType, ParamValue } from '../types';
import { CORDE } from './corde';
import { ECHANTILLON } from './echantillon';
import { EFFETS } from './effets';
import { FRAPPE } from './frappe';
import { PRISME } from './prisme';
import type { PresetSpec } from './spec';
import { TRIO } from './trio';

export interface Preset { id: string; name: string; type: InstrumentType | EffectType; category: string; params: Record<string, ParamValue> }

const SOURCES: [InstrumentType | EffectType, PresetSpec[]][] = [
  ['trio', TRIO], ['prisme', PRISME], ['frappe', FRAPPE], ['corde', CORDE], ['echantillon', ECHANTILLON],
  ...EFFETS,
];

let all: Preset[] | null = null;
const build = () => all ??= SOURCES.flatMap(([type, specs]) =>
  specs.map(s => ({ id: s.id, name: s.name, type, category: s.category, params: { ...defaultParams(type), ...s.params } })));

/** Les presets, d'un type ou de tous ; copies, modifiables sans risque. */
export function listPresets(type?: InstrumentType | EffectType): Preset[] {
  return structuredClone(type ? build().filter(p => p.type === type) : build());
}

export function findPreset(id: string): Preset | undefined {
  const p = build().find(x => x.id === id);
  return p && structuredClone(p);
}

/** Les spécifications brutes, pour les tests (réglages réellement écrits par preset). */
export const PRESET_SOURCES = SOURCES;
