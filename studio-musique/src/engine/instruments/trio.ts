// Trio : synthé soustractif à 3 oscillateurs (plus bruit), unisson jusqu'à 7 voix, filtre avec
// enveloppe, 2 ADSR, LFO vers hauteur / filtre / volume, portamento, mono ou poly.
import type { ParamValue } from '../../project/types';
import { midiToFreq, noiseBuffer } from '../context';
import { adsrParams, choice, num, toggle } from '../defs';
import type { PluginDef } from '../params';
import { adsrFrom, MAX_VOICES } from '../voices';
import { NodeVoice, safeDisconnect, type Instrument, type InstrumentHost, type InstrumentModule, type NoteRequest } from './instrument';

const WAVES: [string, string][] = [
  ['sine', 'Sinus'], ['triangle', 'Triangle'], ['sawtooth', 'Scie'], ['square', 'Carré'], ['bruit', 'Bruit'],
];

function oscParams(i: number, onde: string, niveau: number): PluginDef['params'] {
  const group = `Oscillateur ${i}`;
  return [
    choice(`o${i}onde`, 'Forme', WAVES, onde, 'Forme d’onde de l’oscillateur.', { group }),
    num(`o${i}octave`, 'Octave', -3, 3, 0, 'Décale l’oscillateur par octaves.', { group, step: 1 }),
    num(`o${i}demi`, 'Demi-tons', -12, 12, 0, 'Décale l’oscillateur par demi-tons.', { group, step: 1, unit: 'demi-tons' }),
    num(`o${i}fin`, 'Fin', -100, 100, 0, 'Accord fin, en centièmes de demi-ton.', { group, step: 1, unit: 'cents' }),
    num(`o${i}niveau`, 'Niveau', 0, 1, niveau, 'Volume de l’oscillateur dans le mélange.', { group, step: 0.01 }),
  ];
}

const def: PluginDef = {
  type: 'trio', kind: 'instrument', name: 'Trio',
  description: 'Synthé soustractif à 3 oscillateurs : basses, leads, nappes, cuivres.',
  view: 'adsr',
  params: [
    ...oscParams(1, 'sawtooth', 0.8),
    ...oscParams(2, 'square', 0.4),
    ...oscParams(3, 'sine', 0),
    num('unisson', 'Voix', 1, 7, 1, 'Nombre de copies désaccordées de chaque oscillateur (son plus large).', { group: 'Unisson', step: 1 }),
    num('desaccord', 'Désaccord', 0, 100, 15, 'Écart de hauteur entre les copies de l’unisson.', { group: 'Unisson', unit: 'cents' }),
    num('largeur', 'Largeur', 0, 1, 0.6, 'Répartition des copies de l’unisson entre gauche et droite.', { group: 'Unisson', step: 0.01 }),
    choice('filtre', 'Type', [['lowpass', 'Passe-bas'], ['highpass', 'Passe-haut'], ['bandpass', 'Passe-bande']], 'lowpass', 'Type de filtre appliqué au mélange.', { group: 'Filtre' }),
    num('coupure', 'Coupure', 20, 20000, 6000, 'Fréquence de coupure du filtre.', { group: 'Filtre', unit: 'Hz', curve: 'log' }),
    num('resonance', 'Résonance', 0.1, 20, 1, 'Accentue les fréquences autour de la coupure.', { group: 'Filtre', step: 0.1 }),
    num('envfiltre', 'Enveloppe', -4, 4, 1, 'Ouverture du filtre par son enveloppe, en octaves.', { group: 'Filtre', step: 0.1 }),
    ...adsrParams('f', 'Enveloppe du filtre', { a: 5, d: 400, s: 0.3, r: 300 }),
    ...adsrParams('amp', 'Enveloppe du volume', { a: 5, d: 300, s: 0.7, r: 200 }),
    choice('lfoonde', 'Forme', WAVES.slice(0, 4), 'sine', 'Forme du LFO (modulation lente).', { group: 'LFO' }),
    num('lfovitesse', 'Vitesse', 0.05, 20, 5, 'Vitesse du LFO.', { group: 'LFO', unit: 'Hz', curve: 'log' }),
    choice('lfocible', 'Cible', [['hauteur', 'Hauteur (vibrato)'], ['filtre', 'Filtre'], ['volume', 'Volume (trémolo)']], 'hauteur', 'Ce que le LFO fait bouger.', { group: 'LFO' }),
    num('lfoquantite', 'Quantité', 0, 1, 0, 'Intensité du LFO.', { group: 'LFO', step: 0.01 }),
    toggle('mono', 'Mono', false, 'Une seule note à la fois, avec glissé entre les notes.', { group: 'Jeu' }),
    num('portamento', 'Glissé', 0, 2000, 0, 'Durée du glissé d’une note à l’autre en mode mono.', { group: 'Jeu', unit: 'ms', curve: 'log' }),
    num('volume', 'Volume', 0, 1, 0.7, 'Volume de sortie de l’instrument.', { step: 0.01 }),
  ],
};

