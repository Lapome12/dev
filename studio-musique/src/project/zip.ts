// Archive .zip sans compression (méthode « stored »), sans dépendance. Le lecteur d'artefacts
// n'accepte que certaines extensions au téléchargement (ni .wav, ni .mid, ni .frequence) :
// on y emballe le fichier dans un .zip, que tout système sait ouvrir.
import { FrequenceError } from './errors';

export interface ZipEntry { name: string; data: Uint8Array }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Date et heure au format MS-DOS (résolution de 2 s, années 1980 à 2107). */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, d.getFullYear()));
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const LOCAL = 0x04034b50, CENTRAL = 0x02014b50, END = 0x06054b50;
const UTF8_FLAG = 0x0800;
const MAX_ZIP32 = 0xfffffffe;

/** Construit une archive .zip non compressée (noms en UTF-8). Moins de 4 Go au total. */
export function zipStored(entries: ZipEntry[], when = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(when);
  const items = entries.map(e => ({ name: enc.encode(e.name), data: e.data, crc: crc32(e.data), offset: 0 }));
  const localSize = items.reduce((s, it) => s + 30 + it.name.length + it.data.length, 0);
  const centralSize = items.reduce((s, it) => s + 46 + it.name.length, 0);
  if (localSize + centralSize + 22 > MAX_ZIP32 || items.length > 0xffff) throw new FrequenceError('Fichier trop volumineux pour une archive .zip.');
  const out = new Uint8Array(localSize + centralSize + 22);
  const v = new DataView(out.buffer);
  let o = 0;
  for (const it of items) {
    it.offset = o;
    v.setUint32(o, LOCAL, true); v.setUint16(o + 4, 20, true); v.setUint16(o + 6, UTF8_FLAG, true);
    v.setUint16(o + 8, 0, true); v.setUint16(o + 10, time, true); v.setUint16(o + 12, date, true);
    v.setUint32(o + 14, it.crc, true); v.setUint32(o + 18, it.data.length, true); v.setUint32(o + 22, it.data.length, true);
    v.setUint16(o + 26, it.name.length, true); v.setUint16(o + 28, 0, true);
    out.set(it.name, o + 30);
    out.set(it.data, o + 30 + it.name.length);
    o += 30 + it.name.length + it.data.length;
  }
  const central = o;
  for (const it of items) {
    v.setUint32(o, CENTRAL, true); v.setUint16(o + 4, 20, true); v.setUint16(o + 6, 20, true); v.setUint16(o + 8, UTF8_FLAG, true);
    v.setUint16(o + 10, 0, true); v.setUint16(o + 12, time, true); v.setUint16(o + 14, date, true);
    v.setUint32(o + 16, it.crc, true); v.setUint32(o + 20, it.data.length, true); v.setUint32(o + 24, it.data.length, true);
    v.setUint16(o + 28, it.name.length, true);   // extra, commentaire, disque, attributs : 0
    v.setUint32(o + 42, it.offset, true);
    out.set(it.name, o + 46);
    o += 46 + it.name.length;
  }
  v.setUint32(o, END, true);
  v.setUint16(o + 8, items.length, true); v.setUint16(o + 10, items.length, true);
  v.setUint32(o + 12, o - central, true); v.setUint32(o + 16, central, true);
  return out;
}

export function isZip(data: Uint8Array): boolean {
  return data.length >= 4 && new DataView(data.buffer, data.byteOffset, 4).getUint32(0, true) === LOCAL;
}

/**
 * Lit les fichiers d'une archive non compressée (celles que fait Fréquence, et la plupart des
 * archives d'un seul fichier déjà compressé). Un fichier compressé est refusé avec un message clair.
 */
export function unzipStored(data: Uint8Array): ZipEntry[] {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
    if (v.getUint32(i, true) === END) { end = i; break; }
  }
  if (end < 0) throw new FrequenceError('Archive .zip abîmée.');
  const count = v.getUint16(end + 10, true);
  let o = v.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let k = 0; k < count; k++) {
    if (o + 46 > data.length || v.getUint32(o, true) !== CENTRAL) throw new FrequenceError('Archive .zip abîmée.');
    const method = v.getUint16(o + 10, true);
    const crc = v.getUint32(o + 16, true);
    const size = v.getUint32(o + 20, true);
    const nameLen = v.getUint16(o + 28, true), extraLen = v.getUint16(o + 30, true), commentLen = v.getUint16(o + 32, true);
    const local = v.getUint32(o + 42, true);
    const name = dec.decode(data.subarray(o + 46, o + 46 + nameLen));
    o += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;   // dossier
    if (method !== 0) throw new FrequenceError('Cette archive .zip est compressée : décompressez-la puis ouvrez le fichier qu’elle contient.');
    if (local + 30 > data.length || v.getUint32(local, true) !== LOCAL) throw new FrequenceError('Archive .zip abîmée.');
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (start + size > data.length) throw new FrequenceError('Archive .zip abîmée.');
    const body = data.slice(start, start + size);
    if (crc32(body) !== crc) throw new FrequenceError(`Archive .zip abîmée : « ${name} » est corrompu.`);
    out.push({ name, data: body });
  }
  return out;
}
