// Test Playwright du rendu WAV (étape 3.2) : le moteur réel dans Chromium, en OfflineAudioContext.
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { defaultParams } from '../../src/engine/params';
import type { InstrumentType, Note, ParamValue, Project } from '../../src/project/types';
import { channel, note, project } from './helpers';

let bundle = '';

test.beforeAll(async () => {
  const out = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: fileURLToPath(new URL('./render-page.ts', import.meta.url)), formats: ['iife'], name: 'frequenceRenderTest' },
    },
  });
  const result = Array.isArray(out) ? out[0] : out;
  const chunk = result && 'output' in result ? result.output[0] : null;
  if (!chunk || chunk.type !== 'chunk') throw new Error('Bundle de test introuvable');
  bundle = chunk.code;
});

async function render(page: import('@playwright/test').Page, o: object) {
  await page.setContent('<!doctype html><title>Rendu</title>');
  await page.addScriptTag({ content: bundle });
  return page.evaluate((opts) => window.frequenceRender(opts as never), o) as Promise<{
    sameLength: boolean; maxDiff: number; bits: number; sampleRate: number; seconds: number; peak: number; rms: number; riff: string; type: string; progress: number[];
  }>;
}

// Deux rendus du même projet : mêmes graines, même programmation. Chromium additionne les entrées
// d'un nœud dans un ordre qui varie d'une exécution à l'autre, d'où des écarts de l'ordre de 1e-6
// (-110 dBFS) qui peuvent faire basculer l'arrondi d'un échantillon d'un pas de quantification.
// On exige donc au plus 1 pas d'écart en 16 bits, ce qui est inaudible.
test('morceau : non silencieux, sans saturation, identique d’un rendu à l’autre', async ({ page }) => {
  test.setTimeout(120_000);
  const o = { mode: 'morceau', bitDepth: 16, sampleRate: 44100, normalize: false };
  const a = await render(page, o);
  expect(a.riff).toBe('RIFF');
  expect(a.type).toBe('audio/wav');
  expect(a.bits).toBe(16);
  // 5 mesures à 128 BPM (9,375 s) + 1,5 s de queue
  expect(a.seconds).toBeCloseTo(1920 * (60 / (128 * 96)) + 1.5, 2);
  expect(a.rms).toBeGreaterThan(0.01);
  expect(a.peak).toBeLessThanOrEqual(1);
  expect(a.peak).toBeGreaterThan(0.05);
  expect(a.progress.at(-1)).toBe(1);
  expect(a.sameLength).toBe(true);
  expect(a.maxDiff).toBeLessThanOrEqual(1);
});

test('pattern en 24 bits, 48 kHz, normalisé à -0,3 dBFS', async ({ page }) => {
  test.setTimeout(120_000);
  const a = await render(page, { mode: 'pattern', bitDepth: 24, sampleRate: 48000, normalize: true });
  expect(a.bits).toBe(24);
  expect(a.sampleRate).toBe(48000);
  expect(a.seconds).toBeCloseTo(768 * (60 / (128 * 96)) + 1.5, 2);
  expect(20 * Math.log10(a.peak)).toBeCloseTo(-0.3, 1);
  expect(a.peak).toBeLessThan(1);
  expect(a.sameLength).toBe(true);
  expect(a.maxDiff).toBeLessThanOrEqual(256);       // 1 pas en 16 bits = 256 pas en 24 bits
});

// ---------- Instruments de l'étape 6 ----------

const SR = 44100;
const SEC_PER_TICK = 60 / (120 * 96);         // projet de test à 120 BPM

/** Une tranche, un instrument, quelques notes : rendu brut du pattern (sans limiteur de sécurité). */
async function renderNotes(page: import('@playwright/test').Page, type: InstrumentType, params: Record<string, ParamValue>, notes: Note[], lengthTicks = 384) {
  const p: Project = project({ channels: [channel('a', { instrument: { type, params: { ...defaultParams(type), ...params } }, mixerTrack: 1, volume: 1 })] });
  p.patterns[0]!.lengthTicks = lengthTicks;
  p.patterns[0]!.notes = { a: notes };
  await page.setContent('<!doctype html><title>Rendu</title>');
  await page.addScriptTag({ content: bundle });
  const [L, R] = await page.evaluate((o) => window.frequenceBuffer(o as never, 0.5), p);
  return { L: L!, R: R! };
}

function stats(ch: number[][], from = 0, to = Infinity) {
  let peak = 0, sum = 0, nan = 0, count = 0;
  for (const c of ch) {
    for (let i = Math.floor(from * SR); i < Math.min(c.length, to * SR); i++) {
      const v = c[i]!;
      if (!Number.isFinite(v)) { nan++; continue; }
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
      count++;
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, count)), nan };
}

/** Passages par zéro (montants) entre deux instants : une mesure grossière de la hauteur. */
function crossings(c: number[], from: number, to: number): number {
  let n = 0;
  for (let i = Math.floor(from * SR) + 1; i < to * SR; i++) if (c[i - 1]! < 0 && c[i]! >= 0) n++;
  return n;
}

test('Acide : sans NaN, crête sous 0 dBFS, accent nettement plus fort', async ({ page }) => {
  const line = (velocity: number) => [0, 48, 96, 144, 192, 240, 288, 336].map((t, i) => note(t, [36, 36, 48, 36, 39, 36, 43, 36][i], 24, velocity));
  const soft = await renderNotes(page, 'acide', { resonance: 0.9 }, line(0.7));
  const hard = await renderNotes(page, 'acide', { resonance: 0.9 }, line(0.9));
  const s = stats([soft.L, soft.R]);
  const h = stats([hard.L, hard.R]);
  expect(s.nan + h.nan).toBe(0);
  expect(s.rms).toBeGreaterThan(0.01);
  expect(h.peak).toBeLessThan(1);
  expect(20 * Math.log10(h.rms / s.rms)).toBeGreaterThan(3);
});

test('Acide : glissé seulement quand les notes se chevauchent', async ({ page }) => {
  const params = { onde: 'square', resonance: 0, envmod: 0, coupure: 450, saturation: 0, glisse: 250 };
  // Do2 puis Do3 au deuxième temps (0,5 s) : la première note dure 1 temps et quart (liée) ou une croche (détachée).
  const tied = await renderNotes(page, 'acide', params, [note(0, 48, 120), note(96, 60, 96)]);
  const detached = await renderNotes(page, 'acide', params, [note(0, 48, 48), note(96, 60, 96)]);
  const start = 96 * SEC_PER_TICK;
  const zTied = crossings(tied.L, start + 0.01, start + 0.08);
  const zDetached = crossings(detached.L, start + 0.01, start + 0.08);
  // Détachée : la note part directement à 261,6 Hz (~18 passages en 70 ms) ; liée : elle glisse depuis 130,8 Hz.
  expect(zDetached).toBeGreaterThanOrEqual(16);
  expect(zTied).toBeLessThan(zDetached * 0.8);
  // Après le glissé, les deux rendus jouent la même hauteur.
  expect(Math.abs(crossings(tied.L, start + 0.35, start + 0.45) - crossings(detached.L, start + 0.35, start + 0.45))).toBeLessThanOrEqual(1);
});
