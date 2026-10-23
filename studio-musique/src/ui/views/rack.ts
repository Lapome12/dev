// Rack et séquenceur pas à pas (étape 2.3) : une ligne par canal (déplacer, muet, solo, pan,
// volume, tranche de console, nom, 16/32/64 pas), patterns (créer, renommer, dupliquer,
// supprimer, longueur), ajout de canal, tête de lecture sur les pas.

import { colorAt, newChannel, newPattern } from '../../project/defaults';
import type { Channel, Id, InstrumentType, Pattern, Project } from '../../project/types';
import { aide, aideTemporaire } from '../aide';
import { bouton } from '../components/button';
import { confirmer, demanderTexte } from '../components/dialog';
import { boutonRotatif } from '../components/knob';
import { boutonMenu, ouvrirMenu } from '../components/menu';
import { champNombre } from '../components/number';
import { liste } from '../components/select';
import { interrupteur } from '../components/toggle';
import { formaterPan, formaterVolume } from '../components/valeur';
import type { Contexte } from '../contexte';
import { borner, h } from '../dom';
import { finGeste } from '../geste';
import { suivrePattern } from '../lecture';
import { ajouterEffetPreset, changerInstrument, glisseEnCours, lireGlisse } from '../presets-glisses';
import { copierPattern, definirPas, nombrePas, nomLibre, notesDuPas, nouvelId, TICKS_PAS, velocitesParPas } from '../notes';

export const INSTRUMENTS: { type: InstrumentType; nom: string; description: string }[] = [
  { type: 'trio', nom: 'Trio', description: 'Synthé à 3 oscillateurs : basses, leads, nappes.' },
  { type: 'prisme', nom: 'Prisme', description: 'Synthé FM à 4 opérateurs : cloches, pianos électriques.' },
  { type: 'frappe', nom: 'Frappe', description: 'Boîte à rythmes synthétisée, 10 voix.' },
  { type: 'corde', nom: 'Corde', description: 'Cordes pincées : guitare, harpe, pizzicato.' },
  { type: 'echantillon', nom: 'Échantillon', description: 'Joue vos propres sons (.wav, .mp3).' },
];

const pattern = (p: Readonly<Project>, id: Id): Pattern | undefined => p.patterns.find(pt => pt.id === id);

/** Première tranche de console (1..12) que n'utilise aucun canal, sinon le maître. */
export function trancheLibre(p: Readonly<Project>): number {
  for (let i = 1; i <= 12; i++) if (!p.channels.some(c => c.mixerTrack === i)) return i;
  return 0;
}

/** Ajoute un canal (avec preset éventuel) et le sélectionne. */
export function ajouterCanal(ctx: Contexte, type: InstrumentType, presetId?: string): Id {
  const c = newChannel(type, presetId);
  ctx.store.update('Ajouter un canal', d => {
    c.color = colorAt(d.channels.length);
    c.mixerTrack = trancheLibre(d);
    const t = d.mixer[c.mixerTrack];
    if (t && c.mixerTrack > 0) { t.name = c.name; t.color = c.color; }
    d.channels.push(c);
  });
  ctx.ui.set({ canalId: c.id });
  return c.id;
}

interface Ligne {
  readonly el: HTMLElement;
  readonly pas: HTMLButtonElement[];
  maj(c: Channel, pt: Pattern | undefined, nbPas: number, selection: boolean): void;
}

