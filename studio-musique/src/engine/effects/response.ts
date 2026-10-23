// Réponse en fréquence d'une chaîne de filtres (courbes d'égaliseur et de filtre).

/** Remplit `magDb` avec la somme des réponses (en dB) des filtres, plus `offsetDb`. */
export function responseDb(filters: BiquadFilterNode[], freqs: Float32Array, magDb: Float32Array, offsetDb = 0): void {
  const f = new Float32Array(freqs);
  const mag = new Float32Array(f.length);
  const phase = new Float32Array(f.length);
  magDb.fill(offsetDb);
  for (const filter of filters) {
    filter.getFrequencyResponse(f, mag, phase);
    for (let i = 0; i < magDb.length; i++) magDb[i] = (magDb[i] ?? 0) + 20 * Math.log10(Math.max(1e-6, mag[i] ?? 0));
  }
}
