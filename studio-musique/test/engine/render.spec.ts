// Test Playwright du rendu WAV (étape 3.2) : le moteur réel dans Chromium, en OfflineAudioContext.
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

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
