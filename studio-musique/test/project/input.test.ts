import { describe, expect, it } from 'vitest';
import { createComputerKeyboard } from '../../src/project/input/clavier';
import { createMidiHandler } from '../../src/project/input/midi-in';

function cible() {
  const log: string[] = [];
  return { log, noteOn: (p: number, v: number) => log.push(`on ${p} ${v.toFixed(2)}`), noteOff: (p: number) => log.push(`off ${p}`) };
}

class Racine extends EventTarget {
  key(type: 'keydown' | 'keyup', code: string, extra: Record<string, unknown> = {}) {
    const e = new Event(type, { cancelable: true });
    for (const [k, v] of Object.entries({ code, repeat: false, ctrlKey: false, altKey: false, metaKey: false, ...extra })) Object.defineProperty(e, k, { value: v });
    this.dispatchEvent(e);
    return e;
  }
}

describe('piano au clavier', () => {
  it('joue par position physique et change d’octave', () => {
    const t = cible(), root = new Racine();
    const k = createComputerKeyboard(t, { root });
    const e = root.key('keydown', 'KeyA');
    expect(e.defaultPrevented).toBe(true);
    root.key('keydown', 'KeyA', { repeat: true });       // répétition : ignorée
    root.key('keydown', 'KeyW');
    root.key('keyup', 'KeyA'); root.key('keyup', 'KeyW');
    root.key('keydown', 'KeyX');
    expect(k.octave()).toBe(1);
    k.setVelocity(2);
    root.key('keydown', 'KeyK');
    expect(t.log).toEqual(['on 60 0.80', 'on 61 0.80', 'off 60', 'off 61', 'on 84 1.00']);
  });

  it('relâche la bonne note après un changement d’octave et à l’arrêt', () => {
    const t = cible(), root = new Racine();
    const k = createComputerKeyboard(t, { root });
    root.key('keydown', 'KeyA');
    root.key('keydown', 'KeyZ');
    root.key('keyup', 'KeyA');
    root.key('keydown', 'KeyS');
    k.stop();
    root.key('keydown', 'KeyD');
    expect(t.log).toEqual(['on 60 0.80', 'off 60', 'on 50 0.80', 'off 50']);
  });

  it('ne gêne ni les raccourcis ni la saisie', () => {
    const t = cible(), root = new Racine();
    createComputerKeyboard(t, { root });
    root.key('keydown', 'KeyS', { ctrlKey: true });
    root.key('keydown', 'KeyA', { target: { tagName: 'INPUT', type: 'text' } });
    root.key('keydown', 'Space');
    expect(t.log).toEqual([]);
  });

  it('coupe tout quand la fenêtre perd le focus', () => {
    const t = cible(), root = new Racine();
    createComputerKeyboard(t, { root });
    root.key('keydown', 'KeyA'); root.key('keydown', 'KeyD');
    root.dispatchEvent(new Event('blur'));
    expect(t.log).toEqual(['on 60 0.80', 'on 64 0.80', 'off 60', 'off 64']);
  });
});

describe('clavier MIDI', () => {
  it('note on/off, vélocité, note on à vélocité nulle', () => {
    const t = cible(), m = createMidiHandler(t);
    m.handle([0x90, 60, 127]); m.handle([0x91, 64, 64]);
    m.handle([0x80, 60, 0]); m.handle([0x90, 64, 0]);
    expect(t.log).toEqual(['on 60 1.00', 'on 64 0.50', 'off 60', 'off 64']);
  });

  it('pédale de sustain', () => {
    const t = cible(), m = createMidiHandler(t);
    m.handle([0xb0, 64, 127]);
    m.handle([0x90, 60, 100]); m.handle([0x80, 60, 0]);
    m.handle([0x90, 62, 100]);
    m.handle([0xb0, 64, 0]);          // relâche 60, 62 reste enfoncée
    m.handle([0x80, 62, 0]);
    expect(t.log).toEqual(['on 60 0.79', 'on 62 0.79', 'off 60', 'off 62']);
  });

  it('ignore le reste et coupe tout sur CC 123', () => {
    const t = cible(), m = createMidiHandler(t);
    m.handle([0xe0, 0, 64]); m.handle([0xf8]); m.handle([]);
    m.handle([0x90, 60, 100]);
    m.handle([0xb0, 123, 0]);
    expect(t.log).toEqual(['on 60 0.79', 'off 60']);
  });
});
