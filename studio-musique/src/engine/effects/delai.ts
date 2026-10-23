// Délai stéréo synchronisé au tempo, ping-pong, filtres dans la boucle de réinjection.
import type { ParamValue } from '../../project/types';
import { choice, divisionBeats, num, SYNC_DIVISIONS, toggle } from '../defs';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';

const def: PluginDef = {
  type: 'delai', kind: 'effet', name: 'Délai',
  description: 'Écho stéréo calé sur le tempo, avec rebond gauche-droite.',
  params: [
    toggle('sync', 'Synchro', true, 'Cale le temps de l’écho sur le tempo du morceau.', { group: 'Temps' }),
    choice('division', 'Division', SYNC_DIVISIONS.map(([v, l]) => [v, l] as [string, string]), '0.75', 'Temps de l’écho en valeur de note (si synchro).', { group: 'Temps' }),
    num('temps', 'Temps libre', 1, 2000, 350, 'Temps de l’écho en millisecondes (sans synchro).', { group: 'Temps', unit: 'ms', curve: 'log' }),
    num('reinjection', 'Réinjection', 0, 0.95, 0.4, 'Nombre de répétitions de l’écho.', { group: 'Écho', step: 0.01 }),
    toggle('pingpong', 'Ping-pong', true, 'Les échos rebondissent entre gauche et droite.', { group: 'Écho' }),
    num('aigus', 'Coupe-haut', 200, 20000, 6000, 'Assombrit chaque répétition.', { group: 'Filtres', unit: 'Hz', curve: 'log' }),
    num('graves', 'Coupe-bas', 20, 2000, 150, 'Allège les graves de chaque répétition.', { group: 'Filtres', unit: 'Hz', curve: 'log' }),
  ],
};

const MAX_DELAY = 6;

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const input = ctx.createGain();
  const mono = ctx.createGain();
  mono.channelCount = 1;
  mono.channelCountMode = 'explicit';
  mono.channelInterpretation = 'speakers';
  const dL = ctx.createDelay(MAX_DELAY);
  const dR = ctx.createDelay(MAX_DELAY);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  const fb = ctx.createGain();          // réinjection après filtres
  const toL = ctx.createGain();         // mode simple : L revient sur L
  const toR = ctx.createGain();         // ping-pong : L part vers R
  const fbR = ctx.createGain();         // ping-pong : R revient vers L
  const merger = ctx.createChannelMerger(2);
  const rFromL = ctx.createGain();
  const rFromR = ctx.createGain();
  const output = ctx.createGain();

  input.connect(mono).connect(dL);
  dL.connect(hp).connect(lp).connect(fb);
  fb.connect(toL).connect(dL);
  fb.connect(toR).connect(dR);
  dR.connect(fbR).connect(dL);
  dL.connect(merger, 0, 0);
  dL.connect(rFromL).connect(merger, 0, 1);
  dR.connect(rFromR).connect(merger, 0, 1);
  merger.connect(output);

  let p: Record<string, ParamValue> = {};
  let bpm = host.bpm();

  function apply(): void {
    const t = ctx.currentTime;
    const seconds = p.sync === true ? (divisionBeats(String(p.division)) * 60) / bpm : Number(p.temps) / 1000;
    const d = Math.min(MAX_DELAY, Math.max(0.001, seconds));
    dL.delayTime.setTargetAtTime(d, t, 0.02);
    dR.delayTime.setTargetAtTime(d, t, 0.02);
    const pp = p.pingpong === true ? 1 : 0;
    const r = Number(p.reinjection);
    fb.gain.setTargetAtTime(pp ? 1 : r, t, 0.01);
    toL.gain.setTargetAtTime(pp ? 0 : 1, t, 0.01);
    toR.gain.setTargetAtTime(pp ? r : 0, t, 0.01);
    fbR.gain.setTargetAtTime(pp ? r : 0, t, 0.01);
    rFromL.gain.setTargetAtTime(pp ? 0 : 1, t, 0.01);
    rFromR.gain.setTargetAtTime(pp ? 1 : 0, t, 0.01);
    hp.frequency.setTargetAtTime(Number(p.graves), t, 0.01);
    lp.frequency.setTargetAtTime(Number(p.aigus), t, 0.01);
  }

  return {
    input,
    output,
    setParams(next) {
      p = next;
      apply();
    },
    setTempo(next) {
      bpm = next;
      apply();
    },
    dispose() {
      for (const n of [input, mono, dL, dR, hp, lp, fb, toL, toR, fbR, merger, rFromL, rFromR, output]) n.disconnect();
    },
  };
}

export const delai: EffectModule = { def, create };
