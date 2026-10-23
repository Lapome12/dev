// Description des réglages des instruments et des effets (contrat §D.2 du plan).
// L'interface construit les fenêtres de plugin à partir de ces descriptions,
// le store et les presets s'y fient pour les valeurs par défaut et les bornes.
import type { EffectType, InstrumentType, ParamValue } from '../project/types';
import { PLUGINS } from './registry';

export interface ParamDef {
  id: string; label: string; group?: string;
  kind: 'number' | 'choice' | 'toggle';
  min?: number; max?: number; step?: number; default: ParamValue;
  unit?: 'Hz' | 'ms' | 's' | 'dB' | '%' | 'demi-tons' | 'cents' | 'temps';
  curve?: 'lin' | 'log';
  options?: { value: string; label: string }[];
  help: string;
}

export interface PluginDef {
  type: InstrumentType | EffectType; kind: 'instrument' | 'effet';
  name: string; description: string; params: ParamDef[];
  view?: 'adsr' | 'eq-courbe' | 'filtre-courbe' | 'compresseur' | 'oscillos';
}

export function listPlugins(): PluginDef[] {
  return PLUGINS.slice();
}

export function pluginDef(type: InstrumentType | EffectType): PluginDef {
  const def = PLUGINS.find((p) => p.type === type);
  if (!def) throw new Error(`Plugin inconnu : ${type}`);
  return def;
}

export function defaultParams(type: InstrumentType | EffectType): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  const def = PLUGINS.find((p) => p.type === type);
  if (!def) return out;
  for (const p of def.params) out[p.id] = p.default;
  return out;
}

/**
 * Valeurs lues par le moteur : celles du projet, ramenées dans les bornes,
 * complétées par les valeurs par défaut pour les réglages absents.
 */
export function resolveParams(def: PluginDef, given: Record<string, ParamValue>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const p of def.params) out[p.id] = clampParam(p, given[p.id]);
  return out;
}

export function clampParam(p: ParamDef, v: ParamValue | undefined): ParamValue {
  if (p.kind === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return p.default;
    return Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v));
  }
  if (p.kind === 'toggle') return typeof v === 'boolean' ? v : p.default;
  if (typeof v !== 'string') return p.default;
  if (p.options && p.options.length > 0 && !p.options.some((o) => o.value === v)) return p.default;
  return v;
}
