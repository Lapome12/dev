// Console (étape 2.6) : 13 tranches (maître + 12) avec vu-mètre stéréo, fader, pan, muet, solo,
// nom et couleur ; 8 emplacements d'effet par tranche (ajouter, glisser pour réordonner, bypass,
// mix, remplacer, supprimer) ; spectre sur le maître.

import { newEffect } from '../../project/defaults';
import type { EffectType, Id, MixerTrack } from '../../project/types';
import { listPlugins } from '../../engine/params';
import { aide } from '../aide';
import { demanderTexte } from '../components/dialog';
import { fader } from '../components/fader';
import { boutonRotatif } from '../components/knob';
import { ouvrirMenu, type ElementMenu } from '../components/menu';
import { vuMetre, type VuMetre } from '../components/meter';
import { interrupteur } from '../components/toggle';
import { formaterPan, formaterVolume, volumeDepuisNorme, volumeVersNorme } from '../components/valeur';
import type { Contexte } from '../contexte';
import { borner, h, jeton, preparerCanvas } from '../dom';
import { finGeste } from '../geste';
import { definition } from './plugin-window';

export const EMPLACEMENTS = 8;

/** Effets proposés : ceux que le moteur sait jouer. */
export const effetsDisponibles = () => listPlugins().filter(p => p.kind === 'effet');

interface Tranche { el: HTMLElement; maj(t: MixerTrack, canaux: string[]): void; metre: VuMetre }

