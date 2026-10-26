// Frappe : boîte à rythmes entièrement synthétisée, 12 voix. La voix jouée dépend de la hauteur
// de la note, façon General MIDI (36 grosse caisse, 38 caisse claire, 42 charley fermé…).
import type { ParamValue } from '../../project/types';
import { noiseBuffer } from '../context';
import { num } from '../defs';
import type { ParamDef, PluginDef } from '../params';
import { MAX_VOICES, MIN_EDGE_SEC, STEAL_FADE_SEC, type Voice } from '../voices';
import { NodeVoice, type Instrument, type InstrumentHost, type InstrumentModule, type NoteRequest } from './instrument';

type DrumId = 'gc' | 'rim' | 'cc' | 'clap' | 'tomg' | 'chf' | 'tomm' | 'percu' | 'cho' | 'crash' | 'ride' | 'cloche';

export const DRUMS: { id: DrumId; name: string; pitch: number }[] = [
  { id: 'gc', name: 'Grosse caisse', pitch: 36 },
  { id: 'rim', name: 'Rimshot', pitch: 37 },
  { id: 'cc', name: 'Caisse claire', pitch: 38 },
  { id: 'clap', name: 'Clap', pitch: 39 },
  { id: 'tomg', name: 'Tom grave', pitch: 41 },
  { id: 'chf', name: 'Charley fermé', pitch: 42 },
  { id: 'tomm', name: 'Tom medium', pitch: 45 },
  { id: 'cho', name: 'Charley ouvert', pitch: 46 },
  { id: 'percu', name: 'Percu', pitch: 47 },
  { id: 'crash', name: 'Crash', pitch: 49 },
  { id: 'ride', name: 'Ride', pitch: 51 },
  { id: 'cloche', name: 'Cloche', pitch: 56 },
];

/** Hauteurs General MIDI voisines rangées sur la voix la plus proche. */
const EXTRA: Record<number, DrumId> = {
  35: 'gc', 40: 'cc', 43: 'tomg', 44: 'chf', 48: 'tomm', 50: 'tomm', 52: 'crash', 53: 'ride', 55: 'crash', 57: 'crash', 59: 'ride',
};
/** Autres hauteurs : selon la note dans l'octave (do = grosse caisse, ré = caisse claire…). */
const BY_DEGREE: DrumId[] = ['gc', 'rim', 'cc', 'clap', 'cc', 'tomg', 'chf', 'tomg', 'cloche', 'tomm', 'cho', 'crash'];

export function drumFor(pitch: number): DrumId {
  const exact = DRUMS.find((d) => d.pitch === pitch);
  if (exact) return exact.id;
  return EXTRA[pitch] ?? BY_DEGREE[((pitch % 12) + 12) % 12] ?? 'gc';
}

const DEFAULTS: Record<DrumId, { tone: number; snap: number }> = {
  gc: { tone: 0.5, snap: 0.4 }, rim: { tone: 0.5, snap: 0.5 }, cc: { tone: 0.5, snap: 0.6 }, clap: { tone: 0.5, snap: 0.5 },
  tomg: { tone: 0.4, snap: 0.2 }, chf: { tone: 0.6, snap: 0.3 }, tomm: { tone: 0.5, snap: 0.2 }, cho: { tone: 0.6, snap: 0.3 },
  crash: { tone: 0.5, snap: 0.3 }, cloche: { tone: 0.5, snap: 0.2 }, percu: { tone: 0.4, snap: 0.4 }, ride: { tone: 0.5, snap: 0.4 },
};

