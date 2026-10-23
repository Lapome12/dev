// Clavier MIDI (étape 2.9) par Web MIDI quand le navigateur le permet :
// note on/off, vélocité, pédale de sustain (CC 64). Les claviers branchés en cours de route sont pris.
import type { NoteTarget } from './clavier';

export type MidiStatus = 'ok' | 'refuse' | 'indisponible';

export const MIDI_MESSAGES: Record<MidiStatus, string> = {
  ok: 'Clavier MIDI prêt.',
  refuse: 'Accès au MIDI refusé : l’autoriser dans les réglages du navigateur pour jouer avec un clavier MIDI.',
  indisponible: 'Ce navigateur ne gère pas le MIDI : utiliser Chrome, Edge ou Opera sur ordinateur, ou le clavier de l’ordinateur.',
};

/** Traduit les messages MIDI bruts en noteOn/noteOff, sustain compris. Tous les canaux MIDI sont écoutés. */
export function createMidiHandler(target: NoteTarget): { handle(data: ArrayLike<number>): void; reset(): void } {
  const down = new Set<number>();       // touches enfoncées
  const sounding = new Set<number>();   // notes qui sonnent (enfoncées ou tenues par la pédale)
  let sustain = false;

  const off = (pitch: number) => {
    if (sounding.delete(pitch)) target.noteOff(pitch);
  };

  return {
    handle(data) {
      const status = data[0] ?? 0, a = data[1] ?? 0, b = data[2] ?? 0;
      const kind = status & 0xf0;
      if (kind === 0x90 && b > 0) {
        if (sounding.has(a)) target.noteOff(a);     // re-frappe pendant le sustain
        down.add(a); sounding.add(a);
        target.noteOn(a, b / 127);
      } else if (kind === 0x80 || (kind === 0x90 && b === 0)) {
        down.delete(a);
        if (!sustain) off(a);
      } else if (kind === 0xb0 && a === 64) {
        sustain = b >= 64;
        if (!sustain) for (const p of [...sounding]) if (!down.has(p)) off(p);
      } else if (kind === 0xb0 && (a === 120 || a === 123)) {   // tout couper
        down.clear();
        for (const p of [...sounding]) off(p);
      }
    },
    reset() {
      down.clear(); sustain = false;
      for (const p of [...sounding]) off(p);
    },
  };
}

let current: { access: MIDIAccess; handler: ReturnType<typeof createMidiHandler> } | null = null;

/** §D.4 : écoute tous les claviers MIDI. Un nouvel appel remplace l'écoute précédente. */
export async function startMidiInput(target: NoteTarget): Promise<MidiStatus> {
  stopMidiInput();
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  if (!nav || typeof nav.requestMIDIAccess !== 'function') return 'indisponible';
  let access: MIDIAccess;
  try {
    access = await nav.requestMIDIAccess({ sysex: false });
  } catch (e) {
    return e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'refuse' : 'indisponible';
  }
  const handler = createMidiHandler(target);
  const listen = (e: MIDIMessageEvent) => { if (e.data) handler.handle(e.data); };
  const attach = () => { access.inputs.forEach(input => { input.onmidimessage = listen; }); };
  attach();
  access.onstatechange = attach;
  current = { access, handler };
  return 'ok';
}

export function stopMidiInput(): void {
  if (!current) return;
  current.access.onstatechange = null;
  current.access.inputs.forEach(input => { input.onmidimessage = null; });
  current.handler.reset();
  current = null;
}
