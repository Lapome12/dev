// Bitcrusher : réduit la résolution du son par paliers (table de transfert en escalier).
import type { ParamValue } from '../../project/types';
import { dbToGain } from '../context';
import { num } from '../defs';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';

const def: PluginDef = {
  type: 'bitcrusher', kind: 'effet', name: 'Bitcrusher',
  description: 'Son de vieille console de jeu : résolution réduite, grain numérique.',
  params: [
    num('bits', 'Bits', 1, 16, 6, 'Nombre de bits : moins de bits, plus de grain.', { step: 1 }),
    num('gain', 'Gain d’entrée', 0, 24, 0, 'Pousse le son dans les paliers.', { unit: 'dB', step: 0.1 }),
    num('adoucir', 'Adoucir', 1000, 20000, 20000, 'Filtre les aigus produits par les paliers.', { unit: 'Hz', curve: 'log' }),
    num('sortie', 'Sortie', -24, 6, 0, 'Volume après l’effet.', { unit: 'dB', step: 0.1 }),
  ],
};

/** Escalier de 2^(bits-1) paliers par demi-onde (exporté pour les tests). */
export function crushCurve(bits: number, size = 65537): Float32Array<ArrayBuffer> {
  const c = new Float32Array(size);
  const steps = Math.pow(2, Math.max(1, Math.round(bits)) - 1);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    c[i] = Math.round(x * steps) / steps;
  }
  return c;
}

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const input = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  const output = ctx.createGain();
  input.connect(shaper).connect(lp).connect(output);
  let bits = -1;
  return {
    input,
    output,
    setParams(p: Record<string, ParamValue>) {
      const t = ctx.currentTime;
      const b = Math.round(Number(p.bits));
      if (b !== bits) {
        bits = b;
        shaper.curve = crushCurve(b);
      }
      input.gain.setTargetAtTime(dbToGain(Number(p.gain)), t, 0.005);
      lp.frequency.setTargetAtTime(Number(p.adoucir), t, 0.005);
      output.gain.setTargetAtTime(dbToGain(Number(p.sortie)), t, 0.005);
    },
    dispose() {
      for (const n of [input, shaper, lp, output]) n.disconnect();
    },
  };
}

export const bitcrusher: EffectModule = { def, create };
