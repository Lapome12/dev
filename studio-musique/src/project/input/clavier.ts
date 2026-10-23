// Piano au clavier d'ordinateur (étape 2.9), par positions physiques (event.code) :
// même disposition en AZERTY et en QWERTY. Touches blanches sur la rangée du milieu,
// touches noires sur la rangée du dessus ; Z et X (positions QWERTY) changent d'octave.
export interface NoteTarget { noteOn(pitch: number, velocity: number): void; noteOff(pitch: number): void }

/** Décalage en demi-tons depuis le do de l'octave courante. */
export const KEY_MAP: Readonly<Record<string, number>> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17, BracketRight: 18,
};
export const OCTAVE_DOWN = 'KeyZ';
export const OCTAVE_UP = 'KeyX';

export interface ComputerKeyboard {
  stop(): void;
  octave(): number;                    // décalage d'octave, -4..4 (0 = do 4, MIDI 60)
  setVelocity(v: number): void;        // vélocité fixe, 0..1
  velocity(): number;
}


function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  if (el.isContentEditable) return true;
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(type);
  }
  return false;
}

export function createComputerKeyboard(
  target: NoteTarget,
  o: { velocity?: number; base?: number; root?: EventTarget } = {},
): ComputerKeyboard {
  const root = o.root ?? window;
  const base = o.base ?? 60;
  let octave = 0;
  let velocity = o.velocity ?? 0.8;
  const held = new Map<string, number>();   // code → hauteur jouée (pour relâcher la bonne note après un changement d'octave)

  const releaseAll = () => {
    for (const pitch of held.values()) target.noteOff(pitch);
    held.clear();
  };

  const down = (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target)) return;
    if (e.code === OCTAVE_DOWN || e.code === OCTAVE_UP) {
      e.preventDefault();
      if (!e.repeat) octave = Math.max(-4, Math.min(4, octave + (e.code === OCTAVE_UP ? 1 : -1)));
      return;
    }
    const offset = KEY_MAP[e.code];
    if (offset === undefined) return;
    e.preventDefault();
    if (e.repeat || held.has(e.code)) return;
    const pitch = base + octave * 12 + offset;
    if (pitch < 0 || pitch > 127) return;
    held.set(e.code, pitch);
    target.noteOn(pitch, velocity);
  };

  const up = (ev: Event) => {
    const e = ev as KeyboardEvent;
    const pitch = held.get(e.code);
    if (pitch === undefined) return;
    held.delete(e.code);
    target.noteOff(pitch);
  };

  root.addEventListener('keydown', down);
  root.addEventListener('keyup', up);
  root.addEventListener('blur', releaseAll);

  return {
    stop() {
      root.removeEventListener('keydown', down);
      root.removeEventListener('keyup', up);
      root.removeEventListener('blur', releaseAll);
      releaseAll();
    },
    octave: () => octave,
    setVelocity(v) { velocity = Math.max(0, Math.min(1, v)); },
    velocity: () => velocity,
  };
}

/** §D.4 : branche le piano au clavier ; renvoie la fonction qui le débranche. */
export function startComputerKeyboard(target: NoteTarget): () => void {
  const k = createComputerKeyboard(target);
  return () => k.stop();
}
