// Phaser : 4 à 12 filtres passe-tout balayés par un LFO, mêlés au son direct pour creuser des encoches qui tournent.
import type { ParamValue } from '../../project/types';
import { choice, num } from '../defs';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';
import { SyncedLfo } from './lfo';

export const ETAGES_MAX = 12;
const SYNCHRO: [string, string, number][] = [
  ['libre', 'Libre (Hz)', 0], ['16', '4 mesures', 16], ['8', '2 mesures', 8], ['4', '1 mesure', 4],
  ['2', '1/2', 2], ['1', '1/4', 1], ['0.5', '1/8', 0.5],
];

const def: PluginDef = {
  type: 'phaser', kind: 'effet', name: 'Phaser',
  description: 'Fait tourner des creux dans le spectre : le balayage « spatial » des nappes et des charleys.',
  params: [
    choice('etages', 'Étages', [['4', '4'], ['6', '6'], ['8', '8'], ['10', '10'], ['12', '12']], '6', 'Nombre de filtres : plus il y en a, plus il y a de creux.'),
    num('frequence', 'Centre', 100, 5000, 700, 'Fréquence autour de laquelle les creux se promènent.', { unit: 'Hz', curve: 'log' }),
    num('profondeur', 'Profondeur', 0, 1, 0.7, 'Amplitude du balayage (jusqu’à ±3 octaves).', { step: 0.01 }),
    choice('synchro', 'Rythme', SYNCHRO.map(([v, l]) => [v, l] as [string, string]), 'libre', 'Vitesse libre en Hz, ou calée sur le tempo.', { group: 'Vitesse' }),
    num('vitesse', 'Vitesse', 0.02, 10, 0.4, 'Vitesse du balayage en mode libre.', { group: 'Vitesse', unit: 'Hz', curve: 'log' }),
    num('reinjection', 'Réinjection', 0, 0.9, 0.4, 'Renvoie la sortie à l’entrée : creux plus marqués, son plus métallique.', { step: 0.01 }),
    num('melange', 'Mélange', 0, 1, 0.5, 'Part du son déphasé. 50 % donne les creux les plus profonds.', { step: 0.01 }),
  ],
};

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const input = ctx.createGain();
  const output = ctx.createGain();
  const sec = ctx.createGain();
  const humide = ctx.createGain();
  const somme = ctx.createGain();           // entrée de la chaîne : son + réinjection
  const retour = ctx.createGain();
  const boucle = ctx.createDelay(0.01);     // une boucle Web Audio passe obligatoirement par un retard
  boucle.delayTime.value = 0;
  retour.gain.value = 0;
  const filtres = Array.from({ length: ETAGES_MAX }, () => {
    const f = ctx.createBiquadFilter();
    f.type = 'allpass';
    f.Q.value = 0.5;
    return f;
  });
  // Sorties possibles après 4, 6, …, 12 étages ; une seule est ouverte.
  const prises = new Map<number, GainNode>();
  input.connect(sec).connect(output);
  input.connect(somme);
  let prec: AudioNode = somme;
  for (const [i, f] of filtres.entries()) {
    prec.connect(f);
    prec = f;
    const n = i + 1;
    if (n % 2 === 0 && n >= 4) {
      const g = ctx.createGain();
      g.gain.value = 0;
      f.connect(g).connect(humide);
      g.connect(retour);
      prises.set(n, g);
    }
  }
  humide.connect(output);
  retour.connect(boucle).connect(somme);

  // Deux sources de balayage : un oscillateur libre et un LFO calé sur le tempo.
  const libre = ctx.createOscillator();
  libre.type = 'sine';
  libre.start();
  const gLibre = ctx.createGain();
  const synchro = new SyncedLfo(ctx);
  synchro.setTempo(host.bpm());
  synchro.setShape('triangle');
  const gSynchro = ctx.createGain();
  const amplitude = ctx.createGain();
  libre.connect(gLibre).connect(amplitude);
  synchro.output.connect(gSynchro).connect(amplitude);
  for (const f of filtres) amplitude.connect(f.detune);

  return {
    input,
    output,
    setParams(p: Record<string, ParamValue>) {
      const t = ctx.currentTime;
      const n = Number(p.etages) || 6;
      for (const [k, g] of prises) g.gain.setTargetAtTime(k === n ? 1 : 0, t, 0.01);
      for (const f of filtres) f.frequency.setTargetAtTime(Number(p.frequence), t, 0.01);
      amplitude.gain.setTargetAtTime(Number(p.profondeur) * 3600, t, 0.01);
      const s = SYNCHRO.find(([v]) => v === p.synchro)?.[2] ?? 0;
      gLibre.gain.setTargetAtTime(s ? 0 : 1, t, 0.01);
      gSynchro.gain.setTargetAtTime(s ? 1 : 0, t, 0.01);
      if (s) synchro.setBeats(s);
      libre.frequency.setTargetAtTime(Number(p.vitesse), t, 0.01);
      retour.gain.setTargetAtTime(-Number(p.reinjection), t, 0.01);
      const m = Number(p.melange);
      humide.gain.setTargetAtTime(m, t, 0.01);
      sec.gain.setTargetAtTime(1 - m, t, 0.01);
    },
    setTempo: (bpm) => synchro.setTempo(bpm),
    onTransport: (info) => synchro.onTransport(info),
    dispose() {
      libre.stop();
      synchro.dispose();
      for (const n of [input, output, sec, humide, somme, retour, boucle, libre, gLibre, gSynchro, amplitude, ...filtres, ...prises.values()]) n.disconnect();
    },
  };
}

export const phaser: EffectModule = { def, create };
