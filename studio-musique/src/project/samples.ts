// Import d'échantillons (étape 2.7) : .wav, .mp3, .ogg, .flac, 2 minutes au plus.
// On garde le fichier d'origine (compact) ; le décodage est fait par le moteur (engine.decodeSample).
import { FrequenceError } from './errors';
import { newId } from './ids';
import type { SampleRef } from './types';
import { LIMITS } from './validate';

export const SAMPLE_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.flac'] as const;
export const SAMPLE_ACCEPT = SAMPLE_EXTENSIONS.join(',');
export const MAX_SAMPLE_BYTES = 50 * 1024 * 1024;

export interface ImportedSample { ref: SampleRef; data: ArrayBuffer; audio: AudioBuffer }

export async function importSample(
  file: Blob & { name: string },
  decode: (data: ArrayBuffer) => Promise<AudioBuffer>,
): Promise<ImportedSample> {
  const lower = file.name.toLowerCase();
  if (!SAMPLE_EXTENSIONS.some(e => lower.endsWith(e))) {
    throw new FrequenceError('Format non pris en charge : choisir un fichier .wav, .mp3, .ogg ou .flac.');
  }
  if (file.size > MAX_SAMPLE_BYTES) throw new FrequenceError('Son trop volumineux (50 Mo au plus).');
  const data = await file.arrayBuffer();
  let audio: AudioBuffer;
  try {
    // decodeAudioData détache le tampon qu'on lui donne : on lui passe une copie.
    audio = await decode(data.slice(0));
  } catch {
    throw new FrequenceError(`Impossible de lire le son « ${file.name} ».`);
  }
  if (audio.duration > LIMITS.sampleSec) throw new FrequenceError('Son trop long (2 minutes au plus).');
  const name = file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Son';
  return { ref: { id: newId(), name, durationSec: audio.duration }, data, audio };
}
