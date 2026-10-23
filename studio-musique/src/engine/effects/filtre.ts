// Filtre résonant 12 ou 24 dB/octave, avec LFO synchronisé au tempo.
import type { ParamValue } from '../../project/types';
import { choice, num } from '../defs';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';
import { SyncedLfo } from './lfo';
import { responseDb } from './response';

const LFO_DIVISIONS: [string, string, number][] = [
  ['16', '4 mesures', 16], ['8', '2 mesures', 8], ['4', '1 mesure', 4], ['2', '1/2', 2],
  ['1', '1/4', 1], ['0.5', '1/8', 0.5], ['0.25', '1/16', 0.25],
];

const def: PluginDef = {
  type: 'filtre', kind: 'effet', name: 'Filtre',
  description: 'Filtre résonant avec balayage automatique calé sur le tempo.',
  view: 'filtre-courbe',
  params: [
    choice('type', 'Type', [['lowpass', 'Passe-bas'], ['highpass', 'Passe-haut'], ['bandpass', 'Passe-bande'], ['notch', 'Coupe-bande']], 'lowpass', 'Quelles fréquences le filtre laisse passer.', { group: 'Filtre' }),
    num('frequence', 'Fréquence', 20, 20000, 1200, 'Fréquence de coupure.', { group: 'Filtre', unit: 'Hz', curve: 'log' }),
    num('resonance', 'Résonance', 0.1, 20, 1, 'Accentue les fréquences autour de la coupure.', { group: 'Filtre', step: 0.1 }),
    choice('pente', 'Pente', [['12', '12 dB/octave'], ['24', '24 dB/octave']], '12', 'Raideur du filtre.', { group: 'Filtre' }),
    choice('lfoforme', 'Forme', [['sine', 'Sinus'], ['triangle', 'Triangle'], ['square', 'Carré'], ['sawtooth', 'Scie']], 'sine', 'Forme du balayage.', { group: 'LFO' }),
    choice('lfodivision', 'Vitesse', LFO_DIVISIONS.map(([v, l]) => [v, l] as [string, string]), '4', 'Durée d’un balayage, en valeur de note.', { group: 'LFO' }),
    num('lfoquantite', 'Quantité', 0, 4, 0, 'Amplitude du balayage, en octaves.', { group: 'LFO', step: 0.01 }),
  ],
};

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const f1 = ctx.createBiquadFilter();
  const f2 = ctx.createBiquadFilter();
  const output = ctx.createGain();
  const single = ctx.createGain();
  const double = ctx.createGain();
  f1.connect(single).connect(output);
  f1.connect(f2).connect(double).connect(output);
  const lfo = new SyncedLfo(ctx);
  lfo.setTempo(host.bpm());
  const depth = ctx.createGain();
  depth.gain.value = 0;
  lfo.output.connect(depth);
  depth.connect(f1.detune);
  depth.connect(f2.detune);
  let steep = false;

  return {
    input: f1,
    output,
    setParams(p: Record<string, ParamValue>) {
      const t = ctx.currentTime;
      for (const f of [f1, f2]) {
        f.type = String(p.type) as BiquadFilterType;
        f.frequency.setTargetAtTime(Number(p.frequence), t, 0.005);
        f.Q.setTargetAtTime(Number(p.resonance), t, 0.005);
      }
      steep = p.pente === '24';
      single.gain.setTargetAtTime(steep ? 0 : 1, t, 0.005);
      double.gain.setTargetAtTime(steep ? 1 : 0, t, 0.005);
      lfo.setShape(String(p.lfoforme) as OscillatorType);
      lfo.setBeats(LFO_DIVISIONS.find(([v]) => v === p.lfodivision)?.[2] ?? 4);
      depth.gain.setTargetAtTime(Number(p.lfoquantite) * 1200, t, 0.01);
    },
    setTempo: (bpm) => lfo.setTempo(bpm),
    onTransport: (info) => lfo.onTransport(info),
    frequencyResponse(freqs, magDb) {
      responseDb(steep ? [f1, f2] : [f1], freqs, magDb);
    },
    dispose() {
      lfo.dispose();
      for (const n of [f1, f2, output, single, double, depth]) n.disconnect();
    },
  };
}

export const filtre: EffectModule = { def, create };
