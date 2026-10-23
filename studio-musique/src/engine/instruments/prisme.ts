// Prisme : synthé FM à 4 opérateurs et 8 algorithmes, une enveloppe par opérateur,
// réinjection sur l'opérateur 4. La réinjection est obtenue par la forme d'onde de l'opérateur
// (onde calculée d'un sinus qui se module lui-même), car une boucle Web Audio imposerait 128 échantillons de retard.
import type { ParamValue } from '../../project/types';
import { midiToFreq } from '../context';
import { adsrParams, choice, num } from '../defs';
import type { ParamDef, PluginDef } from '../params';
import { adsrFrom, MAX_VOICES } from '../voices';
import { NodeVoice, type Instrument, type InstrumentHost, type InstrumentModule, type NoteRequest } from './instrument';

/** Algorithmes : modulations [de, vers] et porteuses (opérateurs entendus). */
export const ALGORITHMS: { label: string; links: [number, number][]; carriers: number[] }[] = [
  { label: '1 : 4→3→2→1', links: [[4, 3], [3, 2], [2, 1]], carriers: [1] },
  { label: '2 : (4+3)→2→1', links: [[4, 2], [3, 2], [2, 1]], carriers: [1] },
  { label: '3 : 4→3→1 et 2→1', links: [[4, 3], [3, 1], [2, 1]], carriers: [1] },
  { label: '4 : 4, 3 et 2→1', links: [[4, 1], [3, 1], [2, 1]], carriers: [1] },
  { label: '5 : 4→3 et 2→1', links: [[4, 3], [2, 1]], carriers: [1, 3] },
  { label: '6 : 4→3, 2 et 1', links: [[4, 3], [4, 2], [4, 1]], carriers: [1, 2, 3] },
  { label: '7 : 4→3, 2, 1', links: [[4, 3]], carriers: [1, 2, 3] },
  { label: '8 : additif', links: [], carriers: [1, 2, 3, 4] },
];

/** Excursion maximale de fréquence d'un modulateur, en multiples de sa fréquence. */
const MOD_INDEX = 6;

const OP_DEFAULTS = [
  { ratio: 1, niveau: 0.9, env: { a: 3, d: 1500, s: 0.3, r: 400 } },
  { ratio: 14, niveau: 0.25, env: { a: 3, d: 200, s: 0, r: 200 } },
  { ratio: 1, niveau: 0.6, env: { a: 3, d: 2000, s: 0.2, r: 400 } },
  { ratio: 1, niveau: 0.45, env: { a: 3, d: 900, s: 0.1, r: 300 } },
];

function opParams(i: number): ParamDef[] {
  const group = `Opérateur ${i}`;
  const d = OP_DEFAULTS[i - 1] ?? OP_DEFAULTS[0]!;
  return [
    num(`o${i}ratio`, 'Rapport', 0.5, 16, d.ratio, 'Fréquence de l’opérateur, en multiple de la note jouée.', { group, step: 0.5 }),
    num(`o${i}fin`, 'Fin', -50, 50, 0, 'Léger désaccord de l’opérateur.', { group, unit: 'cents', step: 1 }),
    num(`o${i}niveau`, 'Niveau', 0, 1, d.niveau, 'Volume (porteuse) ou intensité de modulation (modulateur).', { group, step: 0.01 }),
    ...adsrParams(`o${i}`, group, d.env),
  ];
}

const def: PluginDef = {
  type: 'prisme', kind: 'instrument', name: 'Prisme',
  description: 'Synthé FM à 4 opérateurs : cloches, pianos électriques, basses métalliques.',
  view: 'adsr',
  params: [
    choice('algo', 'Algorithme', ALGORITHMS.map((a, i) => [String(i + 1), a.label] as [string, string]), '5', 'Comment les opérateurs se modulent entre eux.', { group: 'Général' }),
    num('retour', 'Réinjection', 0, 1, 0.2, 'L’opérateur 4 se module lui-même : son plus riche, jusqu’au bruit.', { group: 'Général', step: 0.01 }),
    num('velocite', 'Sensibilité', 0, 1, 0.6, 'Effet de la force de frappe sur la brillance du son.', { group: 'Général', step: 0.01 }),
    ...[1, 2, 3, 4].flatMap(opParams),
    num('volume', 'Volume', 0, 1, 0.7, 'Volume de sortie de l’instrument.', { step: 0.01 }),
  ],
};