function create(host: InstrumentHost): Instrument {
  const { ctx } = host;
  const output = ctx.createGain();
  const tremolo = ctx.createGain();
  tremolo.connect(output);

  // LFO partagé par toutes les voix : un oscillateur, trois sorties dosées selon la cible.
  const lfo = ctx.createOscillator();
  const lfoPitch = ctx.createGain();
  const lfoFilter = ctx.createGain();
  const lfoVolume = ctx.createGain();
  lfoPitch.gain.value = lfoFilter.gain.value = lfoVolume.gain.value = 0;
  lfo.connect(lfoPitch);
  lfo.connect(lfoFilter);
  lfo.connect(lfoVolume).connect(tremolo.gain);
  lfo.start();

  let p: Record<string, ParamValue> = {};
  const n = (k: string): number => Number(p[k] ?? 0);
  const s = (k: string): string => String(p[k] ?? '');

  function setParams(next: Record<string, ParamValue>): void {
    p = next;
    const t = ctx.currentTime;
    output.gain.setTargetAtTime(n('volume'), t, 0.003);
    lfo.type = s('lfoonde') as OscillatorType;
    lfo.frequency.setTargetAtTime(n('lfovitesse'), t, 0.01);
    const q = n('lfoquantite');
    const target = s('lfocible');
    lfoPitch.gain.setTargetAtTime(target === 'hauteur' ? q * 100 : 0, t, 0.01);
    lfoFilter.gain.setTargetAtTime(target === 'filtre' ? q * 2400 : 0, t, 0.01);
    lfoVolume.gain.setTargetAtTime(target === 'volume' ? q * 0.5 : 0, t, 0.01);
    tremolo.gain.setTargetAtTime(target === 'volume' ? 1 - q * 0.5 : 1, t, 0.01);
  }

  function noteOn(req: NoteRequest): ReturnType<Instrument['noteOn']> {
    const t = req.time;
    const voice = new NodeVoice(ctx, req.pitch, t, tremolo);
    const filter = ctx.createBiquadFilter();
    filter.type = s('filtre') as BiquadFilterType;
    filter.frequency.value = n('coupure');
    filter.Q.value = n('resonance');
    const vca = ctx.createGain();
    vca.gain.value = 0;
    filter.connect(vca).connect(voice.out);
    voice.addNodes(filter, vca);
    lfoFilter.connect(filter.detune);
    voice.onDispose(() => safeDisconnect(lfoFilter, filter.detune));

    const freq = midiToFreq(req.pitch + req.transpose);
    const glide = p.mono === true ? n('portamento') / 1000 : 0;
    const fromFreq = req.glideFrom !== undefined && glide > 0 ? midiToFreq(req.glideFrom + req.transpose) : null;
    const unison = Math.max(1, Math.round(n('unisson')));
    const spread = n('desaccord');
    const width = n('largeur');

    for (let i = 1; i <= 3; i++) {
      const level = n(`o${i}niveau`);
      if (level <= 0) continue;
      const wave = s(`o${i}onde`);
      const offset = n(`o${i}octave`) * 1200 + n(`o${i}demi`) * 100 + n(`o${i}fin`);
      const mix = ctx.createGain();
      mix.gain.value = level / Math.sqrt(unison);
      mix.connect(filter);
      voice.addNodes(mix);
      for (let u = 0; u < unison; u++) {
        const pos = unison === 1 ? 0 : (u / (unison - 1)) * 2 - 1;   // -1..1
        let src: AudioScheduledSourceNode;
        if (wave === 'bruit') {
          const b = ctx.createBufferSource();
          b.buffer = noiseBuffer(ctx);
          b.loop = true;
          src = b;
        } else {
          const o = ctx.createOscillator();
          o.type = wave as OscillatorType;
          o.detune.value = offset + pos * spread;
          if (fromFreq !== null) {
            o.frequency.setValueAtTime(fromFreq, t);
            o.frequency.exponentialRampToValueAtTime(freq, t + glide);
          } else {
            o.frequency.value = freq;
          }
          lfoPitch.connect(o.detune);
          voice.onDispose(() => safeDisconnect(lfoPitch, o.detune));
          src = o;
        }
        let last: AudioNode = src;
        if (unison > 1 && width > 0) {
          const pan = ctx.createStereoPanner();
          pan.pan.value = pos * width;
          src.connect(pan);
          voice.addNodes(pan);
          last = pan;
        }
        last.connect(mix);
        voice.addSource(src, wave === 'bruit' ? ((req.pitch * 0.137 + u * 0.31) % 1.5) : 0);
      }
    }

    voice.envelope(vca.gain, adsrFrom(p, 'amp'), 0.3 * (0.2 + 0.8 * req.velocity));
    const fAmount = n('envfiltre') * 1200;
    if (fAmount !== 0) voice.envelope(filter.detune, adsrFrom(p, 'f'), fAmount);
    return voice;
  }

  return {
    output,
    setParams,
    polyphony: () => (p.mono === true ? 1 : MAX_VOICES),
    noteOn,
    dispose() {
      lfo.stop();
      lfo.disconnect();
      lfoPitch.disconnect();
      lfoFilter.disconnect();
      lfoVolume.disconnect();
      tremolo.disconnect();
      output.disconnect();
    },
  };
}

export const trio: InstrumentModule = { def, create };
