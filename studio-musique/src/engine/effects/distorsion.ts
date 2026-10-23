// Distorsion par table de transfert (douce, dure, redresseur, paliers), suréchantillonnée 4×.
import type { ParamValue } from '../../project/types';
import { dbToGain } from '../context';
import { choice, num } from '../defs';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';

const def: PluginDef = {
  type: 'distorsion', kind: 'effet', name: 'Distorsion',
  description: 'Saturation, du chaud à l’écrasé.',
  params: [
    choice('forme', 'Forme', [['douce', 'Douce'], ['dure', 'Dure'], ['redresseur', 'Redresseur'], ['paliers', 'Paliers']], 'douce', 'Caractère de la saturation.'),
    num('drive', 'Attaque', 0, 40, 12, 'Quantité de saturation.', { unit: 'dB', step: 0.1 }),
    num('tonalite', 'Tonalité', 500, 20000, 8000, 'Adoucit les aigus après la saturation.', { unit: 'Hz', curve: 'log' }),
    num('sortie', 'Sortie', -24, 6, -6, 'Volume après la distorsion.', { unit: 'dB', step: 0.1 }),
  ],
};

/** Table de transfert (exportée pour les tests). */
export function distortionCurve(forme: string, driveDb: number, size = 4097): Float32Array<ArrayBuffer> {
  const g = dbToGain(driveDb);
  const c = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const u = g * x;
    let y: number;
    switch (forme) {
      case 'dure': y = Math.max(-1, Math.min(1, u)); break;
      case 'redresseur': y = Math.abs(Math.tanh(u)); break;   // le décalage continu est retiré après
      case 'paliers': y = Math.round(Math.tanh(u) * 6) / 6; break;
      default: y = Math.tanh(u);
    }
    c[i] = y;
  }
  return c;
}

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '4x';
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  const dc = ctx.createBiquadFilter();       // retire tout décalage continu
  dc.type = 'highpass';
  dc.frequency.value = 15;
  const output = ctx.createGain();
  shaper.connect(lp).connect(dc).connect(output);
  let key = '';
  return {
    input: shaper,
    output,
    setParams(p: Record<string, ParamValue>) {
      const t = ctx.currentTime;
      const k = `${String(p.forme)}|${Number(p.drive)}`;
      if (k !== key) {
        key = k;
        shaper.curve = distortionCurve(String(p.forme), Number(p.drive));
      }
      lp.frequency.setTargetAtTime(Number(p.tonalite), t, 0.005);
      output.gain.setTargetAtTime(dbToGain(Number(p.sortie)), t, 0.005);
    },
    dispose() {
      shaper.disconnect();
      lp.disconnect();
      dc.disconnect();
      output.disconnect();
    },
  };
}

export const distorsion: EffectModule = { def, create };