function drumParams(d: { id: DrumId; name: string }): ParamDef[] {
  const group = d.name;
  const def = DEFAULTS[d.id];
  return [
    num(`${d.id}accord`, 'Accord', -12, 12, 0, `Hauteur de la voix « ${d.name} ».`, { group, unit: 'demi-tons', step: 0.1 }),
    num(`${d.id}declin`, 'Déclin', 10, 400, 100, `Longueur de la voix « ${d.name} » (100 % = normale).`, { group, unit: '%' }),
    num(`${d.id}tonalite`, 'Tonalité', 0, 1, def.tone, `Son plus sombre ou plus brillant pour « ${d.name} ».`, { group, step: 0.01 }),
    num(`${d.id}claquement`, 'Claquement', 0, 1, def.snap, `Attaque plus ou moins sèche pour « ${d.name} ».`, { group, step: 0.01 }),
    num(`${d.id}niveau`, 'Niveau', 0, 1, 0.8, `Volume de la voix « ${d.name} ».`, { group, step: 0.01 }),
  ];
}

const def: PluginDef = {
  type: 'frappe', kind: 'instrument', name: 'Frappe',
  description: 'Boîte à rythmes synthétisée : 12 voix (grosse caisse, caisse claire, clap, charleys, toms, percu, crash, ride, cloche).',
  params: [
    ...DRUMS.flatMap(drumParams),
    num('caractere', 'Caractère', 0, 1, 0, 'De propre (0) à analogique saturé (1) : plus de grain et de poids.', { group: 'Général', step: 0.01 }),
    num('volume', 'Volume', 0, 1, 0.8, 'Volume de sortie de la boîte à rythmes.', { group: 'Général', step: 0.01 }),
  ],
};

/** Rapports des carrés « métalliques » des cymbales (inharmoniques). */
const METAL = [2, 3, 4.16, 5.43, 6.79, 8.21];

