// Vu-mètre stéréo sur canvas : échelle en dB (-60 à +6), maintien de crête, témoin de saturation
// qui reste allumé jusqu'au clic. Les niveaux sont des crêtes linéaires (1 = 0 dBFS).

import { h, jeton, preparerCanvas } from '../dom';

export const DB_MIN = -60;
export const DB_MAX = 6;

/** Crête linéaire -> hauteur relative 0..1 sur l'échelle du vu-mètre. */
export function hauteurDb(niveau: number): number {
  if (niveau <= 0) return 0;
  const db = 20 * Math.log10(niveau);
  return Math.min(1, Math.max(0, (db - DB_MIN) / (DB_MAX - DB_MIN)));
}

export interface VuMetre {
  readonly el: HTMLElement;
  /** gauche, droite, crête maintenue (linéaires). */
  maj(gauche: number, droite: number, crete: number): void;
  reinitialiser(): void;
}

export function vuMetre(o: { libelle: string; hauteur?: number; largeur?: number } = { libelle: 'Niveau' }): VuMetre {
  const hauteur = o.hauteur ?? 140;
  const largeur = o.largeur ?? 14;
  const canvas = h('canvas', { class: 'vm-canvas', 'aria-hidden': 'true' });
  const sature = h('button', { type: 'button', class: 'vm-sature', 'aria-label': 'Saturation : cliquer pour effacer', 'data-bulle': 'Saturation (cliquer pour effacer)', hidden: true });
  const el = h('div', { class: 'vu-metre', role: 'meter', 'aria-label': o.libelle, 'aria-valuemin': DB_MIN, 'aria-valuemax': DB_MAX }, sature, canvas);
  let couleurs: { fond: string; ok: string; haut: string; sat: string; crete: string } | null = null;
  let crete = 0;
  let dernierAria = 0;

  const dessiner = (g: number, d: number) => {
    const ctx = preparerCanvas(canvas, largeur, hauteur);
    couleurs ??= { fond: jeton('fond'), ok: jeton('accent'), haut: jeton('lecture'), sat: jeton('alerte'), crete: jeton('texte') };
    const c = couleurs;
    ctx.fillStyle = c.fond;
    ctx.fillRect(0, 0, largeur, hauteur);
    const barre = (largeur - 3) / 2;
    const y0db = hauteur * (1 - hauteurDb(1));
    const ym6 = hauteur * (1 - hauteurDb(Math.pow(10, -6 / 20)));
    const peindre = (x: number, niveau: number) => {
      const y = hauteur * (1 - hauteurDb(niveau));
      if (y >= hauteur) return;
      // Trois zones : sous -6 dB, de -6 à 0 dB, au-dessus de 0 dB.
      ctx.fillStyle = c.ok;
      ctx.fillRect(x, Math.max(y, ym6), barre, hauteur - Math.max(y, ym6));
      if (y < ym6) { ctx.fillStyle = c.haut; ctx.fillRect(x, Math.max(y, y0db), barre, ym6 - Math.max(y, y0db)); }
      if (y < y0db) { ctx.fillStyle = c.sat; ctx.fillRect(x, y, barre, y0db - y); }
    };
    peindre(1, g);
    peindre(2 + barre, d);
    // Repère 0 dB.
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(0, Math.round(y0db), largeur, 1);
    if (crete > 0) {
      const yc = hauteur * (1 - hauteurDb(crete));
      ctx.fillStyle = crete > 1 ? c.sat : c.crete;
      ctx.fillRect(1, Math.round(yc), largeur - 2, 1.5);
    }
  };

  sature.addEventListener('click', () => { sature.hidden = true; });
  dessiner(0, 0);
  return {
    el,
    maj(g, d, c) {
      crete = c;
      if (g > 1 || d > 1) sature.hidden = false;
      dessiner(g, d);
      const t = performance.now();
      if (t - dernierAria > 500) {
        dernierAria = t;
        const db = Math.max(g, d) > 0 ? Math.max(DB_MIN, 20 * Math.log10(Math.max(g, d))) : DB_MIN;
        el.setAttribute('aria-valuenow', db.toFixed(0));
      }
    },
    reinitialiser() { crete = 0; sature.hidden = true; dessiner(0, 0); },
  };
}
