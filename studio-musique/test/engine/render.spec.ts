// Test Playwright du rendu WAV (étape 3.2) : le moteur réel dans Chromium, en OfflineAudioContext.
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { defaultParams } from '../../src/engine/params';
import type { EffectSlot, InstrumentType, Note, ParamValue, Project } from '../../src/project/types';
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
  return renderProject(page, p);
}

async function renderProject(page: import('@playwright/test').Page, p: Project) {
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

test('Accord : les 3 timbres sonnent, sans NaN ni saturation, et s’élargissent en stéréo', async ({ page }) => {
  test.setTimeout(120_000);
  const notes = [note(0, 60, 90, 0.9), note(96, 65, 90, 0.9), note(192, 67, 90, 0.9), note(288, 57, 90, 0.9)];
  for (const timbre of ['orgue', 'nappe', 'piano']) {
    for (const accord of ['majeur', 'm9']) {
      const r = await renderNotes(page, 'accord', { timbre, accord, largeur: 1 }, notes);
      const st = stats([r.L, r.R]);
      expect(st.nan, `${timbre} ${accord}`).toBe(0);
      expect(st.rms, `${timbre} ${accord}`).toBeGreaterThan(0.01);
      expect(st.peak, `${timbre} ${accord}`).toBeLessThan(1);
      // Largeur à 1 : gauche et droite diffèrent nettement.
      const side = stats([r.L.map((v, i) => (v - r.R[i]!) / 2)]);
      expect(side.rms / st.rms, `${timbre} ${accord}`).toBeGreaterThan(0.1);
    }
  }
  // Largeur à 0 : mono, à des écarts d'arrondi près (côté sous -40 dB).
  const mono = await renderNotes(page, 'accord', { timbre: 'nappe', largeur: 0 }, notes);
  const monoSide = stats([mono.L.map((v, i) => (v - mono.R[i]!) / 2)]).rms;
  expect(monoSide / stats([mono.L, mono.R]).rms).toBeLessThan(0.01);
});

test('Frappe : les 12 voix sonnent, le caractère épaissit le son', async ({ page }) => {
  test.setTimeout(120_000);
  const pitches = [36, 38, 39, 37, 42, 46, 49, 45, 50, 56, 47, 51];
  const kit = pitches.map((pitch, i) => note(i * 32, pitch, 24, 0.9));
  const clean = await renderNotes(page, 'frappe', {}, kit);
  const dirty = await renderNotes(page, 'frappe', { caractere: 1 }, kit);
  for (let i = 0; i < pitches.length; i++) {
    const t = i * 32 * SEC_PER_TICK;
    expect(stats([clean.L], t, t + 32 * SEC_PER_TICK).rms, `voix ${pitches[i]}`).toBeGreaterThan(0.002);
  }
  const c = stats([clean.L, clean.R]);
  const d = stats([dirty.L, dirty.R]);
  expect(c.nan + d.nan).toBe(0);
  expect(d.peak).toBeLessThan(1);
  expect(d.rms).toBeGreaterThan(c.rms * 1.5);
});

/** Nappe tenue sur la tranche 2 ; grosse caisse à la noire sur la tranche 1 (éventuellement muette). */
function sidechainProject(withEffect: boolean, sourceMuted: boolean, withPad = true): Project {
  const p = project({
    channels: [
      channel('kick', { instrument: { type: 'frappe', params: defaultParams('frappe') }, mixerTrack: 1, volume: 1, mute: sourceMuted }),
      channel('pad', { instrument: { type: 'trio', params: defaultParams('trio') }, mixerTrack: 2, volume: 0.8 }),
    ],
  });
  p.patterns[0]!.notes = { kick: [0, 96, 192, 288].map((t) => note(t, 36, 24, 1)), pad: withPad ? [note(0, 48, 384), note(0, 55, 384), note(0, 60, 384)] : [] };
  const slot: EffectSlot = { id: 'sc', type: 'sidechain', bypass: !withEffect, mix: 1, params: { ...defaultParams('sidechain'), source: 1 } };
  p.mixer[2]!.effects = [slot];
  return p;
}

test('Sidechain : la nappe baisse quand la source joue, rien ne change quand elle est muette', async ({ page }) => {
  test.setTimeout(120_000);
  const minus = (a: { L: number[] }, b: { L: number[] }) => a.L.map((v, i) => v - b.L[i]!);
  const on = await renderProject(page, sidechainProject(true, false));
  const off = await renderProject(page, sidechainProject(false, false));
  const kick = await renderProject(page, sidechainProject(false, false, false));
  const quietOn = await renderProject(page, sidechainProject(true, true));
  const quietOff = await renderProject(page, sidechainProject(false, true));
  expect(stats([on.L, on.R]).nan).toBe(0);
  // La grosse caisse est la même partout : en la retranchant, il reste la nappe seule.
  const padOn = minus(on, kick);
  const padOff = minus(off, kick);
  // Juste après le deuxième coup (0,5 s), la nappe est nettement plus basse, puis elle remonte.
  const beat = 96 * SEC_PER_TICK;
  expect(stats([padOn], beat + 0.01, beat + 0.06).rms).toBeLessThan(stats([padOff], beat + 0.01, beat + 0.06).rms * 0.6);
  expect(stats([padOn], beat + 0.4, beat + 0.48).rms).toBeGreaterThan(stats([padOff], beat + 0.4, beat + 0.48).rms * 0.9);
  // Source muette : aucune réduction de gain, dès le début.
  expect(stats([minus(quietOff, quietOn)]).peak).toBeLessThan(1e-3);
});

test('Sidechain : une tranche qui se pilote elle-même est ignorée, sans boucle', async ({ page }) => {
  const p = sidechainProject(true, false);
  p.mixer[2]!.effects[0]!.params = { ...defaultParams('sidechain'), source: 2 };
  const self = await renderProject(page, p);
  const ref = await renderProject(page, sidechainProject(false, false));
  expect(stats([self.L, self.R]).nan).toBe(0);
  expect(stats([self.L.map((v, i) => v - ref.L[i]!)]).peak).toBeLessThan(1e-3);
});