function create(host: InstrumentHost): Instrument {
  const { ctx } = host;
  // Les voix entrent dans « bus », puis la saturation du réglage Caractère, puis la sortie.
  const bus = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '2x';
  const warmth = ctx.createBiquadFilter();
  warmth.type = 'highshelf';
  warmth.frequency.value = 9000;
  const output = ctx.createGain();
  bus.connect(shaper).connect(warmth).connect(output);
  let character = -1;
  let p: Record<string, ParamValue> = {};
  let openHat: Voice | null = null;
  const n = (k: string): number => Number(p[k] ?? 0);

  /** Enveloppe percussive : montée de 3 ms puis décroissance exponentielle ; renvoie la fin. */
  function hit(param: AudioParam, t: number, peak: number, decay: number): number {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + MIN_EDGE_SEC);
    param.setTargetAtTime(0, t + MIN_EDGE_SEC, decay);
    return t + MIN_EDGE_SEC + decay * 7;
  }

  function noise(voice: NodeVoice, offset: number): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    voice.addSource(src, offset);
    return src;
  }

  function osc(voice: NodeVoice, type: OscillatorType, freq: number): OscillatorNode {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    voice.addSource(o);
    return o;
  }

  function filter(voice: NodeVoice, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    voice.addNodes(f);
    return f;
  }

  function gain(voice: NodeVoice): GainNode {
    const g = ctx.createGain();
    g.gain.value = 0;
    voice.addNodes(g);
    return g;
  }

  /** Bouquet de carrés inharmoniques (charleys, crash). */
  function metal(voice: NodeVoice, base: number, dest: AudioNode): void {
    const mix = ctx.createGain();
    mix.gain.value = 0.15;
    voice.addNodes(mix);
    for (const r of METAL) osc(voice, 'square', base * r).connect(mix);
    mix.connect(dest);
  }

  function noteOn(req: NoteRequest): Voice {
    const t = req.time;
    const id = drumFor(req.pitch);
    const voice = new NodeVoice(ctx, req.pitch, t, bus);
    const k = Math.pow(2, n(`${id}accord`) / 12);
    const D = n(`${id}declin`) / 100;
    const T = n(`${id}tonalite`);
    const S = n(`${id}claquement`);
    const v = 0.5 * n(`${id}niveau`) * (0.2 + 0.8 * req.velocity);
    const noiseOffset = (req.pitch * 0.173) % 1.5;
    let end = t;

    switch (id) {
      case 'gc': {
        const o = osc(voice, 'sine', 0);
        const f0 = 120 * k * (1 + T);
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(45 * k, t + 0.07 * (0.6 + 0.8 * (1 - T)));
        const g = gain(voice);
        o.connect(g).connect(voice.out);
        end = hit(g.gain, t, v, 0.11 * D);
        const click = gain(voice);
        noise(voice, noiseOffset).connect(filter(voice, 'highpass', 1500)).connect(click).connect(voice.out);
        end = Math.max(end, hit(click.gain, t, v * S * 0.6, 0.004));
        break;
      }
      case 'cc': {
        const o = osc(voice, 'triangle', 0);
        o.frequency.setValueAtTime(220 * k, t);
        o.frequency.exponentialRampToValueAtTime(170 * k, t + 0.05);
        const g = gain(voice);
        o.connect(g).connect(voice.out);
        end = hit(g.gain, t, v * 0.7, 0.05 * D);
        const gn = gain(voice);
        noise(voice, noiseOffset).connect(filter(voice, 'highpass', 1000 + T * 3500)).connect(gn).connect(voice.out);
        end = Math.max(end, hit(gn.gain, t, v * (0.4 + 0.5 * S), 0.07 * D));
        break;
      }
      case 'clap': {
        const g = gain(voice);
        noise(voice, noiseOffset).connect(filter(voice, 'bandpass', 1100 * (1 + T), 1.2)).connect(g).connect(voice.out);
        // Trois claquements rapprochés, puis la queue.
        g.gain.setValueAtTime(0, t);
        for (let i = 0; i < 3; i++) {
          const ti = t + i * 0.011;
          g.gain.setValueAtTime(0, ti);
          g.gain.linearRampToValueAtTime(v * (0.6 + 0.4 * S), ti + MIN_EDGE_SEC);
          g.gain.setTargetAtTime(0, ti + MIN_EDGE_SEC, 0.004);
        }
        end = hit(g.gain, t + 0.033, v * 0.8, 0.06 * D);
        break;
      }
      case 'rim': {
        const g = gain(voice);
        osc(voice, 'triangle', 1700 * k).connect(g).connect(voice.out);
        end = hit(g.gain, t, v * 0.6, 0.012 * D);
        const gn = gain(voice);
        noise(voice, noiseOffset).connect(filter(voice, 'bandpass', 3000 + T * 3000, 2)).connect(gn).connect(voice.out);
        end = Math.max(end, hit(gn.gain, t, v * 0.5 * S, 0.008 * D));
        break;
      }
      case 'tomg':
      case 'tomm': {
        const base = (id === 'tomg' ? 95 : 145) * k * (0.8 + 0.4 * T);
        const o = osc(voice, 'sine', 0);
        o.frequency.setValueAtTime(base * 1.6, t);
        o.frequency.exponentialRampToValueAtTime(base, t + 0.08);
        const g = gain(voice);
        o.connect(g).connect(voice.out);
        end = hit(g.gain, t, v, 0.16 * D);
        const gn = gain(voice);
        noise(voice, noiseOffset).connect(filter(voice, 'lowpass', 3000)).connect(gn).connect(voice.out);
        end = Math.max(end, hit(gn.gain, t, v * 0.3 * S, 0.01));
        break;
      }
      case 'chf':
      case 'cho':
      case 'crash': {
        const hp = filter(voice, 'highpass', (id === 'crash' ? 4000 : 6500) * (0.7 + 0.6 * T));
        const bp = filter(voice, 'bandpass', 10000, 0.8);
        const g = gain(voice);
        metal(voice, 40 * k, bp);
        noise(voice, noiseOffset).connect(bp);
        bp.connect(hp).connect(g).connect(voice.out);
        const decay = id === 'chf' ? 0.025 : id === 'cho' ? 0.18 : 0.6;
        end = hit(g.gain, t, v * (id === 'crash' ? 0.7 : 0.8) * (0.7 + 0.3 * S), decay * D);
        // Le charley fermé étouffe le charley ouvert.
        if (id === 'chf' && openHat) openHat.kill(t, STEAL_FADE_SEC);
        if (id === 'cho') openHat = voice;
        break;
      }
      case 'percu': {
        // Conga (tonalité basse) ou bongo (tonalité haute) : sinus à petite chute de hauteur, peau claquée.
        const base = (200 + T * 380) * k;
        const o = osc(voice, 'sine', 0);
        o.frequency.setValueAtTime(base * 1.25, t);
        o.frequency.exponentialRampToValueAtTime(base, t + 0.025);
        const g = gain(voice);
        o.connect(g).connect(voice.out);
        end = hit(g.gain, t, v * 0.9, (0.09 - 0.04 * T) * D);
        const slap = gain(voice);
        noise(voice, noiseOffset).connect(filter(voice, 'bandpass', base * 6, 1.5)).connect(slap).connect(voice.out);
        end = Math.max(end, hit(slap.gain, t, v * 0.7 * S, 0.006));
        break;
      }
      case 'ride': {
        // Cymbale ride : métal plus grave et plus long que le charley, avec un « ping » de cloche.
        const bp = filter(voice, 'bandpass', 6000 * (0.7 + 0.6 * T), 0.9);
        const hp = filter(voice, 'highpass', 2500);
        const g = gain(voice);
        metal(voice, 52 * k, bp);
        noise(voice, noiseOffset).connect(bp);
        bp.connect(hp).connect(g).connect(voice.out);
        end = hit(g.gain, t, v * 0.45, 0.45 * D);
        const ping = gain(voice);
        const pf = filter(voice, 'bandpass', 3400 * k, 6);
        osc(voice, 'square', 540 * k).connect(pf);
        osc(voice, 'square', 812 * k).connect(pf);
        pf.connect(ping).connect(voice.out);
        end = Math.max(end, hit(ping.gain, t, v * (0.2 + 0.4 * S), 0.18 * D));
        break;
      }
      case 'cloche': {
        const bp = filter(voice, 'bandpass', 2400 * k * (0.7 + 0.6 * T), 1.5);
        const g = gain(voice);
        osc(voice, 'square', 540 * k).connect(bp);
        osc(voice, 'square', 800 * k).connect(bp);
        bp.connect(g).connect(voice.out);
        end = hit(g.gain, t, v * 0.7, 0.09 * D);
        break;
      }
    }
    voice.endAt(end);
    return voice;
  }

  return {
    output,
    setParams(next) {
      p = next;
      output.gain.setTargetAtTime(n('volume'), ctx.currentTime, 0.003);
      const c = n('caractere');
      if (c !== character) {
        character = c;
        shaper.curve = c > 0 ? characterCurve(c) : null;
        warmth.gain.value = -6 * c;
        bus.gain.value = 1 + c;           // pousse dans la saturation
      }
    },
    polyphony: () => MAX_VOICES,
    noteOn,
    dispose() {
      bus.disconnect();
      shaper.disconnect();
      warmth.disconnect();
      output.disconnect();
    },
  };
}

/** Saturation « analogique » : douce et un peu asymétrique (exportée pour les tests). */
export function characterCurve(amount: number, size = 2049): Float32Array<ArrayBuffer> {
  const g = 1 + amount * 4;
  const c = new Float32Array(size);
  const top = Math.tanh(g * 1.08);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    // Asymétrie légère (harmoniques paires), recentrée pour que le silence reste à 0.
    c[i] = (Math.tanh(g * (x + 0.08 * amount * x * x)) / top) * (1 / (1 + amount));
  }
  return c;
}

export const frappe: InstrumentModule = { def, create };