export function vueConsole(ctx: Contexte): HTMLElement {
  const { store, moteur } = ctx;
  const majPiste = (i: number, label: string, f: (t: MixerTrack) => void, merge = false) =>
    store.update(label, d => { const t = d.mixer[i]; if (t) f(t); }, merge ? { merge: true } : undefined);

  // ---------- Effets ----------
  const menuEffets = (titre: string, choisir: (type: EffectType) => void): ElementMenu[] => {
    const effets = effetsDisponibles();
    if (!effets.length) return [{ titre: 'Les effets arrivent bientôt' }];
    return [{ titre }, ...effets.map(e => ({ texte: e.name, action: () => choisir(e.type as EffectType) }))];
  };
  const ajouterEffet = (piste: number, place: number, type: EffectType) => {
    const slot = newEffect(type);
    majPiste(piste, `Ajouter ${definition(type)?.name ?? 'un effet'}`, t => { t.effects.splice(Math.min(place, t.effects.length), 0, slot); });
    ctx.actions.ouvrirEffet(piste, slot.id);
  };
  const deplacerEffet = (piste: number, de: number, vers: number) => {
    if (de === vers) return;
    majPiste(piste, 'Réordonner les effets', t => { const [s] = t.effects.splice(de, 1); if (s) t.effects.splice(borner(vers, 0, t.effects.length), 0, s); });
  };
  const menuSlot = (piste: number, slotId: Id, pos: { x: number; y: number } | HTMLElement) => {
    const t = store.get().mixer[piste];
    const i = t?.effects.findIndex(s => s.id === slotId) ?? -1;
    const s = t?.effects[i];
    if (!t || !s) return;
    ouvrirMenu([
      { texte: 'Ouvrir', action: () => ctx.actions.ouvrirEffet(piste, slotId) },
      { texte: s.bypass ? 'Activer' : 'Contourner (bypass)', action: () => majPiste(piste, s.bypass ? 'Activer l\'effet' : 'Contourner l\'effet', x => { const z = x.effects.find(e => e.id === slotId); if (z) z.bypass = !z.bypass; }) },
      { texte: 'Monter', desactive: i === 0, action: () => deplacerEffet(piste, i, i - 1) },
      { texte: 'Descendre', desactive: i === t.effects.length - 1, action: () => deplacerEffet(piste, i, i + 1) },
      { separateur: true },
      ...menuEffets('Remplacer par', type => {
        const neuf = newEffect(type);
        majPiste(piste, 'Remplacer l\'effet', x => { const k = x.effects.findIndex(e => e.id === slotId); if (k >= 0) x.effects[k] = neuf; });
      }),
      { separateur: true },
      { texte: 'Supprimer', danger: true, action: () => majPiste(piste, 'Supprimer l\'effet', x => { x.effects = x.effects.filter(e => e.id !== slotId); }) },
    ], pos, 'Effet');
  };

  // ---------- Une tranche ----------
  const creerTranche = (i: number): Tranche => {
    const maitre = i === 0;
    const nom = h('button', { type: 'button', class: 'cs-nom' });
    aide(nom, maitre ? 'Maître : tout le son passe par ici avant de sortir.' : 'Double-clic : renommer la tranche.');
    nom.addEventListener('dblclick', async () => {
      const t = store.get().mixer[i];
      const n = t && await demanderTexte('Renommer la tranche', 'Nom de la tranche', t.name);
      if (n) majPiste(i, 'Renommer la tranche', x => { x.name = n; });
    });
    const numero = h('span', { class: 'cs-numero mono', 'aria-hidden': 'true' }, maitre ? 'M' : String(i));
    const sources = h('span', { class: 'cs-sources doux' });

    // Emplacements d'effet
    const slots = h('ol', { class: 'cs-slots', 'aria-label': `Effets de la tranche ${maitre ? 'maître' : i}` });
    let glisse: { de: number; el: HTMLElement } | null = null;
    slots.addEventListener('pointerup', () => { glisse = null; slots.classList.remove('glisse'); });

    const metre = vuMetre({ libelle: `Niveau ${maitre ? 'du maître' : `de la tranche ${i}`}`, hauteur: 150, largeur: 14 });
    const fd = fader({
      libelle: 'Volume', min: 0, max: 1.25, defaut: 1, valeur: 1, reperes: [1], versNorme: volumeVersNorme, depuisNorme: volumeDepuisNorme, format: formaterVolume, course: 180,
      aide: 'volume de la tranche. Double-clic : 0 dB.',
      surEntree: v => majPiste(i, 'Changer le volume', t => { t.volume = v; }, true), surFin: () => finGeste(store),
    });
    fd.el.classList.add('cs-fader');
    const pan = boutonRotatif({ libelle: 'Pan', min: -1, max: 1, step: 0.01, defaut: 0, valeur: 0, bipolaire: true, taille: 'petit', sansEtiquette: true, format: formaterPan, aide: 'place la tranche à gauche ou à droite.',
      surEntree: v => majPiste(i, 'Changer le pan', t => { t.pan = v; }, true), surFin: () => finGeste(store) });
    const mute = interrupteur({ libelle: 'Muet', texte: 'M', variante: 'mute', actif: false, aide: 'Coupe la tranche.', surChange: a => majPiste(i, a ? 'Couper une tranche' : 'Rétablir une tranche', t => { t.mute = a; }) });
    const solo = interrupteur({ libelle: 'Solo', texte: 'S', variante: 'solo', actif: false, aide: 'N\'écoute que les tranches en solo.', surChange: a => majPiste(i, 'Solo de tranche', t => { t.solo = a; }) });
    const valeurVol = h('span', { class: 'cs-db mono' });

    const spectre = maitre ? h('canvas', { class: 'cs-spectre', 'aria-hidden': 'true' }) : null;
    const el = h('section', { class: maitre ? 'tranche maitre' : 'tranche', 'aria-label': maitre ? 'Maître' : `Tranche ${i}` },
      h('header', { class: 'cs-entete' }, numero, nom),
      spectre ? h('div', { class: 'cs-spectre-boite', 'data-aide': 'Spectre du son de sortie : graves à gauche, aigus à droite.' }, spectre) : sources,
      slots,
      h('div', { class: 'cs-pan' }, pan.el, h('div', { class: 'cs-ms' }, mute.el, solo.el)),
      h('div', { class: 'cs-niveaux' }, metre.el, fd.el),
      valeurVol);

    const majSlots = (t: MixerTrack) => {
      slots.replaceChildren();
      for (let k = 0; k < EMPLACEMENTS; k++) {
        const s = t.effects[k];
        if (!s) {
          const vide = h('button', { type: 'button', class: 'cs-slot vide', 'aria-label': `Ajouter un effet (emplacement ${k + 1})`, 'data-aide': 'Emplacement libre : cliquer pour ajouter un effet.' }, h('span', { 'aria-hidden': 'true' }, '+'));
          vide.addEventListener('click', () => ouvrirMenu(menuEffets('Ajouter un effet', type => ajouterEffet(i, k, type)), vide, 'Ajouter un effet'));
          vide.addEventListener('pointerup', () => { if (glisse) deplacerEffet(i, glisse.de, t.effects.length - 1); });
          slots.appendChild(h('li', null, vide));
          continue;
        }
        const d = definition(s.type);
        const temoin = h('button', { type: 'button', class: 'cs-temoin', 'aria-label': `${s.bypass ? 'Activer' : 'Contourner'} ${d?.name ?? s.type}`, 'aria-pressed': String(!s.bypass), 'data-bulle': s.bypass ? 'Contourné (cliquer pour activer)' : 'Actif (cliquer pour contourner)' });
        temoin.addEventListener('click', () => majPiste(i, s.bypass ? 'Activer l\'effet' : 'Contourner l\'effet', x => { const z = x.effects.find(e => e.id === s.id); if (z) z.bypass = !z.bypass; }));
        const b = h('button', { type: 'button', class: 'cs-slot-nom', 'data-aide': 'Clic : ouvrir. Glisser : réordonner. Clic droit : plus d\'actions.' }, d?.name ?? s.type);
        b.addEventListener('click', () => { if (!glisse) ctx.actions.ouvrirEffet(i, s.id); });
        b.addEventListener('contextmenu', e => { e.preventDefault(); menuSlot(i, s.id, { x: e.clientX, y: e.clientY }); });
        b.addEventListener('keydown', e => {
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); menuSlot(i, s.id, b); }
          else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); deplacerEffet(i, k, k + (e.key === 'ArrowUp' ? -1 : 1)); }
        });
        const li = h('li', { class: s.bypass ? 'cs-slot plein contourne' : 'cs-slot plein' }, temoin, b);
        b.addEventListener('pointerdown', e => { if (e.button === 0) { glisse = { de: k, el: li }; } });
        li.addEventListener('pointerenter', () => { if (glisse && glisse.de !== k) slots.classList.add('glisse'); });
        li.addEventListener('pointerup', e => { if (glisse && glisse.de !== k) { e.stopPropagation(); const de = glisse.de; glisse = null; slots.classList.remove('glisse'); deplacerEffet(i, de, k); } });
        slots.appendChild(li);
      }
    };

    let cle = '';
    return {
      el, metre,
      maj(t, canaux) {
        nom.textContent = t.name;
        el.style.setProperty('--couleur', t.color);
        el.classList.toggle('muet', t.mute);
        fd.definir(t.volume);
        pan.definir(t.pan);
        mute.definir(t.mute);
        solo.definir(t.solo);
        valeurVol.textContent = formaterVolume(t.volume);
        sources.textContent = canaux.length ? canaux.join(', ') : '—';
        sources.title = canaux.length ? `Reçoit : ${canaux.join(', ')}` : 'Aucun canal';
        const k = JSON.stringify(t.effects.map(e => [e.id, e.type, e.bypass]));
        if (k !== cle) { cle = k; majSlots(t); }
      },
    };
  };

  const rangee = h('div', { class: 'cs-rangee' });
  const el = h('section', { class: 'vue vue-console', id: 'vue-console', role: 'tabpanel', 'aria-labelledby': 'onglet-console' },
    h('div', { class: 'barre-vue' }, h('span', { class: 'doux' }, 'Chaque canal du Rack part vers une tranche (son numéro dans le Rack). Chaque tranche passe par ses effets, de haut en bas, puis va au maître.')),
    h('div', { class: 'cs-defilement' }, rangee));
  const tranches: Tranche[] = [];
  const rendre = () => {
    const p = store.get();
    p.mixer.forEach((t, i) => {
      let tr = tranches[i];
      if (!tr) { tr = creerTranche(i); tranches[i] = tr; rangee.appendChild(tr.el); }
      tr.maj(t, p.channels.filter(c => c.mixerTrack === i).map(c => c.name));
    });
  };
  store.subscribe(rendre);
  rendre();

  // ---------- Vu-mètres et spectre ----------
  const spectre = new Float32Array(1024);
  const boucle = () => {
    if (!el.hidden && el.isConnected) {
      for (const l of moteur.levels()) tranches[l.track]?.metre.maj(l.left, l.right, l.peakHold);
      const c = tranches[0]?.el.querySelector('canvas.cs-spectre') as HTMLCanvasElement | null;
      if (c && moteur.spectrum) {
        moteur.spectrum(0, spectre);
        const L = c.parentElement?.clientWidth ?? 120; const H = 54;
        const g = preparerCanvas(c, L, H);
        g.fillStyle = '#121419'; g.fillRect(0, 0, L, H);
        const bandes = 28;
        g.fillStyle = jeton('accent');
        for (let b = 0; b < bandes; b++) {
          const f0 = 20 * Math.pow(1000, b / bandes); const f1 = 20 * Math.pow(1000, (b + 1) / bandes);
          const i0 = Math.max(1, Math.floor((f0 / 24000) * spectre.length)); const i1 = Math.max(i0 + 1, Math.floor((f1 / 24000) * spectre.length));
          let m = -120;
          for (let k = i0; k < i1 && k < spectre.length; k++) m = Math.max(m, spectre[k] ?? -120);
          const hh = borner((m + 90) / 80, 0, 1) * (H - 2);
          g.globalAlpha = 0.85;
          g.fillRect((b * L) / bandes + 0.5, H - hh, L / bandes - 1.5, hh);
        }
        g.globalAlpha = 1;
      }
    }
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
  return el;
}
