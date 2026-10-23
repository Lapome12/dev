// Égaliseur 7 bandes : grave en plateau, 5 bandes en cloche, aigu en plateau.
import type { ParamValue } from '../../project/types';
import { dbToGain } from '../context';
import { num } from '../defs';
import type { ParamDef, PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';
import { responseDb } from './response';

export const EQ_BANDS: { type: BiquadFilterType; freq: number; label: string }[] = [
  { type: 'lowshelf', freq: 80, label: 'Grave' },
  { type: 'peaking', freq: 200, label: 'Bas' },
  { type: 'peaking', freq: 500, label: 'Bas-médium' },
  { type: 'peaking', freq: 1200, label: 'Médium' },
  { type: 'peaking', freq: 3000, label: 'Haut-médium' },
  { type: 'peaking', freq: 7000, label: 'Présence' },
  { type: 'highshelf', freq: 12000, label: 'Aigu' },
];

function bandParams(i: number): ParamDef[] {
  const b = EQ_BANDS[i - 1]!;
  const group = `Bande ${i} : ${b.label}`;
  const params = [
    num(`b${i}freq`, 'Fréquence', 20, 20000, b.freq, 'Fréquence centrale de la bande.', { group, unit: 'Hz', curve: 'log' }),
    num(`b${i}gain`, 'Gain', -18, 18, 0, 'Renforce ou atténue cette bande.', { group, unit: 'dB', step: 0.1 }),
  ];
  if (b.type === 'peaking') params.push(num(`b${i}q`, 'Largeur (Q)', 0.1, 18, 1, 'Plus le Q est grand, plus la bande est étroite.', { group, step: 0.1, curve: 'log' }));
  return params;
}

const def: PluginDef = {
  type: 'eq', kind: 'effet', name: 'Égaliseur',
  description: 'Égaliseur 7 bandes avec courbe : sculpte le timbre.',
  view: 'eq-courbe',
  params: [
    ...[1, 2, 3, 4, 5, 6, 7].flatMap(bandParams),
    num('sortie', 'Sortie', -24, 12, 0, 'Volume après l’égaliseur.', { unit: 'dB', step: 0.1 }),
  ],
};

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const input = ctx.createGain();
  const output = ctx.createGain();
  const filters = EQ_BANDS.map((b) => {
    const f = ctx.createBiquadFilter();
    f.type = b.type;
    f.frequency.value = b.freq;
    f.gain.value = 0;
    return f;
  });
  let prev: AudioNode = input;
  for (const f of filters) {
    prev.connect(f);
    prev = f;
  }
  prev.connect(output);
  let outDb = 0;

  return {
    input,
    output,
    setParams(p: Record<string, ParamValue>) {
      const t = ctx.currentTime;
      filters.forEach((f, k) => {
        const i = k + 1;
        f.frequency.setTargetAtTime(Number(p[`b${i}freq`]), t, 0.005);
        f.gain.setTargetAtTime(Number(p[`b${i}gain`]), t, 0.005);
        if (p[`b${i}q`] !== undefined) f.Q.setTargetAtTime(Number(p[`b${i}q`]), t, 0.005);
      });
      outDb = Number(p.sortie);
      output.gain.setTargetAtTime(dbToGain(outDb), t, 0.005);
    },
    frequencyResponse(freqs, magDb) {
      responseDb(filters, freqs, magDb, outDb);
    },
    dispose() {
      input.disconnect();
      for (const f of filters) f.disconnect();
      output.disconnect();
    },
  };
}

export const eq: EffectModule = { def, create };
