// Réverbe à convolution, réponse impulsionnelle générée (impulse.ts), recalculée seulement
// quand la taille ou la brillance changent.
import type { ParamValue } from '../../project/types';
import { num } from '../defs';
import { createImpulse } from '../impulse';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';

const def: PluginDef = {
  type: 'reverbe', kind: 'effet', name: 'Réverbe',
  description: 'Réverbération : place le son dans une pièce, de la cabine à la cathédrale.',
  params: [
    num('taille', 'Taille', 0.2, 10, 2, 'Durée de la queue de réverbération.', { unit: 's', curve: 'log', step: 0.01 }),
    num('brillance', 'Brillance', 0, 1, 0.5, 'Queue sombre (rideaux) ou brillante (carrelage).', { step: 0.01 }),
    num('predelai', 'Pré-délai', 0, 200, 20, 'Temps avant les premières réflexions : éloigne les murs.', { unit: 'ms' }),
    num('coupebas', 'Coupe-bas', 20, 1000, 150, 'Retire les graves de la réverbe pour garder le mix clair.', { unit: 'Hz', curve: 'log' }),
  ],
};

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const input = ctx.createGain();
  const pre = ctx.createDelay(0.25);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  const conv = ctx.createConvolver();
  const output = ctx.createGain();
  input.connect(pre).connect(hp).connect(conv).connect(output);
  let key = '';

  return {
    input,
    output,
    setParams(p: Record<string, ParamValue>) {
      const t = ctx.currentTime;
      pre.delayTime.setTargetAtTime(Number(p.predelai) / 1000, t, 0.01);
      hp.frequency.setTargetAtTime(Number(p.coupebas), t, 0.01);
      const k = `${Number(p.taille).toFixed(2)}|${Number(p.brillance).toFixed(2)}`;
      if (k !== key) {
        key = k;
        conv.buffer = createImpulse(ctx, { seconds: Number(p.taille), brillance: Number(p.brillance) });
      }
    },
    dispose() {
      input.disconnect();
      pre.disconnect();
      hp.disconnect();
      conv.disconnect();
      output.disconnect();
    },
  };
}

export const reverbe: EffectModule = { def, create };
