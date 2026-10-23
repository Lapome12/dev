// Fichier .frequence (étape 2.7) : JSON du projet, échantillons à côté en base64.
// openFile valide tout (validate.ts) et migre les anciennes versions.
import { fromBase64, toBase64 } from './base64';
import { FrequenceError } from './errors';
import type { Id, Project } from './types';
import { sanitizeProject } from './validate';

export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const FILE_EXTENSION = '.frequence';
export const FILE_MIME = 'application/x-frequence+json';

interface FileShape { project: Project; audio: Record<Id, string> }

export function saveFile(p: Project, samples: Map<Id, ArrayBuffer>): Blob {
  const audio: Record<Id, string> = {};
  for (const ref of p.samples) {
    const data = samples.get(ref.id);
    if (data) audio[ref.id] = toBase64(data);
  }
  const file: FileShape = { project: p, audio };
  return new Blob([JSON.stringify(file)], { type: FILE_MIME });
}

/** Migrations successives : chaque entrée transforme la version n en n + 1. */
const MIGRATIONS: Record<number, (p: Record<string, unknown>) => Record<string, unknown>> = {};
const CURRENT_VERSION = 1;

export function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  let p = raw as Record<string, unknown>;
  if (p.format !== 'frequence') return p;
  if (typeof p.version !== 'number' || !Number.isInteger(p.version) || p.version < 1) {
    throw new FrequenceError('Fichier invalide : version de projet absente ou incorrecte.');
  }
  if (p.version > CURRENT_VERSION) {
    throw new FrequenceError('Ce projet a été créé par une version plus récente de Fréquence.');
  }
  while ((p.version as number) < CURRENT_VERSION) {
    const step = MIGRATIONS[p.version as number];
    if (!step) throw new FrequenceError(`Aucune migration depuis la version ${String(p.version)}.`);
    p = step(p);
  }
  return p;
}

export async function openFile(b: Blob): Promise<{ project: Project; samples: Map<Id, ArrayBuffer> }> {
  if (b.size > MAX_FILE_BYTES) throw new FrequenceError('Fichier trop volumineux (200 Mo au plus).');
  let raw: unknown;
  try {
    raw = JSON.parse(await b.text());
  } catch {
    throw new FrequenceError('Ce fichier est abîmé ou n’est pas un projet Fréquence.');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new FrequenceError('Ce fichier n’est pas un projet Fréquence.');
  }
  const shape = raw as Record<string, unknown>;
  const project = sanitizeProject(migrate(shape.project));
  const audio = shape.audio ?? {};
  if (typeof audio !== 'object' || audio === null || Array.isArray(audio)) {
    throw new FrequenceError('Fichier invalide : les échantillons sont mal enregistrés.');
  }
  const samples = new Map<Id, ArrayBuffer>();
  for (const ref of project.samples) {
    const text = (audio as Record<string, unknown>)[ref.id];
    if (typeof text !== 'string') continue;
    try {
      samples.set(ref.id, fromBase64(text));
    } catch {
      throw new FrequenceError(`Fichier invalide : l’échantillon « ${ref.name} » est abîmé.`);
    }
  }
  // Un échantillon sans données reste listé : l'interface le signale comme manquant.
  return { project, samples };
}
