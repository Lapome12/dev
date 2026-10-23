import type { ParamValue } from '../types';

/** Preset tel qu'écrit dans les fichiers : seuls les réglages qui diffèrent des valeurs par défaut. */
export interface PresetSpec { id: string; name: string; category: string; params: Record<string, ParamValue> }
