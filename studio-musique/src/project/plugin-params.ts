// Pont vers les descriptions de réglages du moteur (§D.2, src/engine/params.ts de Dev 1).
// Un plugin que le moteur ne décrit pas encore garde ses réglages tels quels.
import { PLUGINS } from '../engine/registry';
import type { ParamDef } from '../engine/params';
import type { EffectType, InstrumentType, ParamValue } from './types';

/** Description des réglages d'un plugin, ou undefined si le moteur ne la fournit pas encore. */
export function paramDefs(type: InstrumentType | EffectType): ParamDef[] | undefined {
  return PLUGINS.find(p => p.type === type)?.params;
}

export function defaultParams(type: InstrumentType | EffectType): Record<string, ParamValue> {
  const defs = paramDefs(type);
  return defs ? Object.fromEntries(defs.map(d => [d.id, d.default])) : {};
}
