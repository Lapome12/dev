// Glisser-déposer des presets du navigateur vers le Rack (changer d'instrument) et la console
// (ajouter un effet), et application d'un preset.

import { defaultParams } from '../engine/params';
import { MAX_EFFECTS, newEffect } from '../project/defaults';
import { listPresets } from '../project/presets';
import type { EffectType, Id, InstrumentType } from '../project/types';
import { toast } from './components/toast';
import type { Contexte } from './contexte';

export const TYPE_GLISSE = 'application/x-frequence-preset';
export interface Glisse { kind: 'instrument' | 'effet'; type: string; presetId?: string }

/** Lit un preset glissé depuis le navigateur. */
export function lireGlisse(e: DragEvent): Glisse | null {
  const t = e.dataTransfer?.getData(TYPE_GLISSE);
  if (!t) return null;
  try {
    const g = JSON.parse(t) as Glisse;
    return (g.kind === 'instrument' || g.kind === 'effet') && typeof g.type === 'string' ? g : null;
  } catch { return null; }
}
export const glisseEnCours = (e: DragEvent): boolean => !!e.dataTransfer?.types.includes(TYPE_GLISSE);

/** Réglages d'un plugin : défauts du moteur + preset éventuel. */
export function reglages(type: string, presetId?: string) {
  const base = defaultParams(type as InstrumentType);
  const p = presetId ? listPresets(type as InstrumentType).find(x => x.id === presetId) : undefined;
  return { params: { ...base, ...structuredClone(p?.params ?? {}) }, nom: p?.name };
}

/** Remplace l'instrument d'un canal (glisser un preset sur une ligne du Rack). */
export function changerInstrument(ctx: Contexte, canalId: Id, g: Glisse): void {
  if (g.kind !== 'instrument') return;
  const r = reglages(g.type, g.presetId);
  ctx.store.update('Changer d\'instrument', d => {
    const c = d.channels.find(x => x.id === canalId);
    if (!c) return;
    c.instrument = { type: g.type as InstrumentType, params: r.params };
    if (r.nom) c.name = r.nom;
  });
}

/** Ajoute un effet (avec preset) au premier emplacement libre d'une tranche. */
export function ajouterEffetPreset(ctx: Contexte, piste: number, g: Glisse): void {
  if (g.kind !== 'effet') return;
  const t = ctx.store.get().mixer[piste];
  if (!t) return;
  if (t.effects.length >= MAX_EFFECTS) { toast('Cette tranche a déjà 8 effets.', 'alerte'); return; }
  const slot = newEffect(g.type as EffectType);
  slot.params = reglages(g.type, g.presetId).params;
  ctx.store.update('Ajouter un effet', d => { d.mixer[piste]?.effects.push(slot); });
  ctx.actions.ouvrirEffet(piste, slot.id);
}
