// Liste des instruments et des effets disponibles.
import type { EffectType, InstrumentType } from '../project/types';
import type { EffectModule } from './effects/effect';
import type { InstrumentModule } from './instruments/instrument';
import type { PluginDef } from './params';
import { bitcrusher } from './effects/bitcrusher';
import { chorus } from './effects/chorus';
import { limiteur } from './effects/limiteur';
import { pompe } from './effects/pompe';
import { compresseur } from './effects/compresseur';
import { delai } from './effects/delai';
import { distorsion } from './effects/distorsion';
import { eq } from './effects/eq';
import { filtre } from './effects/filtre';
import { reverbe } from './effects/reverbe';
import { corde } from './instruments/corde';
import { echantillon } from './instruments/echantillon';
import { frappe } from './instruments/frappe';
import { prisme } from './instruments/prisme';
import { trio } from './instruments/trio';

export const INSTRUMENTS: Partial<Record<InstrumentType, InstrumentModule>> = { trio, prisme, frappe, corde, echantillon };

export const EFFECTS: Partial<Record<EffectType, EffectModule>> = {
  eq, reverbe, delai, compresseur, distorsion, filtre, chorus, limiteur, pompe, bitcrusher,
};

export const PLUGINS: PluginDef[] = [
  ...Object.values(INSTRUMENTS).map((m) => m.def),
  ...Object.values(EFFECTS).map((m) => m.def),
];
