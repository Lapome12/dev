// Compresseur : resserre la dynamique, avec gain de rattrapage et lecture de la réduction.
import type { ParamValue } from '../../project/types';
import { compressorMakeupCompensation, dbToGain } from '../context';
import { num } from '../defs';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';

const def: PluginDef = {
  type: 'compresseur', kind: 'effet', name: 'Compresseur',
  description: 'Resserre la dynamique : un son plus égal, plus présent.',
  view: 'compresseur',
  params: [
    num('seuil', 'Seuil', -60, 0, -18, 'Niveau à partir duquel le son est compressé.', { unit: 'dB', step: 0.1 }),
    num('ratio', 'Ratio', 1, 20, 4, 'Force de la compression (4 = 4 dB qui entrent pour 1 qui sort).', { step: 0.1, curve: 'log' }),
    num('attaque', 'Attaque', 0.1, 200, 10, 'Vitesse à laquelle la compression s’enclenche.', { unit: 'ms', curve: 'log' }),
    num('relachement', 'Relâchement', 10, 1000, 150, 'Vitesse à laquelle la compression se relâche.', { unit: 'ms', curve: 'log' }),
    num('genou', 'Genou', 0, 40, 6, 'Transition douce (grand) ou nette (petit) autour du seuil.', { unit: 'dB', step: 0.1 }),
    num('gain', 'Gain', 0, 24, 0, 'Rattrape le volume perdu par la compression.', { unit: 'dB', step: 0.1 }),
  ],
};

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const comp = ctx.createDynamicsCompressor();
  const output = ctx.createGain();
  comp.connect(output);
  return {
    input: comp,
    output,
    setParams(p: Record<string, ParamValue>) {
      const t = ctx.currentTime;
      comp.threshold.setTargetAtTime(Number(p.seuil), t, 0.005);
      comp.ratio.setTargetAtTime(Number(p.ratio), t, 0.005);
      comp.attack.setTargetAtTime(Number(p.attaque) / 1000, t, 0.005);
      comp.release.setTargetAtTime(Number(p.relachement) / 1000, t, 0.005);
      comp.knee.setTargetAtTime(Number(p.genou), t, 0.005);
      const comp0 = compressorMakeupCompensation(Number(p.seuil), Number(p.ratio));
      output.gain.setTargetAtTime(dbToGain(Number(p.gain)) * comp0, t, 0.005);
    },
    gainReduction: () => comp.reduction,
    dispose() {
      comp.disconnect();
      output.disconnect();
    },
  };
}

export const compresseur: EffectModule = { def, create };
