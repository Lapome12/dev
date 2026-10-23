// Chorus / Flanger : deux lignes à retard modulées en sens opposés (gauche/droite).
import type { ParamValue } from '../../project/types';
import { choice, num } from '../defs';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';

const def: PluginDef = {
  type: 'chorus', kind: 'effet', name: 'Chorus',
  description: 'Chorus ou flanger : épaissit et fait tourner le son.',
  params: [
    choice('mode', 'Mode', [['chorus', 'Chorus'], ['flanger', 'Flanger']], 'chorus', 'Chorus (doublage) ou flanger (balayage métallique).'),
    num('vitesse', 'Vitesse', 0.05, 10, 0.8, 'Vitesse de l’ondulation.', { unit: 'Hz', curve: 'log' }),
    num('profondeur', 'Profondeur', 0, 1, 0.5, 'Amplitude de l’ondulation.', { step: 0.01 }),
    num('delai', 'Retard', 5, 30, 12, 'Retard de base du chorus.', { unit: 'ms', step: 0.1 }),
    num('reinjection', 'Réinjection', 0, 0.9, 0.2, 'Renvoie l’effet sur lui-même (plus métallique).', { step: 0.01 }),
    num('largeur', 'Largeur', 0, 1, 0.8, 'Écart entre gauche et droite.', { step: 0.01 }),
  ],
};

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const input = ctx.createGain();
  const split = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const dL = ctx.createDelay(0.1);
  const dR = ctx.createDelay(0.1);
  const fbL = ctx.createGain();
  const fbR = ctx.createGain();
  const lfo = ctx.createOscillator();
  const depthL = ctx.createGain();
  const depthR = ctx.createGain();
  const output = ctx.createGain();
  input.connect(split);
  split.connect(dL, 0);
  split.connect(dR, 1);
  dL.connect(fbL).connect(dL);
  dR.connect(fbR).connect(dR);
  dL.connect(merger, 0, 0);
  dR.connect(merger, 0, 1);
  merger.connect(output);
  lfo.connect(depthL).connect(dL.delayTime);
  lfo.connect(depthR).connect(dR.delayTime);
  lfo.start();

  return {
    input,
    output,
    setParams(p: Record<string, ParamValue>) {
      const t = ctx.currentTime;
      const flanger = p.mode === 'flanger';
      const base = flanger ? 0.003 : Number(p.delai) / 1000;
      const amp = Number(p.profondeur) * (flanger ? 0.0025 : base * 0.6);
      const w = Number(p.largeur);
      lfo.frequency.setTargetAtTime(Number(p.vitesse), t, 0.01);
      dL.delayTime.setTargetAtTime(base, t, 0.01);
      dR.delayTime.setTargetAtTime(base, t, 0.01);
      depthL.gain.setTargetAtTime(amp, t, 0.01);
      depthR.gain.setTargetAtTime(amp * (1 - 2 * w), t, 0.01);   // largeur 1 : droite en opposition
      const fb = Number(p.reinjection) * (flanger ? 1 : 0.6);
      fbL.gain.setTargetAtTime(fb, t, 0.01);
      fbR.gain.setTargetAtTime(fb, t, 0.01);
    },
    dispose() {
      lfo.stop();
      for (const n of [input, split, merger, dL, dR, fbL, fbR, lfo, depthL, depthR, output]) n.disconnect();
    },
  };
}

export const chorus: EffectModule = { def, create };
