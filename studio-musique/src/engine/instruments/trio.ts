// Trio : synthé soustractif. Version minimale de l'étape 1.2 (un oscillateur, une enveloppe) ;
// la version complète (3 oscillateurs, filtre, LFO, unisson, portamento) arrive à l'étape 2.1.
import type { ParamValue } from '../../project/types';
import { midiToFreq } from '../context';
import { adsrParams, choice, num } from '../defs';
import type { PluginDef } from '../params';
import { adsrFrom } from '../voices';
import { NodeVoice, type Instrument, type InstrumentHost, type InstrumentModule, type NoteRequest } from './instrument';

const WAVES: [string, string][] = [['sine', 'Sinus'], ['triangle', 'Triangle'], ['sawtooth', 'Scie'], ['square', 'Carré']];

const def: PluginDef = {
  type: 'trio', kind: 'instrument', name: 'Trio',
  description: 'Synthé soustractif à tout faire : basses, leads, nappes.',
  view: 'adsr',
  params: [
    choice('o1onde', 'Forme', WAVES, 'sawtooth', 'Forme d’onde de l’oscillateur.', { group: 'Oscillateur 1' }),
    ...adsrParams('amp', 'Enveloppe', { a: 5, d: 300, s: 0.7, r: 200 }),
    num('volume', 'Volume', 0, 1, 0.7, 'Volume de sortie de l’instrument.', { step: 0.01 }),
  ],
};

function create(host: InstrumentHost): Instrument {
  const { ctx } = host;
  const output = ctx.createGain();
  let p: Record<string, ParamValue> = {};
  return {
    output,
    setParams(next) {
      p = next;
      output.gain.setTargetAtTime(Number(p.volume ?? 0.7), ctx.currentTime, 0.003);
    },
    polyphony: () => 16,
    noteOn(n: NoteRequest) {
      const voice = new NodeVoice(ctx, n.pitch, n.time, output);
      const osc = ctx.createOscillator();
      osc.type = String(p.o1onde ?? 'sawtooth') as OscillatorType;
      osc.frequency.value = midiToFreq(n.pitch + n.transpose);
      const vca = ctx.createGain();
      vca.gain.value = 0;
      osc.connect(vca).connect(voice.out);
      voice.addNodes(vca);
      voice.addSource(osc);
      voice.envelope(vca.gain, adsrFrom(p, 'amp'), 0.4 * n.velocity);
      return voice;
    },
    dispose() {
      output.disconnect();
    },
  };
}

export const trio: InstrumentModule = { def, create };
