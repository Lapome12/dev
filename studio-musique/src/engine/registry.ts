// Liste des instruments et des effets disponibles.
import type { EffectType, InstrumentType } from '../project/types';
import type { EffectModule } from './effects/effect';
import type { InstrumentModule } from './instruments/instrument';
import type { PluginDef } from './params';
import { corde } from './instruments/corde';
import { echantillon } from './instruments/echantillon';
import { frappe } from './instruments/frappe';
import { prisme } from './instruments/prisme';
import { trio } from './instruments/trio';

export const INSTRUMENTS: Partial<Record<InstrumentType, InstrumentModule>> = { trio, prisme, frappe, corde, echantillon };

export const EFFECTS: Partial<Record<EffectType, EffectModule>> = {};

export const PLUGINS: PluginDef[] = [
  ...Object.values(INSTRUMENTS).map((m) => m.def),
  ...Object.values(EFFECTS).map((m) => m.def),
];
