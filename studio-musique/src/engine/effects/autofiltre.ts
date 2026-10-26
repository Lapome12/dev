// Autofiltre : un filtre qui s'ouvre tout seul, par LFO calé sur le tempo (jusqu'à 8 mesures, l'outil des montées)
// ou par suiveur d'enveloppe (plus on joue fort, plus il s'ouvre).
import type { ParamValue } from '../../project/types';
import { choice, num } from '../defs';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';
import { SyncedLfo } from './lfo';
import { responseDb } from './response';

export const DIVISIONS_AUTOFILTRE: [string, string, number][] = [
  ['32', '8 mesures', 32], ['16', '4 mesures', 16], ['8', '2 mesures', 8], ['4', '1 mesure', 4],
  ['2', '1/2', 2], ['1', '1/4', 1], ['0.5', '1/8', 0.5], ['0.25', '1/16', 0.25],
];

const def: PluginDef = {
  type: 'autofiltre', kind: 'effet', name: 'Autofiltre',
  description: 'Filtre qui s’ouvre et se ferme tout seul, au rythme du morceau ou du jeu : idéal pour les montées.',
  view: 'filtre-courbe',
  params: [
    choice('type', 'Type', [['lowpass', 'Passe-bas'], ['highpass', 'Passe-haut'], ['bandpass', 'Passe-bande']], 'lowpass', 'Quelles fréquences le filtre laisse passer.', { group: 'Filtre' }),
    num('frequence', 'Fréquence', 20, 20000, 500, 'Fréquence de départ du filtre.', { group: 'Filtre', unit: 'Hz', curve: 'log' }),
    num('resonance', 'Résonance', 0.1, 20, 4, 'Accentue les fréquences autour de la coupure.', { group: 'Filtre', step: 0.1 }),
    choice('pente', 'Pente', [['12', '12 dB/octave'], ['24', '24 dB/octave']], '24', 'Raideur du filtre.', { group: 'Filtre' }),
    choice('source', 'Mouvement', [['lfo', 'LFO calé sur le tempo'], ['enveloppe', 'Suiveur d’enveloppe']], 'lfo', 'Ce qui fait bouger le filtre.', { group: 'Mouvement' }),
    num('quantite', 'Quantité', -6, 6, 3, 'Amplitude du mouvement, en octaves (négatif : le filtre se ferme).', { group: 'Mouvement', step: 0.01 }),
    choice('forme', 'Forme', [['sine', 'Sinus'], ['triangle', 'Triangle'], ['rampe', 'Rampe montante'], ['square', 'Carré'], ['aleatoire', 'Aléatoire']], 'rampe', 'Forme du LFO. Rampe sur 8 mesures : la montée classique.', { group: 'LFO' }),
    choice('division', 'Durée', DIVISIONS_AUTOFILTRE.map(([v, l]) => [v, l] as [string, string]), '32', 'Durée d’un cycle du LFO.', { group: 'LFO' }),
    num('sensibilite', 'Sensibilité', 0, 24, 12, 'Gain avant le suiveur : plus il est haut, plus le filtre réagit.', { group: 'Enveloppe', unit: 'dB', step: 0.1 }),
    num('retour', 'Retour', 10, 1000, 120, 'Temps que met le filtre à se refermer.', { group: 'Enveloppe', unit: 'ms', curve: 'log' }),
  ],
};

/** Rampe montante de 0 à 1 puis retour, et paliers aléatoires (fixes d'une séance à l'autre). Exportés pour les tests. */
export function formeAutofiltre(forme: 'rampe' | 'aleatoire', N = 2048): Float32Array<ArrayBuffer> {
  const out = new Float32Array(N);
  let graine = 12345;
  const hasard = () => { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine / 0x7fffffff; };
  const paliers = Array.from({ length: 16 }, () => hasard() * 2 - 1);
  for (let i = 0; i < N; i++) {
    const ph = i / N;
    out[i] = forme === 'rampe' ? ph * 2 - 1 : paliers[Math.floor(ph * 16)] ?? 0;
  }
  return out;
}

