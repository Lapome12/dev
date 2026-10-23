// Échantillon : lecteur des sons importés par l'utilisateur (note de base, début/fin, inversion,
// boucle, ADSR, filtre). Sans son choisi, il joue un petit son synthétisé pour rester audible.
import type { ParamValue } from '../../project/types';
import { adsrParams, choice, num, toggle } from '../defs';
import type { PluginDef } from '../params';
import { adsrFrom, MAX_VOICES } from '../voices';
import { NodeVoice, type Instrument, type InstrumentHost, type InstrumentModule, type NoteRequest } from './instrument';

const def: PluginDef = {
  type: 'echantillon', kind: 'instrument', name: 'Échantillon',
  description: 'Lecteur de vos propres sons (.wav, .mp3…), joués à toutes les hauteurs.',
  view: 'adsr',
  params: [
    // Liste remplie par l'interface avec project.samples (valeur = id du SampleRef).
    choice('sample', 'Son', [], '', 'Son importé joué par cet instrument.', { group: 'Son' }),
    num('racine', 'Note de base', 0, 127, 60, 'Note à laquelle le son est joué à sa hauteur d’origine.', { group: 'Son', step: 1 }),
    num('debut', 'Début', 0, 1, 0, 'Point de départ dans le son.', { group: 'Son', unit: '%', step: 0.001 }),
    num('fin', 'Fin', 0, 1, 1, 'Point de fin dans le son.', { group: 'Son', unit: '%', step: 0.001 }),
    toggle('inverser', 'Inverser', false, 'Joue le son à l’envers.', { group: 'Son' }),
    toggle('boucle', 'Boucle', false, 'Répète la zone début-fin tant que la note est tenue.', { group: 'Son' }),
    ...adsrParams('amp', 'Enveloppe', { a: 3, d: 200, s: 1, r: 80 }),
    choice('filtre', 'Type', [['aucun', 'Aucun'], ['lowpass', 'Passe-bas'], ['highpass', 'Passe-haut'], ['bandpass', 'Passe-bande']], 'aucun', 'Filtre appliqué au son.', { group: 'Filtre' }),
    num('coupure', 'Coupure', 20, 20000, 8000, 'Fréquence de coupure du filtre.', { group: 'Filtre', unit: 'Hz', curve: 'log' }),
    num('resonance', 'Résonance', 0.1, 20, 0.7, 'Accentue les fréquences autour de la coupure.', { group: 'Filtre', step: 0.1 }),
    num('volume', 'Volume', 0, 1, 0.8, 'Volume de sortie de l’instrument.', { step: 0.01 }),
  ],
};

const reversed = new WeakMap<AudioBuffer, AudioBuffer>();
const fallbacks = new WeakMap<BaseAudioContext, AudioBuffer>();

function reverse(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  let r = reversed.get(buf);
  if (!r) {
    r = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c);
      const dst = r.getChannelData(c);
      for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i] ?? 0;
    }
    reversed.set(buf, r);
  }
  return r;
}

/** Son de secours : do 4 (note 60) doux et court, harmoniques décroissantes. */
function fallback(ctx: BaseAudioContext): AudioBuffer {
  let b = fallbacks.get(ctx);
  if (!b) {
    const sr = ctx.sampleRate;
    b = ctx.createBuffer(1, Math.round(sr * 0.8), sr);
    const d = b.getChannelData(0);
    const f = 261.6256;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.003) * Math.exp(-t * 5);
      d[i] = env * 0.6 * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 8));
    }
    fallbacks.set(ctx, b);
  }
  return b;
}

function create(host: InstrumentHost): Instrument {
  const { ctx } = host;
  const output = ctx.createGain();
  let p: Record<string, ParamValue> = {};
  const n = (k: string): number => Number(p[k] ?? 0);

  function noteOn(req: NoteRequest): NodeVoice {
    const t = req.time;
    const voice = new NodeVoice(ctx, req.pitch, t, output);
    const original = host.sample(String(p.sample ?? '')) ?? fallback(ctx);
    const buf = p.inverser === true ? reverse(ctx, original) : original;
    const dur = buf.duration;
    let a = Math.min(n('debut'), n('fin'));
    let b = Math.max(n('debut'), n('fin'));
    if (b - a < 0.001) b = Math.min(1, a + 0.001);
    if (p.inverser === true) [a, b] = [1 - b, 1 - a];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.pow(2, (req.pitch + req.transpose - n('racine')) / 12);
    const loop = p.boucle === true;
    if (loop) {
      src.loop = true;
      src.loopStart = a * dur;
      src.loopEnd = b * dur;
    }
    let last: AudioNode = src;
    const type = String(p.filtre ?? 'aucun');
    if (type !== 'aucun') {
      const f = ctx.createBiquadFilter();
      f.type = type as BiquadFilterType;
      f.frequency.value = n('coupure');
      f.Q.value = n('resonance');
      src.connect(f);
      voice.addNodes(f);
      last = f;
    }
    const vca = ctx.createGain();
    vca.gain.value = 0;
    last.connect(vca).connect(voice.out);
    voice.addNodes(vca);
    voice.addSource(src, a * dur);
    voice.envelope(vca.gain, adsrFrom(p, 'amp'), 0.2 + 0.8 * req.velocity);
    // Fin de la zone : court fondu plutôt qu'une coupure nette.
    if (!loop) {
      const length = ((b - a) * dur) / src.playbackRate.value;
      voice.kill(t + Math.max(0.003, length - 0.005), Math.min(0.005, length));
    }
    return voice;
  }

  return {
    output,
    setParams(next) {
      p = next;
      output.gain.setTargetAtTime(n('volume'), ctx.currentTime, 0.003);
    },
    polyphony: () => MAX_VOICES,
    noteOn,
    dispose() {
      output.disconnect();
    },
  };
}

export const echantillon: InstrumentModule = { def, create };
