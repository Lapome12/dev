// Écriture d'un fichier WAV (RIFF, PCM entier 16 ou 24 bits, canaux entrelacés).

export function encodeWav(channels: Float32Array[], sampleRate: number, bitDepth: 16 | 24): Uint8Array<ArrayBuffer> {
  const numCh = channels.length;
  const frames = channels[0]?.length ?? 0;
  const bytes = bitDepth / 8;
  const dataSize = frames * numCh * bytes;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const ascii = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);                       // taille du bloc fmt
  v.setUint16(20, 1, true);                        // PCM
  v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * numCh * bytes, true);
  v.setUint16(32, numCh * bytes, true);
  v.setUint16(34, bitDepth, true);
  ascii(36, 'data');
  v.setUint32(40, dataSize, true);

  const max = bitDepth === 16 ? 32767 : 8388607;
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      const x = channels[c]?.[i] ?? 0;
      const s = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
      const q = Math.round(s * max);
      if (bitDepth === 16) {
        v.setInt16(o, q, true);
        o += 2;
      } else {
        v.setUint8(o, q & 0xff);
        v.setUint8(o + 1, (q >> 8) & 0xff);
        v.setUint8(o + 2, (q >> 16) & 0xff);
        o += 3;
      }
    }
  }
  return new Uint8Array(buf);
}

/** Crête absolue de tous les canaux. */
export function peakOf(channels: Float32Array[]): number {
  let m = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) m = Math.max(m, Math.abs(ch[i] ?? 0));
  return m;
}