/** Onde d'un sinus avec réinjection (y = sin(φ + β·y)), sous forme d'harmoniques. Exportée pour les tests. */
export function feedbackHarmonics(beta: number, harmonics = 32): { real: Float32Array<ArrayBuffer>; imag: Float32Array<ArrayBuffer> } {
  const N = 1024;
  const y = new Float32Array(N);
  let prev = 0;
  for (let cycle = 0; cycle < 4; cycle++) {
    for (let k = 0; k < N; k++) {
      const v = Math.sin((2 * Math.PI * k) / N + beta * prev);
      y[k] = v;
      prev = v;
    }
  }
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let h = 1; h <= harmonics; h++) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < N; k++) {
      const a = (2 * Math.PI * h * k) / N;
      re += (y[k] ?? 0) * Math.cos(a);
      im += (y[k] ?? 0) * Math.sin(a);
    }
    real[h] = (2 * re) / N;
    imag[h] = (2 * im) / N;
  }
  return { real, imag };
}

function create(host: InstrumentHost): Instrument {
  const { ctx } = host;
  const output = ctx.createGain();
  let p: Record<string, ParamValue> = {};
  const waves = new Map<number, PeriodicWave>();
  const n = (k: string): number => Number(p[k] ?? 0);

  function feedbackWave(amount: number): PeriodicWave | null {
    const q = Math.round(amount * 20);
    if (q === 0) return null;
    let w = waves.get(q);
    if (!w) {
      const { real, imag } = feedbackHarmonics((q / 20) * 1.5);
      w = ctx.createPeriodicWave(real, imag, { disableNormalization: true });
      waves.set(q, w);
    }
    return w;
  }

  function noteOn(req: NoteRequest): NodeVoice {
    const t = req.time;
    const voice = new NodeVoice(ctx, req.pitch, t, output);
    const algo = ALGORITHMS[Math.max(0, Math.min(7, Number(p.algo ?? 5) - 1))] ?? ALGORITHMS[0]!;
    const f = midiToFreq(req.pitch + req.transpose);
    const vs = n('velocite');
    const brightness = 1 - vs + vs * req.velocity;
    const loudness = 0.2 + 0.8 * req.velocity;
    const oscs: OscillatorNode[] = [];
    const amps: GainNode[] = [];

    for (let i = 1; i <= 4; i++) {
      const o = ctx.createOscillator();
      const ratio = n(`o${i}ratio`);
      o.frequency.value = f * ratio;
      o.detune.value = n(`o${i}fin`);
      if (i === 4) {
        const w = feedbackWave(n('retour'));
        if (w) o.setPeriodicWave(w);
      }
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g);
      voice.addNodes(g);
      oscs.push(o);
      amps.push(g);
      const level = n(`o${i}niveau`);
      const env = adsrFrom(p, `o${i}`);
      if (algo.carriers.includes(i)) {
        g.connect(voice.out);
        voice.envelope(g.gain, env, (level * loudness * 0.35) / Math.sqrt(algo.carriers.length));
      } else {
        voice.envelope(g.gain, env, level * level * MOD_INDEX * f * ratio * brightness);
      }
    }
    for (const [from, to] of algo.links) {
      const src = amps[from - 1];
      const dst = oscs[to - 1];
      if (src && dst) src.connect(dst.frequency);
    }
    for (const o of oscs) voice.addSource(o);
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

export const prisme: InstrumentModule = { def, create };
