// Pompe : baisse de volume rythmée façon « sidechain », synchronisée au tempo et calée sur les temps.
import type { ParamValue } from '../../project/types';
import { choice, num } from '../defs';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';
import { SyncedLfo } from './lfo';

const DIVISIONS: [string, string, number][] = [['4', '1 mesure', 4], ['2', '1/2', 2], ['1', '1/4', 1], ['0.5', '1/8', 0.5]];
const CURVES: Record<string, number> = { lineaire: 1, douce: 2, forte: 4 };

const def: PluginDef = {
  type: 'pompe', kind: 'effet', name: 'Pompe',
  description: 'Le volume plonge sur chaque temps puis remonte : l’effet « qui respire » de la musique électronique.',
  params: [
    choice('division', 'Rythme', DIVISIONS.map(([v, l]) => [v, l] as [string, string]), '1', 'Fréquence des plongées, en valeur de note.'),
    num('profondeur', 'Profondeur', 0, 1, 0.8, 'Jusqu’où le volume descend.', { step: 0.01 }),
    choice('courbe', 'Courbe', [['lineaire', 'Linéaire'], ['douce', 'Douce'], ['forte', 'Forte']], 'douce', 'Forme de la remontée du volume.'),
  ],
};

/** Forme d'un cycle (0 = plein volume, -1 = plongée), et sa moyenne. Exportée pour les tests. */
export function pumpShape(k: number, N = 1024): { shape: Float32Array<ArrayBuffer>; mean: number } {
  const shape = new Float32Array(N);
  const attack = 0.02;                  // plongée en 2 % du cycle : pas de clic
  let mean = 0;
  for (let i = 0; i < N; i++) {
    const ph = i / N;
    const v = ph < attack ? -ph / attack : -Math.pow(1 - (ph - attack) / (1 - attack), k);
    shape[i] = v;
    mean += v;
  }
  return { shape, mean: mean / N };
}

function waveFor(ctx: BaseAudioContext, k: number): { wave: PeriodicWave; mean: number } {
  const { shape, mean } = pumpShape(k);
  const H = 96;
  const N = shape.length;
  const real = new Float32Array(H + 1);
  const imag = new Float32Array(H + 1);
  for (let h = 1; h <= H; h++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * h * i) / N;
      re += (shape[i] ?? 0) * Math.cos(a);
      im += (shape[i] ?? 0) * Math.sin(a);
    }
    real[h] = (2 * re) / N;
    imag[h] = (2 * im) / N;
  }
  return { wave: ctx.createPeriodicWave(real, imag, { disableNormalization: true }), mean };
}

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const vca = ctx.createGain();
  const depth = ctx.createGain();
  depth.gain.value = 0;
  const lfo = new SyncedLfo(ctx);
  lfo.setTempo(host.bpm());
  lfo.output.connect(depth).connect(vca.gain);
  const waves = new Map<number, { wave: PeriodicWave; mean: number }>();
  let curve = '';

  return {
    input: vca,
    output: vca,
    setParams(p: Record<string, ParamValue>) {
      const t = ctx.currentTime;
      const k = CURVES[String(p.courbe)] ?? 2;
      let w = waves.get(k);
      if (!w) {
        w = waveFor(ctx, k);
        waves.set(k, w);
      }
      if (curve !== String(p.courbe)) {
        curve = String(p.courbe);
        lfo.setShape(w.wave);
      }
      lfo.setBeats(DIVISIONS.find(([v]) => v === p.division)?.[2] ?? 1);
      const d = Number(p.profondeur);
      depth.gain.setTargetAtTime(d, t, 0.01);
      vca.gain.setTargetAtTime(1 + d * w.mean, t, 0.01);
    },
    setTempo: (bpm) => lfo.setTempo(bpm),
    onTransport: (info) => lfo.onTransport(info),
    dispose() {
      lfo.dispose();
      depth.disconnect();
      vca.disconnect();
    },
  };
}

export const pompe: EffectModule = { def, create };
