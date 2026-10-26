// Acide : basse monophonique à un oscillateur, filtre passe-bas 4 pôles très résonant, accent et
// glissé. Le son « qui couine » de l'acid house et de la techno.
// Accent : vélocité ≥ 0,8. Glissé : la note précédente est encore tenue (notes qui se chevauchent).
import type { ParamValue } from '../../project/types';
import { midiToFreq } from '../context';
import { choice, num } from '../defs';
import type { PluginDef } from '../params';
import { MIN_EDGE_SEC } from '../voices';
import { NodeVoice, type Instrument, type InstrumentHost, type InstrumentModule, type NoteRequest } from './instrument';

export const ACCENT_VELOCITY = 0.8;

const def: PluginDef = {
  type: 'acide', kind: 'instrument', name: 'Acide',
  description: 'Basse mono qui couine : filtre résonant, accents et glissés. Pour l’acid house et la techno.',
  params: [
    choice('onde', 'Forme', [['sawtooth', 'Scie'], ['square', 'Carré']], 'sawtooth', 'Forme d’onde de l’oscillateur.', { group: 'Oscillateur' }),
    num('transpose', 'Transposition', -24, 24, 0, 'Décale la basse par demi-tons.', { group: 'Oscillateur', unit: 'demi-tons', step: 1 }),
    num('coupure', 'Coupure', 30, 8000, 350, 'Fréquence de coupure du filtre.', { group: 'Filtre', unit: 'Hz', curve: 'log' }),
    num('resonance', 'Résonance', 0, 1, 0.7, 'Le « couinement » du filtre ; tout en haut, il se met à siffler.', { group: 'Filtre', step: 0.01 }),
    num('envmod', 'Enveloppe', 0, 1, 0.6, 'Ouverture du filtre à chaque note.', { group: 'Filtre', step: 0.01 }),
    num('declin', 'Déclin', 30, 2500, 350, 'Vitesse à laquelle le filtre se referme.', { group: 'Filtre', unit: 'ms', curve: 'log' }),
    num('accent', 'Accent', 0, 1, 0.6, 'Force des notes accentuées (vélocité ≥ 80 %) : plus fortes, plus résonantes, plus sèches.', { group: 'Jeu', step: 0.01 }),
    num('glisse', 'Glissé', 10, 500, 60, 'Durée du glissé entre deux notes qui se chevauchent.', { group: 'Jeu', unit: 'ms', curve: 'log' }),
    num('relachement', 'Relâchement', 3, 500, 15, 'Extinction à la fin de la note.', { group: 'Jeu', unit: 'ms', curve: 'log' }),
    num('saturation', 'Saturation', 0, 1, 0.3, 'Grain et agressivité après le filtre.', { group: 'Sortie', step: 0.01 }),
    num('volume', 'Volume', 0, 1, 0.7, 'Volume de sortie de l’instrument.', { group: 'Sortie', step: 0.01 }),
  ],
};

/** Table de saturation douce, à niveau à peu près constant (exportée pour les tests). */
export function acidCurve(amount: number, size = 2049): Float32Array<ArrayBuffer> {
  const g = 1 + amount * 9;
  const c = new Float32Array(size);
  const norm = Math.tanh(g);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    c[i] = Math.tanh(g * x) / norm;
  }
  return c;
}

function create(host: InstrumentHost): Instrument {
  const { ctx } = host;
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '2x';
  // Accent après la saturation (sinon elle l'écrase) : l'instrument est mono, un seul gain suffit.
  const accentGain = ctx.createGain();
  const output = ctx.createGain();
  shaper.connect(accentGain).connect(output);
  let p: Record<string, ParamValue> = {};
  let drive = -1;
  const n = (k: string): number => Number(p[k] ?? 0);

  function noteOn(req: NoteRequest): NodeVoice {
    const t = req.time;
    const voice = new NodeVoice(ctx, req.pitch, t, shaper);
    const accented = req.velocity >= ACCENT_VELOCITY;
    const acc = accented ? n('accent') : 0;
    const tied = req.legato === true && req.glideFrom !== undefined;
    const freq = midiToFreq(req.pitch + req.transpose + n('transpose'));

    const osc = ctx.createOscillator();
    osc.type = String(p.onde ?? 'sawtooth') as OscillatorType;
    if (tied) {
      const from = midiToFreq((req.glideFrom ?? req.pitch) + req.transpose + n('transpose'));
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + n('glisse') / 1000);
    } else {
      osc.frequency.value = freq;
    }

    // Filtre 4 pôles : deux passe-bas 2 pôles en série ; la résonance est portée par le premier.
    const res = n('resonance');
    const f1 = ctx.createBiquadFilter();
    const f2 = ctx.createBiquadFilter();
    f1.type = f2.type = 'lowpass';
    f1.frequency.value = f2.frequency.value = n('coupure');
    // Pour un passe-bas, Q est en dB : jusqu'à +26 dB de résonance avec l'accent.
    f1.Q.value = res * 20 + acc * 6;
    f2.Q.value = 0;
    const vca = ctx.createGain();
    vca.gain.value = 0;
    osc.connect(f1).connect(f2).connect(vca).connect(voice.out);
    voice.addNodes(f1, f2, vca);

    // Enveloppe du filtre : montée instantanée, déclin réglable (plus court sur un accent).
    // Sur une note liée, le filtre n'est pas relancé : il reste là où l'enveloppe l'avait laissé.
    const decay = (n('declin') / 1000) * (1 - 0.5 * acc);
    const depth = (n('envmod') * 4 + acc * 1.5) * 1200;           // cents
    const filterEnv = { a: MIN_EDGE_SEC, d: decay, s: 0, r: 0.05 };
    for (const f of [f1, f2]) {
      if (tied) f.detune.value = depth * 0.1;
      else voice.envelope(f.detune, filterEnv, depth);
    }

    // Auto-oscillation douce : tout en haut de la résonance, un sinus suit la coupure.
    if (res > 0.85) {
      const sing = ctx.createOscillator();
      sing.frequency.value = n('coupure');
      const g = ctx.createGain();
      g.gain.value = (res - 0.85) * 0.6;
      sing.connect(g).connect(vca);
      voice.addNodes(g);
      if (tied) sing.detune.value = depth * 0.1;
      else voice.envelope(sing.detune, filterEnv, depth);
      voice.addSource(sing);
    }

    accentGain.gain.setTargetAtTime(1 + acc * 0.8, t, 0.002);
    voice.addSource(osc);
    const level = 0.35 * (1 + acc * 0.7);
    voice.envelope(vca.gain, { a: tied ? 0.004 : MIN_EDGE_SEC, d: 0.01, s: 1, r: Math.max(MIN_EDGE_SEC, n('relachement') / 1000) }, level);
    return voice;
  }

  return {
    output,
    setParams(next) {
      p = next;
      output.gain.setTargetAtTime(n('volume'), ctx.currentTime, 0.003);
      const d = n('saturation');
      if (d !== drive) {
        drive = d;
        shaper.curve = acidCurve(d);
      }
    },
    polyphony: () => 1,
    noteOn,
    dispose() {
      shaper.disconnect();
      accentGain.disconnect();
      output.disconnect();
    },
  };
}

export const acide: InstrumentModule = { def, create };