export function vueRack(ctx: Contexte): HTMLElement {
  const { store, ui } = ctx;
  const lignes = new Map<Id, Ligne>();
  let ordre: Id[] = [];
  let focus = { ligne: 0, pas: 0 };
  let colonne = -1;

  // ---------- En-tête : patterns ----------
  const choixPattern = liste({ libelle: 'Pattern courant', options: [], valeur: '', aide: 'le pattern que le Rack et le piano roll modifient.', surChange: v => { ui.set({ patternId: v }); suivrePattern(ctx); } });
  const pastille = h('span', { class: 'pastille-couleur', 'aria-hidden': 'true' });
  const nouveauPattern = () => {
    const p = store.get();
    const pt = newPattern(nomLibre('Pattern', p.patterns.map(x => x.name)), colorAt(p.patterns.length));
    const courant = pattern(p, ui.get().patternId);
    if (courant) pt.lengthTicks = courant.lengthTicks;
    store.update('Créer un pattern', d => { d.patterns.push(pt); });
    ui.set({ patternId: pt.id });
    suivrePattern(ctx);
  };
  const renommerPattern = async () => {
    const pt = pattern(store.get(), ui.get().patternId);
    if (!pt) return;
    const nom = await demanderTexte('Renommer le pattern', 'Nom du pattern', pt.name);
    if (nom) store.update('Renommer le pattern', d => { const x = pattern(d, pt.id); if (x) x.name = nom; });
  };
  const dupliquerPattern = () => {
    const p = store.get();
    const pt = pattern(p, ui.get().patternId);
    if (!pt) return;
    const copie = copierPattern(pt, nouvelId(), nomLibre(`${pt.name} copie`.replace(/ copie( \d+)?$/, ' copie'), p.patterns.map(x => x.name)));
    copie.color = colorAt(p.patterns.length);
    store.update('Dupliquer le pattern', d => { d.patterns.splice(d.patterns.findIndex(x => x.id === pt.id) + 1, 0, copie); });
    ui.set({ patternId: copie.id });
    suivrePattern(ctx);
  };
  const supprimerPattern = async () => {
    const p = store.get();
    const pt = pattern(p, ui.get().patternId);
    if (!pt || p.patterns.length <= 1) return;
    const clips = p.arrangement.clips.filter(c => c.patternId === pt.id).length;
    const ok = await confirmer(`Supprimer « ${pt.name} » ?`, clips ? `Ses ${clips} clip${clips > 1 ? 's' : ''} dans l'arrangement disparaîtront aussi. Ctrl+Z pour revenir en arrière.` : 'Ctrl+Z pour revenir en arrière.', 'Supprimer', true);
    if (!ok) return;
    const i = p.patterns.findIndex(x => x.id === pt.id);
    store.update('Supprimer le pattern', d => {
      d.patterns = d.patterns.filter(x => x.id !== pt.id);
      d.arrangement.clips = d.arrangement.clips.filter(c => c.patternId !== pt.id);
    });
    const reste = store.get().patterns;
    ui.set({ patternId: (reste[Math.min(i, reste.length - 1)] ?? reste[0])?.id ?? '' });
  };
  const btnSupprimerPattern = bouton({ icone: 'corbeille', libelle: 'Supprimer le pattern', variante: 'discret', surClic: () => void supprimerPattern() });
  const choixLongueur = liste({
    libelle: 'Nombre de pas', valeur: '16',
    options: [{ value: '16', label: '16 pas' }, { value: '32', label: '32 pas' }, { value: '64', label: '64 pas' }],
    aide: '16 pas = 1 mesure. Change la longueur du pattern.',
    surChange: v => store.update('Changer la longueur du pattern', d => { const pt = pattern(d, ui.get().patternId); if (pt) pt.lengthTicks = Number(v) * TICKS_PAS; }),
  });
  const btnAjouter = boutonMenu(bouton({ texte: 'Canal', icone: 'plus', aide: 'Ajoute un canal avec l\'instrument de votre choix.' }),
    () => [{ titre: 'Instrument' }, ...INSTRUMENTS.map(i => ({ texte: `${i.nom} : ${i.description}`, action: () => { ajouterCanal(ctx, i.type); } }))], 'Ajouter un canal');

  const entete = h('div', { class: 'rk-entete barre-vue' },
    h('div', { class: 'rk-patterns' }, pastille, choixPattern.el,
      bouton({ icone: 'plus', libelle: 'Nouveau pattern', variante: 'discret', surClic: nouveauPattern }),
      bouton({ icone: 'crayon', libelle: 'Renommer le pattern', variante: 'discret', surClic: () => void renommerPattern() }),
      bouton({ icone: 'dupliquer', libelle: 'Dupliquer le pattern', variante: 'discret', surClic: dupliquerPattern }),
      btnSupprimerPattern),
    choixLongueur.el,
    h('span', { class: 'espace' }),
    btnAjouter);

  const corps = h('div', { class: 'rk-lignes', role: 'grid', 'aria-label': 'Séquenceur pas à pas' });
  const indicateur = h('div', { class: 'rk-indicateur', hidden: true, 'aria-hidden': 'true' });
  const vide = h('p', { class: 'rk-vide doux', hidden: true }, 'Aucun canal. Ajoutez-en un avec le bouton « Canal ».');
  const defilement = h('div', { class: 'rk-defilement' }, corps, indicateur, vide);
  defilement.addEventListener('dragover', e => { if (glisseEnCours(e)) e.preventDefault(); });
  defilement.addEventListener('drop', e => {
    const g = lireGlisse(e);
    if (g?.kind !== 'instrument') return;
    e.preventDefault();
    ajouterCanal(ctx, g.type as InstrumentType, g.presetId);
  });
  const el = h('section', { class: 'vue vue-rack', id: 'vue-rack', role: 'tabpanel', 'aria-labelledby': 'onglet-rack' }, entete, defilement);

  // ---------- Peinture des pas et vélocité ----------
  let peinture: { allume: boolean } | null = null;
  let velocite: { canalId: Id; pas: number; y: number; depart: number } | null = null;

  const appliquerPas = (canalId: Id, pas: number, allume: boolean) => {
    const p = store.get();
    const c = p.channels.find(x => x.id === canalId);
    const pt = pattern(p, ui.get().patternId);
    if (!c || !pt) return;
    if (notesDuPas(pt.notes[canalId], pas).length > 0 === allume) return;
    store.update('Dessiner des pas', d => { const x = pattern(d, pt.id); if (x) definirPas(x, canalId, pas, allume, c.rootPitch); }, { merge: true });
    if (allume) { ctx.moteur.noteOn(canalId, c.rootPitch, 0.8); setTimeout(() => ctx.moteur.noteOff(canalId, c.rootPitch), 120); }
  };
  const lirePas = (cible: EventTarget | null): { canalId: Id; pas: number } | null => {
    const b = cible instanceof Element ? cible.closest<HTMLElement>('.rk-pas-btn') : null;
    if (!b || !corps.contains(b)) return null;
    return { canalId: b.dataset['canal'] ?? '', pas: Number(b.dataset['pas']) };
  };

  corps.addEventListener('pointerdown', e => {
    const cible = lirePas(e.target);
    if (!cible) return;
    e.preventDefault();
    const pt = pattern(store.get(), ui.get().patternId);
    const allume = notesDuPas(pt?.notes[cible.canalId], cible.pas).length > 0;
    if (e.button === 2) {
      if (!allume) return;
      const n = notesDuPas(pt?.notes[cible.canalId], cible.pas)[0];
      velocite = { ...cible, y: e.clientY, depart: n?.velocity ?? 0.8 };
      return;
    }
    if (e.button !== 0) return;
    peinture = { allume: !allume };
    appliquerPas(cible.canalId, cible.pas, peinture.allume);
    focus = { ligne: ordre.indexOf(cible.canalId), pas: cible.pas };
    majFocus(false);
  });
  window.addEventListener('pointermove', e => {
    if (peinture) {
      const cible = lirePas(document.elementFromPoint(e.clientX, e.clientY));
      if (cible) appliquerPas(cible.canalId, cible.pas, peinture.allume);
    } else if (velocite) {
      const v = borner(velocite.depart + (velocite.y - e.clientY) / 120, 0.05, 1);
      const { canalId, pas } = velocite;
      store.update('Changer la vélocité', d => {
        const pt = pattern(d, ui.get().patternId);
        for (const n of notesDuPas(pt?.notes[canalId], pas)) n.velocity = v;
      }, { merge: true });
      aideTemporaire(`Vélocité : ${Math.round(v * 100)} %`);
    }
  });
  window.addEventListener('pointerup', () => {
    if (peinture || velocite) { peinture = null; velocite = null; aideTemporaire(null); finGeste(store); }
  });
  corps.addEventListener('contextmenu', e => { if (lirePas(e.target)) e.preventDefault(); });
  // Clavier : Entrée bascule (l'Espace reste la lecture), flèches pour se déplacer.
  corps.addEventListener('click', e => {
    if (e.detail !== 0) return;
    const cible = lirePas(e.target);
    if (!cible) return;
    const pt = pattern(store.get(), ui.get().patternId);
    appliquerPas(cible.canalId, cible.pas, !(notesDuPas(pt?.notes[cible.canalId], cible.pas).length > 0));
    finGeste(store);
  });
  corps.addEventListener('keydown', e => {
    if (!lirePas(e.target)) return;
    const nb = nombrePas(pattern(store.get(), ui.get().patternId) ?? { lengthTicks: 384 } as Pattern);
    const d = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key];
    if (d && !e.altKey) {
      e.preventDefault();
      focus = { ligne: borner(focus.ligne + (d[0] ?? 0), 0, ordre.length - 1), pas: borner(focus.pas + (d[1] ?? 0), 0, nb - 1) };
      majFocus(true);
    } else if (e.key === 'Home') { e.preventDefault(); focus.pas = 0; majFocus(true); }
    else if (e.key === 'End') { e.preventDefault(); focus.pas = nb - 1; majFocus(true); }
  });

  const majFocus = (donner: boolean) => {
    for (const [i, id] of ordre.entries()) {
      const l = lignes.get(id);
      if (!l) continue;
      for (const [j, b] of l.pas.entries()) b.tabIndex = i === focus.ligne && j === focus.pas ? 0 : -1;
    }
    if (donner) lignes.get(ordre[focus.ligne] ?? '')?.pas[focus.pas]?.focus();
  };

  // ---------- Réordonner ----------
  const deplacerCanal = (id: Id, vers: number) => {
    const p = store.get();
    const de = p.channels.findIndex(c => c.id === id);
    const cible = borner(vers, 0, p.channels.length - 1);
    if (de < 0 || de === cible) return;
    store.update('Réordonner les canaux', d => {
      const [c] = d.channels.splice(de, 1);
      if (c) d.channels.splice(cible, 0, c);
    });
  };
  const glisserLigne = (id: Id, e: PointerEvent, poignee: HTMLElement) => {
    e.preventDefault();
    poignee.setPointerCapture(e.pointerId);
    let vers = ordre.indexOf(id);
    const bouger = (ev: PointerEvent) => {
      const rects = ordre.map(x => lignes.get(x)?.el.getBoundingClientRect()).filter((r): r is DOMRect => !!r);
      let i = rects.findIndex(r => ev.clientY < r.top + r.height / 2);
      if (i < 0) i = rects.length;
      const ref = rects[Math.min(i, rects.length - 1)];
      const base = defilement.getBoundingClientRect();
      if (ref) {
        indicateur.hidden = false;
        indicateur.style.top = `${(i >= rects.length ? ref.bottom : ref.top) - base.top + defilement.scrollTop - 1}px`;
      }
      const de = ordre.indexOf(id);
      vers = i > de ? i - 1 : i;
    };
    const finir = () => {
      poignee.removeEventListener('pointermove', bouger);
      indicateur.hidden = true;
      deplacerCanal(id, vers);
    };
    poignee.addEventListener('pointermove', bouger);
    poignee.addEventListener('pointerup', finir, { once: true });
    poignee.addEventListener('pointercancel', () => { poignee.removeEventListener('pointermove', bouger); indicateur.hidden = true; }, { once: true });
  };

  // ---------- Actions sur un canal ----------
  const majCanal = (id: Id, label: string, f: (c: Channel) => void, merge = false) =>
    store.update(label, d => { const c = d.channels.find(x => x.id === id); if (c) f(c); }, merge ? { merge: true } : undefined);
  const renommerCanal = async (id: Id) => {
    const c = store.get().channels.find(x => x.id === id);
    if (!c) return;
    const nom = await demanderTexte('Renommer le canal', 'Nom du canal', c.name);
    if (nom) majCanal(id, 'Renommer le canal', x => { x.name = nom; });
  };
  const dupliquerCanal = (id: Id) => {
    const p = store.get();
    const c = p.channels.find(x => x.id === id);
    if (!c) return;
    const copie: Channel = { ...structuredClone(c), id: nouvelId(), name: nomLibre(c.name.replace(/ \d+$/, ''), p.channels.map(x => x.name)), color: colorAt(p.channels.length) };
    store.update('Dupliquer le canal', d => {
      d.channels.splice(d.channels.findIndex(x => x.id === id) + 1, 0, copie);
      for (const pt of d.patterns) { const n = pt.notes[id]; if (n) pt.notes[copie.id] = n.map(x => ({ ...x, id: nouvelId() })); }
    });
    ui.set({ canalId: copie.id });
  };
  const supprimerCanal = async (id: Id) => {
    const c = store.get().channels.find(x => x.id === id);
    if (!c) return;
    if (!await confirmer(`Supprimer « ${c.name} » ?`, 'Ses notes dans tous les patterns seront supprimées. Ctrl+Z pour revenir en arrière.', 'Supprimer', true)) return;
    store.update('Supprimer le canal', d => {
      d.channels = d.channels.filter(x => x.id !== id);
      for (const pt of d.patterns) delete pt.notes[id];
    });
  };
  const menuCanal = (id: Id, pos: { x: number; y: number } | HTMLElement) => ouvrirMenu([
    { texte: 'Ouvrir l\'instrument', action: () => ctx.actions.ouvrirInstrument(id) },
    { texte: 'Ouvrir le piano roll', raccourci: 'Alt+2', action: () => ui.set({ canalId: id, vue: 'piano' }) },
    { separateur: true },
    { texte: 'Renommer…', action: () => void renommerCanal(id) },
    { texte: 'Dupliquer', action: () => dupliquerCanal(id) },
    { texte: 'Effacer les pas du pattern', action: () => store.update('Effacer les pas', d => { const pt = pattern(d, ui.get().patternId); if (pt) pt.notes[id] = []; }) },
    { separateur: true },
    { texte: 'Supprimer le canal', danger: true, action: () => void supprimerCanal(id) },
  ], pos, 'Canal');

  // ---------- Une ligne ----------
  const creerLigne = (c0: Channel): Ligne => {
    const id = c0.id;
    const poignee = h('button', { type: 'button', class: 'rk-poignee', 'aria-label': `Déplacer ${c0.name} (Alt+flèches)`, 'data-bulle': 'Glisser pour réordonner' });
    poignee.append(...[0, 1, 2].map(() => h('i')));
    poignee.addEventListener('pointerdown', e => glisserLigne(id, e, poignee));
    poignee.addEventListener('keydown', e => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      deplacerCanal(id, ordre.indexOf(id) + (e.key === 'ArrowUp' ? -1 : 1));
      requestAnimationFrame(() => lignes.get(id)?.el.querySelector<HTMLElement>('.rk-poignee')?.focus());
    });
    const mute = interrupteur({ libelle: `Muet : ${c0.name}`, texte: 'M', variante: 'mute', actif: c0.mute, aide: 'Coupe le son de ce canal.', surChange: a => majCanal(id, a ? 'Couper un canal' : 'Rétablir un canal', c => { c.mute = a; }) });
    const solo = interrupteur({ libelle: `Solo : ${c0.name}`, texte: 'S', variante: 'solo', actif: c0.solo, aide: 'N\'écoute que les canaux en solo.', surChange: a => majCanal(id, 'Solo', c => { c.solo = a; }) });
    const pan = boutonRotatif({ libelle: 'Pan', min: -1, max: 1, step: 0.01, defaut: 0, valeur: c0.pan, bipolaire: true, taille: 'mini', sansEtiquette: true, format: formaterPan, aide: 'place le son à gauche ou à droite.',
      surEntree: v => majCanal(id, 'Changer le pan', c => { c.pan = v; }, true), surFin: () => finGeste(store) });
    const volume = boutonRotatif({ libelle: 'Volume', min: 0, max: 1.25, step: 0.005, defaut: 0.8, valeur: c0.volume, taille: 'mini', sansEtiquette: true, format: formaterVolume, aide: 'volume du canal.',
      surEntree: v => majCanal(id, 'Changer le volume', c => { c.volume = v; }, true), surFin: () => finGeste(store) });
    const tranche = champNombre({ libelle: 'Tranche de console', min: 0, max: 12, step: 1, defaut: 0, valeur: c0.mixerTrack, largeur: 'etroit', course: 120,
      format: v => (v === 0 ? 'M' : String(v)), aide: 'tranche de la console qui reçoit ce canal (M = maître).',
      surEntree: v => majCanal(id, 'Changer la tranche', c => { c.mixerTrack = v; }, true), surFin: () => finGeste(store) });
    const nom = h('button', { type: 'button', class: 'rk-nom' }, h('span', { class: 'rk-nom-texte' }));
    aide(nom, 'Clic : sélectionner. Double-clic : ouvrir l\'instrument. Clic droit : plus d\'actions.');
    nom.addEventListener('click', () => ui.set({ canalId: id }));
    nom.addEventListener('dblclick', () => ctx.actions.ouvrirInstrument(id));
    nom.addEventListener('contextmenu', e => { e.preventDefault(); ui.set({ canalId: id }); menuCanal(id, { x: e.clientX, y: e.clientY }); });
    nom.addEventListener('keydown', e => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); menuCanal(id, nom); } });
    const zonePas = h('div', { class: 'rk-pas', role: 'row' });
    const pas: HTMLButtonElement[] = [];
    const el = h('div', { class: 'rk-ligne', 'data-canal': id }, poignee, mute.el, solo.el, pan.el, volume.el, tranche.el, nom, zonePas);
    let nbCourant = 0;
    let nomCourant = '';
    // Déposer un preset du navigateur : instrument = remplace celui du canal, effet = va sur sa tranche.
    el.addEventListener('dragover', e => { if (glisseEnCours(e)) { e.preventDefault(); e.stopPropagation(); el.classList.add('cible'); } });
    el.addEventListener('dragleave', () => el.classList.remove('cible'));
    el.addEventListener('drop', e => {
      el.classList.remove('cible');
      const g = lireGlisse(e);
      if (!g) return;
      e.preventDefault();
      e.stopPropagation();
      if (g.kind === 'instrument') { changerInstrument(ctx, id, g); ui.set({ canalId: id }); }
      else ajouterEffetPreset(ctx, store.get().channels.find(c => c.id === id)?.mixerTrack ?? 0, g);
    });

    return {
      el, pas,
      maj(c, pt, nb, selection) {
        el.classList.toggle('selection', selection);
        el.classList.toggle('muet', c.mute);
        el.style.setProperty('--couleur', c.color);
        nom.setAttribute('aria-current', String(selection));
        if (c.name !== nomCourant) {
          nomCourant = c.name;
          (nom.firstChild as HTMLElement).textContent = c.name;
          poignee.setAttribute('aria-label', `Déplacer ${c.name} (Alt+flèches)`);
          mute.el.setAttribute('aria-label', `Muet : ${c.name}`);
          solo.el.setAttribute('aria-label', `Solo : ${c.name}`);
          pan.el.setAttribute('aria-label', `Pan : ${c.name}`);
          volume.el.setAttribute('aria-label', `Volume : ${c.name}`);
          tranche.el.setAttribute('aria-label', `Tranche de console : ${c.name}`);
          nom.setAttribute('aria-label', `${c.name} (canal)`);
          for (const [i, b] of pas.entries()) b.setAttribute('aria-label', `${c.name}, pas ${i + 1}`);
        }
        mute.definir(c.mute);
        solo.definir(c.solo);
        pan.definir(c.pan);
        volume.definir(c.volume);
        tranche.definir(c.mixerTrack);
        if (nb !== nbCourant) {
          nbCourant = nb;
          zonePas.replaceChildren();
          pas.length = 0;
          for (let i = 0; i < nb; i++) {
            const b = h('button', { type: 'button', class: `rk-pas-btn${Math.floor(i / 4) % 2 ? ' alt' : ''}`, role: 'gridcell', 'data-canal': id, 'data-pas': i, 'aria-label': `${c.name}, pas ${i + 1}`, tabindex: -1 }, h('i', { class: 'rk-vel', 'aria-hidden': 'true' }));
            pas.push(b);
          }
          zonePas.append(...pas);
        }
        // Vélocité maximale par pas, en un seul passage sur les notes (rapide même avec des milliers de notes).
        const vel = velocitesParPas(pt?.notes[c.id], nb);
        for (const [i, b] of pas.entries()) {
          const v = vel[i] ?? 0;
          const on = v > 0;
          if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
          const t = v.toFixed(2);
          if (b.style.getPropertyValue('--vel') !== t) b.style.setProperty('--vel', t);
        }
      },
    };
  };

  // ---------- Rendu ----------
  const rendre = () => {
    const p = store.get();
    const u = ui.get();
    const pt = pattern(p, u.patternId);
    const nb = pt ? nombrePas(pt) : 16;
    choixPattern.options(p.patterns.map(x => ({ value: x.id, label: x.name })));
    choixPattern.definir(u.patternId);
    pastille.style.setProperty('--couleur', pt?.color ?? 'transparent');
    choixLongueur.definir(String(nb));
    corps.classList.toggle('pas-32', nb === 32);
    corps.classList.toggle('pas-64', nb === 64);
    btnSupprimerPattern.disabled = p.patterns.length <= 1;

    const ids = p.channels.map(c => c.id);
    for (const [id, l] of lignes) if (!ids.includes(id)) { l.el.remove(); lignes.delete(id); }
    for (const [i, c] of p.channels.entries()) {
      let l = lignes.get(c.id);
      if (!l) { l = creerLigne(c); lignes.set(c.id, l); }
      l.maj(c, pt, nb, c.id === u.canalId);
      if (corps.children[i] !== l.el) corps.insertBefore(l.el, corps.children[i] ?? null);
    }
    ordre = ids;
    vide.hidden = ids.length > 0;
    focus = { ligne: borner(focus.ligne, 0, Math.max(0, ids.length - 1)), pas: borner(focus.pas, 0, nb - 1) };
    majFocus(false);
  };
  store.subscribe(rendre);
  ui.subscribe((e, avant) => { if (e.patternId !== avant.patternId || e.canalId !== avant.canalId) rendre(); });
  rendre();

  // ---------- Tête de lecture ----------
  ctx.moteur.onPosition(t => {
    const u = ui.get();
    const pt = pattern(store.get(), u.patternId);
    const actif = ctx.moteur.isPlaying() && u.mode === 'pattern' && !!pt;
    const nb = pt ? nombrePas(pt) : 16;
    const c = actif ? Math.floor(t / TICKS_PAS) % nb : -1;
    if (c === colonne) return;
    for (const l of lignes.values()) {
      if (colonne >= 0) l.pas[colonne]?.classList.remove('tete');
      if (c >= 0) l.pas[c]?.classList.add('tete');
    }
    colonne = c;
  });
  return el;
}
