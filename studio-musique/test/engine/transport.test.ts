import { describe, expect, it } from 'vitest';
import { PPQ, type Project } from '../../src/project/types';
import {
  collectEvents, loopRange, secondsPerTick, songEnd, swingTick, Transport, TIMER_MS, LOOKAHEAD_SEC, type NoteEvent,
} from '../../src/engine/transport';
import { channel, note, project } from './helpers';

function run(p: Project, mode: Parameters<Transport['start']>[0], seconds: number, opts: { jitter?: boolean } = {}) {
  let now = 0;
  const notes: { ev: NoteEvent; time: number; duration: number }[] = [];
  const clicks: { time: number; accent: boolean }[] = [];
  const tr = new Transport({
    now: () => now, project: () => p,
    note: (ev, time, duration) => notes.push({ ev, time, duration }),
    click: (time, accent) => clicks.push({ time, accent }),
  });
  tr.start(mode, 0, 0.05);
  let i = 0;
  while (now < seconds) {
    // Minuteur irrégulier : le navigateur ne garantit pas 25 ms pile.
    now += (TIMER_MS + (opts.jitter ? ((i++ * 7919) % 23) - 8 : 0)) / 1000;
    tr.schedule();
  }
  return { tr, notes, clicks, now: () => now, setNow: (t: number) => (now = t) };
}

describe('calcul des temps', () => {
  it('convertit les ticks en secondes', () => {
    expect(secondsPerTick(120) * PPQ).toBeCloseTo(0.5, 12);
    expect(secondsPerTick(60) * PPQ * 4).toBeCloseTo(4, 12);
  });

  it('programme chaque note une seule fois, au bon instant', () => {
    const p = project();
    const { notes } = run(p, { kind: 'pattern', patternId: 'p1' }, 3.9);
    // 120 BPM, motif d'une mesure (2 s) de 4 noires : 8 notes en 4 s
    const times = notes.map((n) => n.time);
    expect(times.length).toBe(8);
    times.forEach((t, k) => expect(t).toBeCloseTo(0.05 + k * 0.5, 9));
    expect(notes[0]?.duration).toBeCloseTo(24 * secondsPerTick(120), 9);
  });

  it('programme toujours dans le futur, avec au plus 100 ms d’avance', () => {
    const p = project();
    let now = 0;
    const tr = new Transport({
      now: () => now, project: () => p,
      note: (_ev, time) => {
        expect(time).toBeGreaterThanOrEqual(now);
        expect(time - now).toBeLessThanOrEqual(LOOKAHEAD_SEC + 1e-9);
      },
    });
    tr.start({ kind: 'pattern', patternId: 'p1' }, 0, 0.05);
    for (; now < 10; now += 0.025) tr.schedule();
  });

  it('ne dérive pas : 5 minutes à 170 BPM, écart < 1 ms', () => {
    const p = project({ bpm: 170 });
    const pat = p.patterns[0]!;
    pat.notes = { a: Array.from({ length: 16 }, (_, k) => note(k * 24)) };
    const { notes, tr, now } = run(p, { kind: 'pattern', patternId: 'p1' }, 300, { jitter: true });
    const spt = secondsPerTick(170);
    expect(notes.length).toBeGreaterThan(2000);
    notes.forEach((n, k) => expect(Math.abs(n.time - (0.05 + k * 24 * spt))).toBeLessThan(0.001));
    // La position affichée suit l'horloge audio.
    const t = now();
    const expected = ((t - 0.05) / spt) % 384;
    expect(Math.abs(tr.position(t) - expected) * spt).toBeLessThan(0.001);
  });
});

describe('swing', () => {
  it('ne déplace que les doubles-croches paires', () => {
    expect(swingTick(0, 1)).toBe(0);
    expect(swingTick(48, 1)).toBe(48);
    expect(swingTick(24, 0.5)).toBe(30);
    expect(swingTick(24, 1)).toBe(36);
    expect(swingTick(72, 1)).toBe(84);
    expect(swingTick(24, 0)).toBe(24);
  });

  it('est croissant et continu', () => {
    let prev = -1;
    for (let t = 0; t < 400; t += 0.5) {
      const w = swingTick(t, 0.7);
      expect(w).toBeGreaterThan(prev);
      expect(w - prev).toBeLessThan(2);
      prev = w;
    }
  });

  it('retarde la note sur la 2e double-croche', () => {
    const p = project({ swing: 1 });
    p.patterns[0]!.notes = { a: [note(0), note(24), note(48)] };
    const { notes } = run(p, { kind: 'pattern', patternId: 'p1' }, 0.5);
    const spt = secondsPerTick(120);
    expect(notes[1]!.time).toBeCloseTo(0.05 + 36 * spt, 9);
    expect(notes[2]!.time).toBeCloseTo(0.05 + 48 * spt, 9);
  });
});

