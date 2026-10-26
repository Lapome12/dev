// Saturation à trois caractères : bande (douce, aigus arrondis), lampe (asymétrique, harmoniques paires)
// et repli (le signal se replie sur lui-même : son métallique). Volume corrigé automatiquement.
import type { ParamValue } from '../../project/types';
import { dbToGain } from '../context';
import { choice, num, toggle } from '../defs';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';

const def: PluginDef = {
  type: 'saturation', kind: 'effet', name: 'Saturation',
  description: 'Réchauffe ou salit le son : bande, lampe ou repli.',
  params: [
    choice('mode', 'Caractère', [['bande', 'Bande'], ['lampe', 'Lampe'], ['repli', 'Repli']], 'bande', 'Bande : chaud et rond. Lampe : riche, asymétrique. Repli : métallique, agressif.'),
    num('drive', 'Drive', 0, 36, 9, 'Quantité de saturation.', { unit: 'dB', step: 0.1 }),
    num('tonalite', 'Tonalité', 1000, 20000, 12000, 'Adoucit les aigus après la saturation.', { unit: 'Hz', curve: 'log' }),
    num('mix', 'Mélange', 0, 1, 1, 'Part du son saturé par rapport au son d’origine.', { step: 0.01 }),
    toggle('compensation', 'Volume constant', true, 'Baisse le volume quand le drive monte, pour comparer à volume égal.'),
    num('sortie', 'Sortie', -24, 12, 0, 'Volume après la saturation.', { unit: 'dB', step: 0.1 }),
  ],
};

/** Table de transfert, sans décalage au repos (exportée pour les tests). */
export function courbeSaturation(mode: string, driveDb: number, size = 4097): Float32Array<ArrayBuffer> {
  const g = dbToGain(driveDb);
  const c = new Float32Array(size);
  // Lampe : point de repos décalé, la saturation n'est pas la même des deux côtés (harmoniques paires).
  const lampe = (u: number) => Math.tanh(u + 0.25) - Math.tanh(0.25);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const u = g * x;
    let y: number;
    switch (mode) {
      case 'lampe': y = lampe(u) / (1 + Math.tanh(0.25)); break;
      case 'repli': y = Math.sin((Math.PI / 2) * u); break;
      default: y = u / Math.pow(1 + Math.pow(Math.abs(u), 2.5), 1 / 2.5);   // bande : genou très doux
    }
    c[i] = Math.max(-1, Math.min(1, y));
  }
  return c;
}

/** Gain qui ramène une sinusoïde d'amplitude 0,5 au même niveau efficace après la courbe. */
export function compensationSaturation(courbe: Float32Array, amplitude = 0.5, points = 512): number {
  let entree = 0;
  let sortie = 0;
  const n = courbe.length - 1;
  for (let i = 0; i < points; i++) {
    const x = amplitude * Math.sin((2 * Math.PI * i) / points);
    const y = courbe[Math.round(((x + 1) / 2) * n)] ?? 0;
    entree += x * x;
    sortie += y * y;
  }
  return sortie > 1e-9 ? Math.min(4, Math.sqrt(entree / sortie)) : 1;
}

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const input = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '4x';
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.6;
  const dc = ctx.createBiquadFilter();
  dc.type = 'highpass';
  dc.frequency.value = 15;
  const humide = ctx.createGain();
  const sec = ctx.createGain();
  const output = ctx.createGain();
  input.connect(shaper).connect(lp).connect(dc).connect(humide).connect(output);
  input.connect(sec).connect(output);
  let cle = '';
  let correction = 1;

  return {
    input,
    output,
    setParams(p: Record<string, ParamValue>) {
      const t = ctx.currentTime;
      const k = `${String(p.mode)}|${Number(p.drive)}`;
      if (k !== cle) {
        cle = k;
        const c = courbeSaturation(String(p.mode), Number(p.drive));
        shaper.curve = c;
        correction = compensationSaturation(c);
      }
      // La bande arrondit aussi les aigus : son filtre est un peu plus bas.
      const ton = Number(p.tonalite) * (p.mode === 'bande' ? 0.7 : 1);
      lp.frequency.setTargetAtTime(ton, t, 0.005);
      const m = Number(p.mix);
      const gain = (p.compensation ? correction : 1) * dbToGain(Number(p.sortie));
      humide.gain.setTargetAtTime(m * gain, t, 0.01);
      sec.gain.setTargetAtTime((1 - m) * dbToGain(Number(p.sortie)), t, 0.01);
    },
    dispose() {
      for (const n of [input, shaper, lp, dc, humide, sec, output]) n.disconnect();
    },
  };
}

export const saturation: EffectModule = { def, create };
