// Contrat du projet (PLAN.md §D.1). Le projet est une donnée simple, sérialisable en JSON :
// le moteur ne fait que le lire (engine.sync), l'interface ne le modifie que via le store.
// Tout changement de ce fichier passe par le Manager.

export type Id = string;                       // crypto.randomUUID()
export const PPQ = 96;
export type ParamValue = number | string | boolean;

export interface Note { id: Id; tick: number; length: number; pitch: number; velocity: number } // velocity 0..1
export interface Pattern {
  id: Id; name: string; color: string;
  lengthTicks: number;                         // 1536 par défaut (4 mesures) ; le Rack en montre 16 à 64 pas
  notes: Record<Id, Note[]>;                   // clé = id de canal. Un « pas » allumé = une note de 24 ticks à la hauteur de base du canal
}
export type InstrumentType = 'trio' | 'prisme' | 'frappe' | 'corde' | 'echantillon';
export interface Channel {
  id: Id; name: string; color: string;
  instrument: { type: InstrumentType; params: Record<string, ParamValue> };
  rootPitch: number;                            // hauteur des pas (60 par défaut)
  mixerTrack: number;                           // 0 = maître, 1..12 = tranches
  volume: number; pan: number;                  // volume 0..1.25, pan -1..1
  mute: boolean; solo: boolean;
}
export type EffectType = 'eq' | 'reverbe' | 'delai' | 'compresseur' | 'distorsion'
  | 'filtre' | 'chorus' | 'limiteur' | 'pompe' | 'bitcrusher';
export interface EffectSlot { id: Id; type: EffectType; bypass: boolean; mix: number; params: Record<string, ParamValue> }
export interface MixerTrack {
  index: number; name: string; color: string;   // 0 = maître
  volume: number; pan: number; mute: boolean; solo: boolean;
  effects: EffectSlot[];                        // 8 au plus, dans l'ordre du signal
}
export interface ArrangementTrack { id: Id; name: string; color: string; mute: boolean; height: number }
export interface Clip { id: Id; trackId: Id; patternId: Id; start: number; length: number; offset: number } // ticks
export interface SampleRef { id: Id; name: string; durationSec: number }   // l'audio lui-même est hors du projet (§D.4 samples)
export interface Project {
  format: 'frequence'; version: 1;
  name: string; bpm: number;                    // 40..300
  swing: number;                                // 0..1, décale les doubles-croches paires
  masterPitch: number;                          // demi-tons, -12..12
  channels: Channel[]; patterns: Pattern[];
  arrangement: { tracks: ArrangementTrack[]; clips: Clip[]; loop: { start: number; end: number } | null };
  mixer: MixerTrack[];                          // 13 entrées : maître + 12
  samples: SampleRef[];
}
