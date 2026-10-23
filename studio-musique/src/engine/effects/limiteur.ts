// Limiteur : plafonne le niveau (compression rapide à fort ratio, puis écrêtage doux au plafond).
import type { ParamValue } from '../../project/types';
import { compressorMakeupCompensation, dbToGain } from '../context';
import { num } from '../defs';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';

const def: PluginDef = {
  type: 'limiteur', kind: 'effet', name: 'Limiteur',
  description: 'Empêche le son de dépasser un plafond : plus fort sans saturer.',
  view: 'compresseur',
  params: [
    num('gain', 'Gain d’entrée', 0, 24, 0, 'Pousse le son contre le plafond (plus fort, plus dense).', { unit: 'dB', step: 0.1 }),
    num('plafond', 'Plafond', -12, 0, -0.3, 'Niveau maximal en sortie.', { unit: 'dB', step: 0.1 }),
    num('relachement', 'Relâchement', 10, 1000, 100, 'Vitesse de retour après un pic.', { unit: 'ms', curve: 'log' }),
  ],
};

/** Écrêtage doux : transparent jusqu'à 90 % du plafond, jamais au-dessus du plafond (exporté pour les tests). */
export function ceilingCurve(ceiling: number, size = 4097): Float32Array<ArrayBuffer> {
  const c = new Float32Array(size);
  const knee = 0.9 * ceiling;
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const input = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.knee.value = 0;
  comp.ratio.value = 20;
  comp.attack.value = 0.001;
  const compensation = ctx.createGain();
  const clip = ctx.createWaveShaper();
  // L'écrêtage travaille sur ±1 : on remonte le plafond à 1 avant, et on redescend après.
  const pre = ctx.createGain();
  const post = ctx.createGain();
  const output = ctx.createGain();
  input.connect(comp).connect(compensation).connect(pre).connect(clip).connect(post).connect(output);
  clip.curve = ceilingCurve(1);
  let key = '';

  return {
    input,
    output,
    setParams(p: Record<string, ParamValue>) {
      const t = ctx.currentTime;
      const ceilDb = Number(p.plafond);
      input.gain.setTargetAtTime(dbToGain(Number(p.gain)), t, 0.005);
      comp.threshold.setTargetAtTime(ceilDb - 0.5, t, 0.005);
      comp.release.setTargetAtTime(Number(p.relachement) / 1000, t, 0.005);
      compensation.gain.setTargetAtTime(compressorMakeupCompensation(ceilDb - 0.5, 20), t, 0.005);
      const k = ceilDb.toFixed(2);
      if (k !== key) {
        key = k;
        // Marge pour que les valeurs au-dessus du plafond restent dans la courbe (qui s'arrête à ±1).
        const headroom = 4;
        clip.curve = ceilingCurve(1 / headroom);
        pre.gain.value = 1 / (headroom * dbToGain(ceilDb));
        post.gain.value = headroom * dbToGain(ceilDb);
      }
    },
    gainReduction: () => comp.reduction,
    dispose() {
      for (const n of [input, comp, compensation, pre, clip, post, output]) n.disconnect();
    },
  };
}

export const limiteur: EffectModule = { def, create };