function onde(ctx: BaseAudioContext, forme: Float32Array): PeriodicWave {
  const N = forme.length;
  const H = 128;
  const real = new Float32Array(H + 1);
  const imag = new Float32Array(H + 1);
  for (let h = 1; h <= H; h++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * h * i) / N;
      re += (forme[i] ?? 0) * Math.cos(a);
      im += (forme[i] ?? 0) * Math.sin(a);
    }
    // Atténuation douce des harmoniques hautes : pas d'ondulation de Gibbs au saut de la rampe.
    const sigma = Math.sin((Math.PI * h) / (H + 1)) / ((Math.PI * h) / (H + 1));
    real[h] = ((2 * re) / N) * sigma;
    imag[h] = ((2 * im) / N) * sigma;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}

/** |x| : redresse le signal pour le suiveur d'enveloppe. */
function redresseur(size = 1025): Float32Array<ArrayBuffer> {
  const c = new Float32Array(size);
  for (let i = 0; i < size; i++) c[i] = Math.abs((i / (size - 1)) * 2 - 1);
  return c;
}

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const input = ctx.createGain();
  const f1 = ctx.createBiquadFilter();
  const f2 = ctx.createBiquadFilter();
  const simple = ctx.createGain();
  const double = ctx.createGain();
  const output = ctx.createGain();
  input.connect(f1);
  f1.connect(simple).connect(output);
  f1.connect(f2).connect(double).connect(output);

  const lfo = new SyncedLfo(ctx);
  lfo.setTempo(host.bpm());
  const gLfo = ctx.createGain();
  // Suiveur : gain → |x| → passe-bas (lissage) → mouvement.
  const pre = ctx.createGain();
  const abs = ctx.createWaveShaper();
  abs.curve = redresseur();
  const lisse = ctx.createBiquadFilter();
  lisse.type = 'lowpass';
  lisse.Q.value = 0.5;
  const gEnv = ctx.createGain();
  input.connect(pre).connect(abs).connect(lisse).connect(gEnv);
  const octaves = ctx.createGain();
  lfo.output.connect(gLfo).connect(octaves);
  gEnv.connect(octaves);
  octaves.connect(f1.detune);
  octaves.connect(f2.detune);
  const ondes = new Map<string, PeriodicWave>();
  let forme = '';
  let deuxPoles = true;

  return {
    input,
    output,
    setParams(p: Record<string, ParamValue>) {
      const t = ctx.currentTime;
      for (const f of [f1, f2]) {
        f.type = String(p.type) as BiquadFilterType;
        f.frequency.setTargetAtTime(Number(p.frequence), t, 0.005);
        f.Q.setTargetAtTime(Number(p.resonance), t, 0.005);
      }
      deuxPoles = p.pente !== '24';
      simple.gain.setTargetAtTime(deuxPoles ? 1 : 0, t, 0.005);
      double.gain.setTargetAtTime(deuxPoles ? 0 : 1, t, 0.005);
      if (forme !== p.forme) {
        forme = String(p.forme);
        if (forme === 'rampe' || forme === 'aleatoire') {
          let w = ondes.get(forme);
          if (!w) { w = onde(ctx, formeAutofiltre(forme)); ondes.set(forme, w); }
          lfo.setShape(w);
        } else lfo.setShape(forme as OscillatorType);
      }
      lfo.setBeats(DIVISIONS_AUTOFILTRE.find(([v]) => v === p.division)?.[2] ?? 32);
      const env = p.source === 'enveloppe';
      // LFO : -1..1 autour de la fréquence de départ décalée d'une demi-amplitude, pour que la rampe parte de la fréquence choisie.
      const q = Number(p.quantite) * 1200;
      gLfo.gain.setTargetAtTime(env ? 0 : q / 2, t, 0.01);
      octaves.gain.setTargetAtTime(1, t, 0.01);
      for (const f of [f1, f2]) f.detune.setTargetAtTime(env ? 0 : q / 2, t, 0.01);
      gEnv.gain.setTargetAtTime(env ? q : 0, t, 0.01);
      pre.gain.setTargetAtTime(Math.pow(10, Number(p.sensibilite) / 20), t, 0.01);
      lisse.frequency.setTargetAtTime(1000 / (2 * Math.PI * Number(p.retour)), t, 0.01);
    },
    setTempo: (bpm) => lfo.setTempo(bpm),
    onTransport: (info) => lfo.onTransport(info),
    frequencyResponse(freqs, magDb) {
      responseDb(deuxPoles ? [f1] : [f1, f2], freqs, magDb);
    },
    dispose() {
      lfo.dispose();
      for (const n of [input, f1, f2, simple, double, output, gLfo, pre, abs, lisse, gEnv, octaves]) n.disconnect();
    },
  };
}

export const autofiltre: EffectModule = { def, create };
