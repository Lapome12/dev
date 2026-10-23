// Messages courts en bas à droite, lus par les lecteurs d'écran (aria-live).

import { h } from '../dom';

let zone: HTMLElement | null = null;

export function toast(texte: string, ton: 'info' | 'ok' | 'alerte' = 'info', dureeMs = 3500): void {
  if (!zone || !zone.isConnected) {
    zone = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(zone);
  }
  const el = h('div', { class: `toast ${ton}` }, texte);
  zone.appendChild(el);
  while (zone.childElementCount > 4) zone.firstElementChild?.remove();
  setTimeout(() => { el.classList.add('sortie'); setTimeout(() => el.remove(), 200); }, dureeMs);
}
