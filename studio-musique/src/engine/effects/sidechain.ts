// Sidechain : compresseur déclenché par une autre tranche (la grosse caisse fait « respirer »
// la basse ou les nappes). Le détecteur est un DynamicsCompressorNode natif : il calcule son gain
// sur le maximum de ses canaux et l'applique à tous. On lui donne la source sur un canal et un
// signal continu minuscule sur l'autre ; ce second canal ressort multiplié par le gain, qu'on
// récupère pour piloter le volume. Tout est natif, donc identique en rendu hors ligne.
// Un compresseur neuf démarre comme s'il était en pleine réduction et remonte au rythme du
// relâchement : un second détecteur identique, sans source, sert de référence. On ajoute
// (détecteur - référence) au volume : sans source, les deux s'annulent exactement.
import type { ParamValue } from '../../project/types';
import { compressorMakeupCompensation } from '../context';
import { num } from '../defs';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';

/** Niveau du signal pilote (-60 dBFS) : sous tout seuil réglable, il ne déclenche rien seul. */
const PILOT = 0.001;

const def: PluginDef = {
  type: 'sidechain', kind: 'effet', name: 'Sidechain',
  description: 'Baisse le volume quand une autre tranche joue : la grosse caisse fait respirer la basse.',
  view: 'compresseur',
  params: [
    num('source', 'Source', 1, 12, 1, 'Tranche qui déclenche la baisse de volume (souvent la grosse caisse).', { step: 1 }),
    num('seuil', 'Seuil', -50, 0, -24, 'Niveau de la source à partir duquel le volume baisse.', { unit: 'dB', step: 0.1 }),
    num('ratio', 'Ratio', 1, 20, 8, 'Force de la baisse.', { step: 0.1, curve: 'log' }),
    num('attaque', 'Attaque', 0.1, 100, 2, 'Vitesse de la plongée.', { unit: 'ms', curve: 'log' }),
    num('relachement', 'Relâchement', 20, 1000, 180, 'Vitesse de la remontée : c’est elle qui fait « respirer ».', { unit: 'ms', curve: 'log' }),
    num('profondeur', 'Profondeur', 0, 1, 1, 'Part de la baisse appliquée (0 = aucune).', { step: 0.01 }),
  ],
};

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const vca = ctx.createGain();
  // Détecteur : canal 0 = source (mono), canal 1 = signal pilote.
  const mono = ctx.createGain();
  mono.channelCount = 1;
  mono.channelCountMode = 'explicit';
  mono.channelInterpretation = 'speakers';
  const pilot = ctx.createConstantSource();
  pilot.offset.value = PILOT;
  const merger = ctx.createChannelMerger(2);
  const comp = ctx.createDynamicsCompressor();
  comp.knee.value = 0;
  const splitter = ctx.createChannelSplitter(2);
  const control = ctx.createGain();
  mono.connect(merger, 0, 0);
  pilot.connect(merger, 0, 1);
  merger.connect(comp).connect(splitter);
  splitter.connect(control, 1);
  control.connect(vca.gain);
  // Référence : même détecteur, pilote seul, retranché du volume.
  const refComp = ctx.createDynamicsCompressor();
  refComp.knee.value = 0;
  const refControl = ctx.createGain();
  pilot.connect(refComp).connect(refControl).connect(vca.gain);
  pilot.start();

  let source: AudioNode | null = null;
  let depth = 1;

  return {
    input: vca,
    output: vca,
    setParams(p: Record<string, ParamValue>) {
      const t = ctx.currentTime;
      const next = host.sidechain(Math.round(Number(p.source)));
      if (next !== source) {
        if (source) {
          try {
            source.disconnect(mono);
          } catch {
            // déjà débranchée
          }
        }
        source = next;
        source?.connect(mono);
      }
      const thr = Number(p.seuil);
      const ratio = Number(p.ratio);
      for (const c of [comp, refComp]) {
        c.threshold.setValueAtTime(thr, t);
        c.ratio.setValueAtTime(ratio, t);
        c.attack.setValueAtTime(Number(p.attaque) / 1000, t);
        c.release.setValueAtTime(Number(p.relachement) / 1000, t);
      }
      // Volume = 1 + profondeur × (gain du détecteur - gain de référence) ; la référence vaut 1 une
      // fois le détecteur établi, d'où (1 - profondeur) + profondeur × gain.
      depth = Number(p.profondeur);
      const k = (depth / PILOT) * compressorMakeupCompensation(thr, ratio);
      vca.gain.setValueAtTime(1, t);
      control.gain.setValueAtTime(k, t);
      refControl.gain.setValueAtTime(-k, t);
    },
    gainReduction() {
      const g = Math.pow(10, comp.reduction / 20);
      return 20 * Math.log10(1 - depth + depth * g);
    },
    dispose() {
      if (source) {
        try {
          source.disconnect(mono);
        } catch {
          // déjà débranchée
        }
      }
      pilot.stop();
      for (const n of [vca, mono, pilot, merger, comp, splitter, control, refComp, refControl]) n.disconnect();
    },
  };
}

export const sidechain: EffectModule = { def, create };
