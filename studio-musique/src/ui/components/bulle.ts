// Info-bulles : tout élément portant data-bulle montre son texte après un court survol ou au focus
// clavier. Le texte d'aide détaillé (data-aide) va, lui, dans la barre d'aide.

import { h } from '../dom';

let installe = false;

export function installerBulles(): void {
  if (installe) return;
  installe = true;
  const bulle = h('div', { class: 'bulle', role: 'tooltip', hidden: true });
  document.body.appendChild(bulle);
  let minuteur = 0;
  let cible: Element | null = null;

  const montrer = (el: Element) => {
    const texte = el.getAttribute('data-bulle');
    if (!texte) return;
    bulle.textContent = texte;
    bulle.hidden = false;
    const r = el.getBoundingClientRect();
    const b = bulle.getBoundingClientRect();
    let x = r.left + r.width / 2 - b.width / 2;
    let y = r.bottom + 6;
    x = Math.max(4, Math.min(x, window.innerWidth - b.width - 4));
    if (y + b.height > window.innerHeight - 4) y = r.top - b.height - 6;
    bulle.style.left = `${x}px`;
    bulle.style.top = `${y}px`;
  };
  const cacher = () => { clearTimeout(minuteur); cible = null; bulle.hidden = true; };

  document.addEventListener('pointerover', e => {
    const el = e.target instanceof Element ? e.target.closest('[data-bulle]') : null;
    if (el === cible) return;
    cacher();
    if (!el) return;
    cible = el;
    minuteur = window.setTimeout(() => montrer(el), 550);
  });
  document.addEventListener('focusin', e => {
    cacher();
    const el = e.target instanceof Element ? e.target.closest('[data-bulle]') : null;
    if (el && el.matches(':focus-visible')) { cible = el; montrer(el); }
  });
  document.addEventListener('pointerdown', cacher, true);
  document.addEventListener('focusout', cacher);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cacher(); });
}
