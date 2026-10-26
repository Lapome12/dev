// Porte : coupe le son selon un motif de 16 pas, calé sur le tempo (le « gate » des montées trance et techno).
// Le motif est une chaîne de 16 caractères, 'x' = ouvert, '.' = fermé (format convenu avec Dev 3).
import type { ParamValue } from '../../project/types';
import { choice, num } from '../defs';
import type { PluginDef } from '../params';
import type { Effect, EffectHost, EffectModule } from './effect';
import { SyncedLfo } from './lfo';

export const PAS_PORTE = 16;
export const MOTIF_DEFAUT = 'x.x.x.x.x.x.x.x.';
const DIVISIONS: [string, string, number][] = [['1/16', '1/16', 0.25], ['1/8', '1/8', 0.5], ['1/4', '1/4', 1]];

const def: PluginDef = {
  type: 'porte', kind: 'effet', name: 'Porte',
  description: 'Hache le son selon un motif de 16 pas, calé sur le tempo.',
  params: [
    { id: 'motif', label: 'Motif', kind: 'choice', default: MOTIF_DEFAUT, help: 'Les 16 pas : cliquer un pas pour l’ouvrir ou le fermer.' },
    choice('division', 'Durée d’un pas', DIVISIONS.map(([v, l]) => [v, l] as [string, string]), '1/16', 'Longueur de chaque pas du motif.'),
    num('lissage', 'Lissage', 0, 20, 3, 'Adoucit l’ouverture et la fermeture (évite les clics).', { unit: 'ms', step: 0.1 }),
    num('profondeur', 'Profondeur', 0, 1, 1, 'Jusqu’où le son descend sur les pas fermés.', { step: 0.01 }),
    num('mix', 'Mélange', 0, 1, 1, 'Part du son haché par rapport au son d’origine.', { step: 0.01 }),
  ],
};

/** Lit un motif de façon tolérante : 16 pas, tout ce qui n'est pas 'x' est fermé. */
export function lireMotif(v: unknown): boolean[] {
  const s = typeof v === 'string' ? v : '';
  return Array.from({ length: PAS_PORTE }, (_, i) => s[i] === 'x' || s[i] === 'X');
}

export function ecrireMotif(pas: boolean[]): string {
  return Array.from({ length: PAS_PORTE }, (_, i) => (pas[i] ? 'x' : '.')).join('');
}

/** Ouverture de la porte sur un cycle (0 = fermé, 1 = ouvert), rampes de `lissage` (fraction d'un pas). Exportée pour les tests. */
export function formePorte(pas: boolean[], lissage: number, N = 2048): Float32Array<ArrayBuffer> {
  const out = new Float32Array(N);
  const r = Math.max(1 / 256, Math.min(0.5, lissage));
  for (let i = 0; i < N; i++) {
    const pos = (i / N) * PAS_PORTE;
    const k = Math.floor(pos);
    const ph = pos - k;
    const ici = pas[k] ? 1 : 0;
    const avant = pas[(k + PAS_PORTE - 1) % PAS_PORTE] ? 1 : 0;
    // Rampe en début de pas, depuis l'état du pas précédent.
    out[i] = ph < r ? avant + (ici - avant) * (0.5 - 0.5 * Math.cos((Math.PI * ph) / r)) : ici;
  }
  return out;
}

function onde(ctx: BaseAudioContext, forme: Float32Array): { wave: PeriodicWave; mean: number } {
  const N = forme.length;
  const H = 256;
  let mean = 0;
  for (const v of forme) mean += v;
  mean /= N;
  const real = new Float32Array(H + 1);
  const imag = new Float32Array(H + 1);
  for (let h = 1; h <= H; h++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * h * i) / N;
      re += (forme[i] ?? 0) * Math.cos(a);
      im += (forme[i] ?? 0) * Math.sin(a);
    }
    real[h] = (2 * re) / N;
    imag[h] = (2 * im) / N;
  }
  return { wave: ctx.createPeriodicWave(real, imag, { disableNormalization: true }), mean };
}

function create(host: EffectHost): Effect {
  const { ctx } = host;
  const input = ctx.createGain();
  const vca = ctx.createGain();
  const sec = ctx.createGain();
  const humide = ctx.createGain();
  const output = ctx.createGain();
  const amplitude = ctx.createGain();
  amplitude.gain.value = 0;
  input.connect(vca).connect(humide).connect(output);
  input.connect(sec).connect(output);
  const lfo = new SyncedLfo(ctx);
  let bpm = host.bpm();
  lfo.setTempo(bpm);
  lfo.output.connect(amplitude).connect(vca.gain);
  let cle = '';
  let moyenne = 0.5;
  let derniers: Record<string, ParamValue> | null = null;

  const appliquer = (p: Record<string, ParamValue>) => {
    const t = ctx.currentTime;
    const beats = DIVISIONS.find(([v]) => v === p.division)?.[2] ?? 0.25;
    const pasSec = (60 / bpm) * beats;
    const lissage = Number(p.lissage) / 1000 / pasSec;
    const motif = lireMotif(p.motif);
    const k = `${ecrireMotif(motif)}|${lissage.toFixed(4)}`;
    const d = Number(p.profondeur);
    // gain = 1 - d + d * forme = (1 - d + d * moyenne) + d * (forme - moyenne) ; l'oscillateur porte la 2e partie.
    if (k !== cle) {
      cle = k;
      const o = onde(ctx, formePorte(motif, lissage));
      lfo.setShape(o.wave);
      moyenne = o.mean;
    }
    lfo.setBeats(beats * PAS_PORTE);
    amplitude.gain.setTargetAtTime(d, t, 0.005);
    vca.gain.setTargetAtTime(1 - d + d * moyenne, t, 0.005);
    const m = Number(p.mix);
    humide.gain.setTargetAtTime(m, t, 0.01);
    sec.gain.setTargetAtTime(1 - m, t, 0.01);
  };

  return {
    input,
    output,
    setParams(p) { derniers = p; appliquer(p); },
    // Le lissage est en ms : la forme dépend du tempo.
    setTempo(b) { bpm = b; lfo.setTempo(b); if (derniers) appliquer(derniers); },
    onTransport(info) {
      if (info.bpm !== bpm) { bpm = info.bpm; if (derniers) appliquer(derniers); }
      lfo.onTransport(info);
    },
    dispose() {
      lfo.dispose();
      for (const n of [input, vca, sec, humide, output, amplitude]) n.disconnect();
    },
  };
}

export const porte: EffectModule = { def, create };