describe('boucle et modes', () => {
  it('mode pattern : boucle sur la longueur du pattern', () => {
    const p = project();
    expect(loopRange(p, { kind: 'pattern', patternId: 'p1' })).toEqual({ start: 0, end: 384 });
  });

  it('mode morceau : clips répétés, tronqués, décalés', () => {
    const p = project();
    // Clip de 1,5 mesure : le pattern d'une mesure est répété puis coupé.
    p.arrangement.clips = [{ id: 'c1', trackId: 't1', patternId: 'p1', start: 384, length: 576, offset: 0 }];
    const ev = collectEvents(p, { kind: 'morceau' }, 0, 2000);
    expect(ev.map((e) => e.tick)).toEqual([384, 480, 576, 672, 768, 864]);
    // Décalage d'une noire dans le pattern
    p.arrangement.clips = [{ id: 'c1', trackId: 't1', patternId: 'p1', start: 0, length: 192, offset: 96 }];
    expect(collectEvents(p, { kind: 'morceau' }, 0, 2000).map((e) => e.tick)).toEqual([0, 96]);
    expect(songEnd(p)).toBe(384);
  });

  it('respecte mute, solo et pistes muettes', () => {
    const p = project({ channels: [channel('a'), channel('b')] });
    p.patterns[0]!.notes = { a: [note(0)], b: [note(0, 62)] };
    expect(collectEvents(p, { kind: 'pattern', patternId: 'p1' }, 0, 384).length).toBe(2);
    p.channels[1]!.solo = true;
    expect(collectEvents(p, { kind: 'pattern', patternId: 'p1' }, 0, 384).map((e) => e.channelId)).toEqual(['b']);
    p.channels[1]!.solo = false;
    p.channels[0]!.mute = true;
    expect(collectEvents(p, { kind: 'pattern', patternId: 'p1' }, 0, 384).map((e) => e.channelId)).toEqual(['b']);
    p.arrangement.clips = [{ id: 'c1', trackId: 't1', patternId: 'p1', start: 0, length: 384, offset: 0 }];
    p.arrangement.tracks[0]!.mute = true;
    expect(collectEvents(p, { kind: 'morceau' }, 0, 384)).toEqual([]);
  });

  it('boucle de l’arrangement : revient au début de la boucle sans trou', () => {
    const p = project();
    p.arrangement.clips = [{ id: 'c1', trackId: 't1', patternId: 'p1', start: 0, length: 1536, offset: 0 }];
    p.arrangement.loop = { start: 384, end: 768 };
    let now = 0;
    const got: { tick: number; time: number }[] = [];
    const tr = new Transport({ now: () => now, project: () => p, note: (ev, time) => got.push({ tick: ev.tick, time }) });
    tr.start({ kind: 'morceau' }, 0, 0);
    for (; now < 6; now += 0.025) tr.schedule();
    expect(got.slice(0, 10).map((g) => g.tick)).toEqual([0, 96, 192, 288, 384, 480, 576, 672, 384, 480]);
    got.slice(0, 12).forEach((g, k) => expect(g.time).toBeCloseTo(k * 0.5, 9));
    expect(tr.position(4.25)).toBeCloseTo(384 + 96 / 2, 6);
  });

  it('métronome : un clic par temps, accent sur le premier', () => {
    const p = project();
    let now = 0;
    const clicks: boolean[] = [];
    const tr = new Transport({ now: () => now, project: () => p, note: () => {}, click: (_t, a) => clicks.push(a) });
    tr.metronome = true;
    tr.start({ kind: 'pattern', patternId: 'p1' }, 0, 0);
    for (; now < 3.9; now += 0.025) tr.schedule();
    expect(clicks).toEqual([true, false, false, false, true, false, false, false]);
  });

  it('changement de tempo pendant la lecture : pas de saut', () => {
    const p = project();
    p.patterns[0]!.notes = { a: Array.from({ length: 16 }, (_, k) => note(k * 24)) };
    let now = 0;
    const times: number[] = [];
    const tr = new Transport({ now: () => now, project: () => p, note: (_e, t) => times.push(t) });
    tr.start({ kind: 'pattern', patternId: 'p1' }, 0, 0);
    for (; now < 1; now += 0.025) tr.schedule();
    tr.setBpm(240);
    for (; now < 2; now += 0.025) tr.schedule();
    const gaps = times.slice(1).map((t, k) => t - times[k]!);
    // Avant : 0,125 s par double-croche ; après : 0,0625 s ; la double-croche à cheval entre les deux.
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(0.0625 - 1e-9);
      expect(g).toBeLessThanOrEqual(0.125 + 1e-9);
    }
    expect(gaps.filter((g) => Math.abs(g - 0.0625) > 1e-9 && Math.abs(g - 0.125) > 1e-9).length).toBeLessThanOrEqual(1);
    expect(Math.abs(gaps.at(-1)! - 0.0625)).toBeLessThan(1e-9);
  });
});

describe('position après un changement de tempo', () => {
  it('chaque segment garde son tempo', () => {
    const p = project();
    let now = 0;
    const tr = new Transport({ now: () => now, project: () => p, note: () => {} });
    tr.start({ kind: 'pattern', patternId: 'p1' }, 0, 0);
    for (; now < 0.3; now += 0.025) tr.schedule();
    tr.setBpm(60);
    // Juste après le changement, la partie déjà programmée reste à 120 BPM.
    expect(tr.position(0.3)).toBeCloseTo(0.3 / secondsPerTick(120), 6);
  });
});
