// Services de fichiers et d'export utilisés par le menu Projet, le navigateur et l'accueil.
// main.ts les branche sur les modules de Dev 3 (fichiers, MIDI, modèles, démo) et de Dev 1 (rendu WAV)
// au fur et à mesure qu'ils existent : un service absent grise simplement l'entrée de menu.

import type { Channel, Id, Pattern, Project } from '../project/types';
import type { PlayMode } from './moteur';

export interface OptionsRendu { mode: PlayMode; sampleRate: 44100 | 48000; bitDepth: 16 | 24; tailSec: number; normalize: boolean }
export interface Modele { id: string; nom: string; description: string; creer(): Project }

export interface ServicesProjet {
  saveFile?(p: Project, samples: Map<Id, ArrayBuffer>): Blob;
  openFile?(b: Blob): Promise<{ project: Project; samples: Map<Id, ArrayBuffer> }>;
  autosave?(p: Project): void;
  restoreAutosave?(): Promise<{ project: Project; samples: Map<Id, ArrayBuffer> } | null>;
  autosaveSample?(id: Id, data: ArrayBuffer): Promise<void>;
  exportMidi?(p: Project, o?: { patternId?: Id }): Uint8Array;
  importMidi?(data: ArrayBuffer): { channels: Channel[]; pattern: Pattern; bpm?: number | null };
  renderWav?(p: Project, samples: Map<Id, AudioBuffer>, o: OptionsRendu, onProgress?: (ratio: number) => void): Promise<Blob>;
  decodeSample?(data: ArrayBuffer): Promise<AudioBuffer>;
  setSampleAudio?(id: Id, audio: AudioBuffer): void;
  modeles?: Modele[];
  demo?(): Project;
}

/** Les sons importés : octets d'origine (pour l'enregistrement) et audio décodé (pour la lecture et l'export). */
export class Echantillons {
  readonly octets = new Map<Id, ArrayBuffer>();
  readonly audio = new Map<Id, AudioBuffer>();
  constructor(private services: ServicesProjet) {}

  async ajouter(id: Id, data: ArrayBuffer): Promise<AudioBuffer> {
    if (!this.services.decodeSample) throw new Error('Décodage audio indisponible.');
    // decodeAudioData détache le tampon : on garde une copie pour l'enregistrement.
    const copie = data.slice(0);
    const audio = await this.services.decodeSample(data);
    this.octets.set(id, copie);
    this.audio.set(id, audio);
    this.services.setSampleAudio?.(id, audio);
    void this.services.autosaveSample?.(id, copie);
    return audio;
  }

  async remplacerTout(samples: Map<Id, ArrayBuffer>): Promise<string[]> {
    this.octets.clear();
    this.audio.clear();
    const echecs: string[] = [];
    for (const [id, data] of samples) {
      try { await this.ajouter(id, data); } catch { echecs.push(id); }
    }
    return echecs;
  }
}

/** Fait télécharger un fichier au navigateur. */
export function telecharger(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Ouvre le sélecteur de fichiers et renvoie le fichier choisi (ou null). */
export function choisirFichier(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

/** Nom de fichier sûr à partir du nom du projet. */
export function nomFichier(nom: string, extension: string): string {
  const base = nom.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Sans titre';
  return `${base}.${extension}`;
}
