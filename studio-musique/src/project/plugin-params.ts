// Pont vers les descriptions de réglages du moteur (§D.2, src/engine/params.ts de Dev 1).
// Bouchon tant que params.ts n'est pas fusionné : aucun réglage par défaut.
import type { EffectType, InstrumentType, ParamValue } from './types';

export function defaultParams(_type: InstrumentType | EffectType): Record<string, ParamValue> {
  return {};
}
