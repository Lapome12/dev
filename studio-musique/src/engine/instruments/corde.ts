// Corde : synthèse Karplus-Strong (bruit injecté dans une ligne à retard filtrée).
// Une boucle de retard en Web Audio ne descend pas sous 128 échantillons : on calcule donc
// chaque note en JavaScript dans un tampon (mis en cache), puis on le lit. Bruit à graine fixe.
import type { ParamValue } from '../../project/types';
import { midiToFreq, seededRandom } from '../context';
import { num } from '../defs';
import type { PluginDef } from '../params';
import { MAX_VOICES, MIN_EDGE_SEC } from '../voices';
import { NodeVoice, type Instrument, type InstrumentHost, type InstrumentModule, type NoteRequest } from './instrument';

const def: PluginDef = {
  type: 'corde', kind: 'instrument', name: 'Corde',
  description: 'Corde pincée par modèle physique : guitare, harpe, pizzicato.',
  params: [
    num('brillance', 'Brillance', 0, 1, 0.6, 'Corde plus brillante (métal) ou plus douce (nylon).', { group: 'Corde', step: 0.01 }),
    num('maintien', 'Maintien', 0, 1, 0.7, 'Durée pendant laquelle la corde résonne.', { group: 'Corde', step: 0.01 }),
    num('position', 'Point de pincement', 0.05, 0.5, 0.2, 'Pincer près du chevalet (sec) ou au milieu de la corde (rond).', { group: 'Corde', step: 0.01 }),
    num('attaque', 'Attaque', 0, 1, 0.5, 'Force du pincement : plus de bruit au début de la note.', { group: 'Corde', step: 0.01 }),
    num('relachement', 'Étouffement', 3, 2000, 120, 'Temps d’étouffement de la corde à la fin de la note.', { group: 'Jeu', unit: 'ms', curve: 'log' }),
    num('volume', 'Volume', 0, 1, 0.8, 'Volume de sortie de l’instrument.', { step: 0.01 }),
  ],
};

export interface PluckOptions { brillance: number; maintien: number; position: number; attaque: number }

/** Calcule une note de corde pincée (mono). Exportée pour les tests. */
export function pluck(freq: number, sampleRate: number, o: PluckOptions, seed = 1): Float32Array<ArrayBuffer> {
  // Perte par aller-retour de la corde : de 0,990 (étouffée) à 0,9995 (très longue).
  const g = 0.99 + 0.0095 * Math.pow(o.maintien, 0.5);
  // Filtre de boucle : moyenne pondérée entre deux échantillons ; b = 0,5 sombre, 0,05 brillant.
  const b = 0.5 - 0.45 * o.brillance;
  const period = sampleRate / freq;
  const delay = Math.max(2, period - b);        // compense le retard du filtre de boucle
  const seconds = Math.min(8, Math.max(0.3, Math.log(1e-3) / (freq * Math.log(g))));
  const length = Math.ceil(seconds * sampleRate);
  const y = new Float32Array(length);

  // Excitation : une période de bruit, adoucie selon la brillance, creusée selon le point de pincement.
  const rnd = seededRandom(seed);
  const exLen = Math.max(2, Math.round(period));
  const ex = new Float32Array(exLen);
  let lp = 0;
  const smooth = 0.15 + 0.8 * o.brillance;
  for (let i = 0; i < exLen; i++) {
    lp += smooth * (rnd() * 2 - 1 - lp);
    ex[i] = lp;
  }
  const comb = Math.max(1, Math.round(o.position * exLen));
  const exc = new Float32Array(exLen);
  let mean = 0;
  for (let i = 0; i < exLen; i++) {
    exc[i] = (ex[i] ?? 0) - (i >= comb ? ex[i - comb] ?? 0 : 0);
    mean += exc[i] ?? 0;
  }
  mean /= exLen;
  let peak = 1e-9;
  for (let i = 0; i < exLen; i++) {
    exc[i] = (exc[i] ?? 0) - mean;
    peak = Math.max(peak, Math.abs(exc[i] ?? 0));
  }
  const exGain = (0.5 + 0.5 * o.attaque) / peak;

  const di = Math.floor(delay);
  const frac = delay - di;
  for (let n = 0; n < length; n++) {
    const a = n - di >= 0 ? y[n - di] ?? 0 : 0;
    const c = n - di - 1 >= 0 ? y[n - di - 1] ?? 0 : 0;
    const d2 = n - di - 2 >= 0 ? y[n - di - 2] ?? 0 : 0;
    const cur = a + (c - a) * frac;              // lecture fractionnaire (accord juste)
    const prev = c + (d2 - c) * frac;
    const fb = g * ((1 - b) * cur + b * prev);
    y[n] = (n < exLen ? (exc[n] ?? 0) * exGain : 0) + fb;
  }
  // Fondu de fin pour éviter tout clic si le tampon s'arrête avant le silence.
  const fade = Math.min(length, Math.round(0.02 * sampleRate));
  for (let i = 0; i < fade; i++) y[length - 1 - i] = (y[length - 1 - i] ?? 0) * (i / fade);
  return y;
}

function create(host: InstrumentHost): Instrument {
  const { ctx } = host;
  const output = ctx.createGain();
  let p: Record<string, ParamValue> = {};
  const cache = new Map<string, AudioBuffer>();
  const n = (k: string): number => Number(p[k] ?? 0);

  function buffer(freq: number): AudioBuffer {
    const o = { brillance: n('brillance'), maintien: n('maintien'), position: n('position'), attaque: n('attaque') };
    const key = `${freq.toFixed(3)}|${o.brillance}|${o.maintien}|${o.position}|${o.attaque}`;
    let buf = cache.get(key);
    if (!buf) {
      const data = pluck(freq, ctx.sampleRate, o, Math.round(freq * 7));
      buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.copyToChannel(data, 0);
      if (cache.size > 96) cache.delete(cache.keys().next().value as string);
      cache.set(key, buf);
    }
    return buf;
  }

  function noteOn(req: NoteRequest): NodeVoice {
    const t = req.time;
    const voice = new NodeVoice(ctx, req.pitch, t, output);
    const src = ctx.createBufferSource();
    src.buffer = buffer(midiToFreq(req.pitch + req.transpose));
    const vca = ctx.createGain();
    vca.gain.value = 0;
    src.connect(vca).connect(voice.out);
    voice.addNodes(vca);
    voice.addSource(src);
    voice.envelope(vca.gain, { a: MIN_EDGE_SEC, d: 0.01, s: 1, r: Math.max(MIN_EDGE_SEC, n('relachement') / 1000) }, 0.25 + 0.6 * req.velocity);
    voice.endAt(t + src.buffer.duration);
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
      cache.clear();
      output.disconnect();
    },
  };
}

export const corde: InstrumentModule = { def, create };
