// Services de fichiers et d'export utilisés par le menu Projet, le navigateur et l'accueil.
// main.ts les branche sur les modules de Dev 3 (fichiers, MIDI, modèles, démo) et de Dev 1 (rendu WAV)
// au fur et à mesure qu'ils existent : un service absent grise simplement l'entrée de menu.

import type { Channel, Id, Pattern, Project } from '../project/types';
import { isZip, unzipStored, zipStored } from '../project/zip';
import { toast } from './components/toast';
import type { PlayMode } from './moteur';

export interface OptionsRendu { mode: PlayMode; sampleRate: 44100 | 48000; bitDepth: 16 | 24; tailSec: number; normalize: boolean }
/** Un projet et les sons qu'il contient (modèles, démo). */
export interface Morceau { project: Project; samples: Map<Id, ArrayBuffer> }
export interface Modele { id: string; nom: string; description: string; creer(): Morceau }

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
  demo?(): Morceau;
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

// --- Téléchargements ---
// Dans le lecteur d'artefacts de claude.ai, un lien <a download> ne fait rien : il faut passer par la
// capacité « downloads », qui demande confirmation à la personne et n'accepte que certaines
// extensions. Ailleurs (npm run dev, fichier ouvert directement), on garde le lien classique.

/** Extensions acceptées par la capacité « downloads » ; les autres partent dans un .zip. */
const EXTENSIONS_ACCEPTEES = new Set('gif png jpg jpeg webp mp4 webm mov txt json md docx pptx epub csv ttf html svg pdf xlsx zip'.split(' '));

interface Enregistreur { save(r: { filename: string; data: Blob }): Promise<unknown> }
let enregistreur: Promise<Enregistreur | null> | null = null;

function enregistreurArtefact(): Promise<Enregistreur | null> {
  const claude = (window as unknown as { claude?: { use?(nom: string): Promise<unknown> } }).claude;
  if (typeof claude?.use !== 'function') return Promise.resolve(null);
  enregistreur ??= claude.use('downloads').then(d => (d as Enregistreur | null) ?? null, () => null);
  return enregistreur;
}

function lienDeTelechargement(blob: Blob, nom: string): void {
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

/** Le fichier tel qu'il sera proposé : emballé dans un .zip si son extension n'est pas acceptée. */
export async function preparerTelechargement(blob: Blob, nom: string): Promise<{ data: Blob; nom: string }> {
  const ext = nom.includes('.') ? nom.slice(nom.lastIndexOf('.') + 1).toLowerCase() : '';
  if (EXTENSIONS_ACCEPTEES.has(ext)) return { data: blob, nom };
  const zip = zipStored([{ name: nom, data: new Uint8Array(await blob.arrayBuffer()) }]);
  return { data: new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' }), nom: `${nom}.zip` };
}

const MESSAGES: Record<string, string> = {
  rate_limited: 'Une demande d\'enregistrement est déjà ouverte : répondez-y, ou réessayez dans un instant.',
  too_large: 'Ce fichier est trop gros pour être enregistré ici.',
  extension_not_enabled: 'Ce format ne peut pas être enregistré ici.',
};

/**
 * Propose un fichier à la personne. « enregistre » : accepté (nom final, peut-être en .zip) ;
 * « refuse » : elle a dit non (rien à signaler) ; « lien » : téléchargement direct du navigateur.
 * Rejette avec un message lisible quand l'enregistrement échoue.
 */
export async function telecharger(blob: Blob, nom: string): Promise<{ statut: 'enregistre' | 'refuse' | 'lien'; nom: string }> {
  const dl = await enregistreurArtefact();
  if (dl) {
    const f = await preparerTelechargement(blob, nom);
    try {
      await dl.save({ filename: f.nom, data: f.data });
      return { statut: 'enregistre', nom: f.nom };
    } catch (e) {
      const code = typeof e === 'object' && e !== null ? String((e as { code?: unknown }).code ?? '') : '';
      if (code === 'declined') return { statut: 'refuse', nom: f.nom };
      if (['rate_limited', 'too_large', 'extension_not_enabled', 'rejected_extension', 'bad_request', 'transform_error'].includes(code)) {
        throw new Error(MESSAGES[code] ?? `Enregistrement impossible ici (${code}).`);
      }
      // unavailable, not_granted, capacité retirée… : on retombe sur le lien classique.
    }
  }
  lienDeTelechargement(blob, nom);
  return { statut: 'lien', nom };
}

/**
 * Ouvre le sélecteur de fichiers et renvoie le fichier choisi (ou null). Accepte aussi le .zip que
 * Fréquence produit dans claude.ai : le fichier qu'il contient est rendu à sa place.
 */
export function choisirFichier(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${accept},.zip,application/zip`;
    input.addEventListener('change', () => { void deballer(input.files?.[0] ?? null, accept).then(resolve); }, { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

/** Un .zip est remplacé par le fichier qu'il contient (celui qui a la bonne extension de préférence). */
export async function deballer(f: File | null, accept: string): Promise<File | null> {
  if (!f || !/\.zip$/i.test(f.name)) return f;
  try {
    const data = new Uint8Array(await f.arrayBuffer());
    if (!isZip(data)) return f;
    const fichiers = unzipStored(data);
    const extensions = accept.split(',').map(x => x.trim().toLowerCase()).filter(x => x.startsWith('.'));
    const choisi = fichiers.find(x => extensions.some(e => x.name.toLowerCase().endsWith(e))) ?? fichiers[0];
    if (!choisi) { toast('Cette archive .zip est vide.', 'alerte'); return null; }
    return new File([choisi.data.buffer as ArrayBuffer], choisi.name.split('/').pop() || choisi.name);
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'alerte', 6000);
    return null;
  }
}

export function nomFichier(nom: string, extension: string): string {
  const base = nom.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Sans titre';
  return `${base}.${extension}`;
}
