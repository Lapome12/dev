// Accord : une note jouée déclenche un accord entier. Pour les stabs house, les nappes et l'orgue.
// 3 timbres : orgue (additif, 4 tirettes), nappe large (7 scies désaccordées), piano house (FM doux).
import type { ParamValue } from '../../project/types';
import { midiToFreq } from '../context';
import { adsrParams, choice, num } from '../defs';
import type { PluginDef } from '../params';
import { adsrFrom, MAX_VOICES } from '../voices';
import { NodeVoice, type Instrument, type InstrumentHost, type InstrumentModule, type NoteRequest } from './instrument';

/** Intervalles (demi-tons) de chaque accord. */
export const CHORDS: Record<string, { label: string; intervals: number[] }> = {
  majeur: { label: 'Majeur', intervals: [0, 4, 7] },
  mineur: { label: 'Mineur', intervals: [0, 3, 7] },
  sept: { label: '7e', intervals: [0, 4, 7, 10] },
  m7: { label: 'Mineur 7', intervals: [0, 3, 7, 10] },
  m9: { label: 'Mineur 9', intervals: [0, 3, 7, 10, 14] },
  sus2: { label: 'Sus2', intervals: [0, 2, 7] },
  sus4: { label: 'Sus4', intervals: [0, 5, 7] },
  quinte: { label: 'Quinte', intervals: [0, 7] },
  octave: { label: 'Octave', intervals: [0, 12] },
};

/** Intervalles (demi-tons) d'une valeur du réglage `accord` ; m7 si la valeur est inconnue. */
export function intervallesAccord(valeur: string): number[] {
  return (CHORDS[valeur] ?? CHORDS.m7!).intervals.slice();
}

/** Hauteurs jouées pour une note : accord, renversement et octave (exportée pour les tests). */
export function chordPitches(root: number, chord: string, inversion: number): number[] {
  const iv = (CHORDS[chord] ?? CHORDS.m7!).intervals.slice();
  for (let i = 0; i < inversion && i < iv.length - 1; i++) iv.push((iv.shift() ?? 0) + 12);
  return iv.map((x) => root + x);
}

const def: PluginDef = {
  type: 'accord', kind: 'instrument', name: 'Accord',
  description: 'Une touche, un accord : stabs house, orgue garage, nappes larges.',
  view: 'adsr',
  params: [
    choice('timbre', 'Timbre', [['orgue', 'Orgue'], ['nappe', 'Nappe large'], ['piano', 'Piano house']], 'piano', 'Couleur du son.', { group: 'Accord' }),
    choice('accord', 'Accord', Object.entries(CHORDS).map(([v, c]) => [v, c.label] as [string, string]), 'm7', 'Accord joué par chaque note.', { group: 'Accord' }),
    num('renversement', 'Renversement', 0, 3, 0, 'Fait passer les notes graves de l’accord à l’octave du dessus.', { group: 'Accord', step: 1 }),
    num('octave', 'Octave', -2, 2, 0, 'Décale tout l’accord par octaves.', { group: 'Accord', step: 1 }),
    num('tirette1', 'Tirette 16′', 0, 1, 0.6, 'Orgue : son grave, une octave sous la note.', { group: 'Orgue', step: 0.01 }),
    num('tirette2', 'Tirette 8′', 0, 1, 1, 'Orgue : la note elle-même.', { group: 'Orgue', step: 0.01 }),
    num('tirette3', 'Tirette 4′', 0, 1, 0.5, 'Orgue : une octave au-dessus.', { group: 'Orgue', step: 0.01 }),
    num('tirette4', 'Tirette 2⅔′', 0, 1, 0.3, 'Orgue : la quinte au-dessus de l’octave.', { group: 'Orgue', step: 0.01 }),
    num('desaccord', 'Désaccord', 0, 60, 18, 'Nappe : écart entre les 7 scies.', { group: 'Nappe', unit: 'cents' }),
    num('brillance', 'Brillance', 0, 1, 0.4, 'Piano : éclat de l’attaque.', { group: 'Piano', step: 0.01 }),
    num('coupure', 'Coupure', 100, 20000, 5000, 'Fréquence de coupure du filtre.', { group: 'Filtre', unit: 'Hz', curve: 'log' }),
    num('resonance', 'Résonance', 0, 18, 2, 'Accentue les fréquences autour de la coupure.', { group: 'Filtre', unit: 'dB', step: 0.1 }),
    num('envfiltre', 'Enveloppe', -4, 4, 1, 'Ouverture du filtre par son enveloppe, en octaves.', { group: 'Filtre', step: 0.1 }),
    ...adsrParams('f', 'Enveloppe du filtre', { a: 3, d: 250, s: 0.2, r: 200 }),
    ...adsrParams('amp', 'Enveloppe du volume', { a: 3, d: 500, s: 0.5, r: 250 }),
    num('largeur', 'Largeur', 0, 1, 0.5, 'Répartit les notes de l’accord entre gauche et droite.', { group: 'Sortie', step: 0.01 }),
    num('volume', 'Volume', 0, 1, 0.7, 'Volume de sortie de l’instrument.', { group: 'Sortie', step: 0.01 }),
  ],
};

