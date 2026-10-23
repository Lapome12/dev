// Presets maison (§D.4, étape 2.8). Tous créés par nous et nommés en français.
import type { EffectType, InstrumentType, ParamValue } from '../types';

export interface Preset { id: string; name: string; type: InstrumentType | EffectType; category: string; params: Record<string, ParamValue> }

const ALL: Preset[] = [];

export function listPresets(type?: InstrumentType | EffectType): Preset[] {
  return type ? ALL.filter(p => p.type === type) : [...ALL];
}

export function findPreset(id: string): Preset | undefined {
  return ALL.find(p => p.id === id);
}
