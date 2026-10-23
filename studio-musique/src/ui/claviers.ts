// Piano au clavier de l'ordinateur et clavier MIDI (étape 2.9 de Dev 3), branchés sur le bouton
// « Piano au clavier » du transport : ils jouent le canal sélectionné.

import { startComputerKeyboard, type NoteTarget } from '../project/input/clavier';
import { MIDI_MESSAGES, startMidiInput, stopMidiInput } from '../project/input/midi-in';
import type { Id } from '../project/types';
import { toast } from './components/toast';
import type { Contexte } from './contexte';

/** Joue le canal sélectionné ; une note se relâche sur le canal où elle a commencé. */
export function cibleCanal(ctx: Pick<Contexte, 'moteur' | 'ui'>): NoteTarget {
  const enCours = new Map<number, Id>();
  return {
    noteOn(pitch, velocity) {
      const canal = ctx.ui.get().canalId;
      if (!canal) return;
      const avant = enCours.get(pitch);
      if (avant) ctx.moteur.noteOff(avant, pitch);
      enCours.set(pitch, canal);
      ctx.moteur.noteOn(canal, pitch, velocity);
    },
    noteOff(pitch) {
      const canal = enCours.get(pitch);
      if (!canal) return;
      enCours.delete(pitch);
      ctx.moteur.noteOff(canal, pitch);
    },
  };
}

export function brancherClaviers(ctx: Contexte): void {
  let arreter: (() => void) | null = null;
  let midiRefuse = false;
  const appliquer = (actif: boolean) => {
    if (actif === !!arreter) return;
    if (!actif) { arreter?.(); arreter = null; return; }
    const cible = cibleCanal(ctx);
    const stopClavier = startComputerKeyboard(cible);
    arreter = () => { stopClavier(); stopMidiInput(); };
    void startMidiInput(cible).then(etat => {
      // Seul un refus mérite un message : sans Web MIDI, le clavier de l'ordinateur suffit.
      if (etat === 'refuse' && !midiRefuse) { midiRefuse = true; toast(MIDI_MESSAGES.refuse, 'alerte', 6000); }
      if (!arreter) stopMidiInput();   // bouton recoupé pendant la demande d'accès
    });
  };
  ctx.ui.subscribe(u => appliquer(u.clavier));
  appliquer(ctx.ui.get().clavier);
}