/** Rangs d'harmoniques des 4 tirettes, par rapport à une fondamentale une octave sous la note. */
const DRAWBARS = [1, 2, 4, 6];

function create(host: InstrumentHost): Instrument {
  const { ctx } = host;
  const output = ctx.createGain();
  let p: Record<string, ParamValue> = {};
  let organ: { key: string; wave: PeriodicWave } | null = null;
  const n = (k: string): number => Number(p[k] ?? 0);

  function organWave(): PeriodicWave {
    const levels = [1, 2, 3, 4].map((i) => n(`tirette${i}`));
    const key = levels.join('|');
    if (!organ || organ.key !== key) {
      const real = new Float32Array(7);
      const imag = new Float32Array(7);
      DRAWBARS.forEach((h, i) => (imag[h] = levels[i] ?? 0));
      organ = { key, wave: ctx.createPeriodicWave(real, imag) };
    }
    return organ.wave;
  }

  function noteOn(req: NoteRequest): NodeVoice {
    const t = req.time;
    const voice = new NodeVoice(ctx, req.pitch, t, output);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = n('coupure');
    filter.Q.value = n('resonance');
    const vca = ctx.createGain();
    vca.gain.value = 0;
    filter.connect(vca).connect(voice.out);
    voice.addNodes(filter, vca);

    const timbre = String(p.timbre ?? 'piano');
    const pitches = chordPitches(req.pitch + n('octave') * 12, String(p.accord ?? 'm7'), Math.round(n('renversement')));
    const width = n('largeur');
    const per = 1 / Math.sqrt(pitches.length);

    pitches.forEach((pitch, i) => {
      const f = midiToFreq(pitch + req.transpose);
      const pos = pitches.length === 1 ? 0 : (i / (pitches.length - 1)) * 2 - 1;
      const pan = ctx.createStereoPanner();
      pan.pan.value = pos * width;
      const mix = ctx.createGain();
      mix.gain.value = per;
      mix.connect(pan).connect(filter);
      voice.addNodes(pan, mix);

      if (timbre === 'orgue') {
        const o = ctx.createOscillator();
        o.setPeriodicWave(organWave());
        o.frequency.value = f / 2;
        o.connect(mix);
        voice.addSource(o);
      } else if (timbre === 'nappe') {
        const spread = n('desaccord');
        const sub = ctx.createGain();
        sub.gain.value = 0.38;
        sub.connect(mix);
        voice.addNodes(sub);
        for (let u = 0; u < 7; u++) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = ((u - 3) / 3) * spread;
          const up = ctx.createStereoPanner();
          up.pan.value = ((u - 3) / 3) * width;
          o.connect(up).connect(sub);
          voice.addNodes(up);
          voice.addSource(o);
        }
      } else {
        // Piano house : porteuse sinus, modulateur au même rapport qui s'éteint vite (attaque brillante).
        const car = ctx.createOscillator();
        const mod = ctx.createOscillator();
        car.frequency.value = f;
        mod.frequency.value = f;
        const idx = ctx.createGain();
        idx.gain.value = 0;
        mod.connect(idx).connect(car.frequency);
        car.connect(mix);
        voice.addNodes(idx);
        voice.envelope(idx.gain, { a: 0.003, d: 0.35, s: 0.08, r: 0.2 }, f * (0.8 + 2.2 * n('brillance')) * (0.4 + 0.6 * req.velocity));
        voice.addSource(mod);
        voice.addSource(car);
      }
    });

    voice.envelope(vca.gain, adsrFrom(p, 'amp'), 0.3 * (0.25 + 0.75 * req.velocity));
    const fAmount = n('envfiltre') * 1200;
    if (fAmount !== 0) voice.envelope(filter.detune, adsrFrom(p, 'f'), fAmount);
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

export const accord: InstrumentModule = { def, create };
