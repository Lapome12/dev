// Fenêtres de plugins (étape 2.6) : générées depuis la description PluginDef du moteur (boutons
// regroupés par `group`), avec les vues spéciales : enveloppe ADSR déplaçable, courbe d'égaliseur
// ou de filtre, réduction de gain du compresseur. Choix de preset en haut de chaque fenêtre.

import { defaultParams, listPlugins, type ParamDef, type PluginDef } from '../../engine/params';
import { listPresets } from '../../project/presets';
import type { Channel, EffectSlot, Id, ParamValue, Project } from '../../project/types';
import { aideTemporaire } from '../aide';
import { fenetre, type Fenetre } from '../components/fenetre';
import { boutonRotatif } from '../components/knob';
import { champNombre } from '../components/number';
import { liste, type Liste } from '../components/select';
import { interrupteur, type Interrupteur } from '../components/toggle';
import { formater, type Unite } from '../components/valeur';
import type { Reglage } from '../components/glisser';
import type { Contexte } from '../contexte';
import { borner, h, jeton, preparerCanvas } from '../dom';
import { finGeste } from '../geste';
import { nomNote, VOIX_FRAPPE } from '../notes';
import { ecrireMotif, lireMotif, PAS_PORTE } from '../../engine/effects/porte';
import { chordPitches } from '../../engine/instruments/accord';

type Cible = { kind: 'instrument'; canalId: Id } | { kind: 'effet'; piste: number; slotId: Id };

const ouvertes = new Map<string, Fenetre>();
const cleDe = (c: Cible) => (c.kind === 'instrument' ? `i:${c.canalId}` : `e:${c.piste}:${c.slotId}`);

export const definition = (type: string): PluginDef | undefined => listPlugins().find(p => p.type === type);

/** Valeur affichée d'un réglage : celle du projet, sinon le défaut. */
export function valeurReglage(def: ParamDef, params: Record<string, ParamValue>): ParamValue {
  const v = params[def.id];
  if (def.kind === 'number') return typeof v === 'number' && Number.isFinite(v) ? borner(v, def.min ?? -Infinity, def.max ?? Infinity) : def.default;
  if (def.kind === 'toggle') return typeof v === 'boolean' ? v : def.default;
  return typeof v === 'string' ? v : def.default;
}

/** Regroupe les réglages par `group`, dans l'ordre d'apparition ; les sans-groupe vont dans « Général ». */
export function grouper(params: readonly ParamDef[]): { nom: string; params: ParamDef[] }[] {
  const groupes: { nom: string; params: ParamDef[] }[] = [];
  for (const p of params) {
    const nom = p.group ?? 'Général';
    let g = groupes.find(x => x.nom === nom);
    if (!g) { g = { nom, params: [] }; groupes.push(g); }
    g.params.push(p);
  }
  return groupes;
}

/** Préfixe d'une enveloppe ADSR complète dans un groupe (ids <p>a, <p>d, <p>s, <p>r), sinon null. */
export function prefixeAdsr(params: readonly ParamDef[]): string | null {
  for (const p of params) {
    if (!p.id.endsWith('a')) continue;
    const pre = p.id.slice(0, -1);
    if (['d', 's', 'r'].every(s => params.some(x => x.id === pre + s))) return pre;
  }
  return null;
}

export function ouvrirPlugin(ctx: Contexte, cible: Cible): void {
  const cle = cleDe(cible);
  const existante = ouvertes.get(cle);
  if (existante) { existante.premierPlan(); existante.el.focus(); return; }

  const { store } = ctx;
  const lire = (p: Readonly<Project> = store.get()): { params: Record<string, ParamValue>; type: string; nom: string; canal?: Channel; slot?: EffectSlot } | null => {
    if (cible.kind === 'instrument') {
      const c = p.channels.find(x => x.id === cible.canalId);
      return c ? { params: c.instrument.params, type: c.instrument.type, nom: c.name, canal: c } : null;
    }
    const t = p.mixer[cible.piste];
    const s = t?.effects.find(x => x.id === cible.slotId);
    return s && t ? { params: s.params, type: s.type, nom: `${t.name} · emplacement ${t.effects.indexOf(s) + 1}`, slot: s } : null;
  };
  const etat = lire();
  if (!etat) return;
  const def = definition(etat.type);
  if (!def) return;

  const ecrire = (label: string, f: (params: Record<string, ParamValue>, d: Project) => void, merge = false) =>
    store.update(label, d => {
      if (cible.kind === 'instrument') { const c = d.channels.find(x => x.id === cible.canalId); if (c) f(c.instrument.params, d); }
      else { const s = d.mixer[cible.piste]?.effects.find(x => x.id === cible.slotId); if (s) f(s.params, d); }
    }, merge ? { merge: true } : undefined);
  const ecrireSlot = (label: string, f: (s: EffectSlot) => void, merge = false) =>
    store.update(label, d => { const s = cible.kind === 'effet' ? d.mixer[cible.piste]?.effects.find(x => x.id === cible.slotId) : undefined; if (s) f(s); }, merge ? { merge: true } : undefined);

  // ---------- Contrôles générés ----------
  const synchros: (() => void)[] = [];
  const controle = (p: ParamDef): HTMLElement => {
    const val = () => valeurReglage(p, lire()?.params ?? {});
    // Sidechain : la tranche source, désignée par son nom.
    if (def.type === 'sidechain' && p.id === 'source' && p.kind === 'number') {
      const options = () => Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const nom = store.get().mixer[n]?.name ?? `Tranche ${n}`;
        return { value: String(n), label: cible.kind === 'effet' && n === cible.piste ? `${n} · ${nom} (cette tranche, sans effet)` : `${n} · ${nom}` };
      });
      const l: Liste = liste({ libelle: p.label, etiquetteVisible: true, options: options(), valeur: String(val()), aide: p.help, surChange: v => ecrire('Choisir la source du sidechain', x => { x[p.id] = Number(v); }) });
      synchros.push(() => { l.options(options()); l.definir(String(val())); });
      return h('div', { class: 'pw-source' }, l.el);
    }
    if (p.kind === 'number') {
      const unite = p.unit as Unite | undefined;
      const r: Reglage = boutonRotatif({
        libelle: p.label, min: p.min ?? 0, max: p.max ?? 1, ...(p.step !== undefined ? { step: p.step } : {}), ...(p.curve ? { curve: p.curve } : {}),
        ...(unite ? { unite } : {}), defaut: Number(p.default), valeur: Number(val()), aide: p.help,
        bipolaire: (p.min ?? 0) < 0 && (p.max ?? 0) > 0,
        ...(!unite && (p.min ?? 0) >= 0 && p.max === 1 ? { format: (v: number) => `${Math.round(v * 100)} %` } : {}),
        surEntree: v => ecrire(`Régler ${p.label.toLowerCase()}`, x => { x[p.id] = v; }, true),
        surFin: () => finGeste(store),
      });
      synchros.push(() => r.definir(Number(val())));
      return r.el;
    }
    if (p.kind === 'toggle') {
      const t: Interrupteur = interrupteur({ libelle: p.label, texte: p.label, variante: 'temoin', actif: Boolean(val()), aide: p.help, surChange: a => ecrire(`${a ? 'Activer' : 'Désactiver'} ${p.label.toLowerCase()}`, x => { x[p.id] = a; }) });
      synchros.push(() => t.definir(Boolean(val())));
      return h('div', { class: 'pw-toggle' }, t.el);
    }
    // Porte : motif de 16 pas cliquables (format 'x.' convenu avec Dev 3).
    if (def.type === 'porte' && p.id === 'motif') return editeurMotif(p, val);
    // Choix : la liste des sons d'Échantillon vient du projet.
    const options = () => (p.options && p.options.length ? p.options : [{ value: '', label: 'Aucun son' }, ...store.get().samples.map(s => ({ value: s.id, label: s.name }))]);
    const l: Liste = liste({ libelle: p.label, etiquetteVisible: true, options: options(), valeur: String(val()), aide: p.help, surChange: v => ecrire(`Choisir ${p.label.toLowerCase()}`, x => { x[p.id] = v; }) });
    synchros.push(() => { if (!p.options?.length) l.options(options()); l.definir(String(val())); });
    return l.el;
  };

  function editeurMotif(p: ParamDef, val: () => ParamValue): HTMLElement {
    const boutons = Array.from({ length: PAS_PORTE }, (_, i) => {
      const b = h('button', { type: 'button', class: `pw-motif-pas${Math.floor(i / 4) % 2 ? ' alt' : ''}`, 'aria-label': `Pas ${i + 1}`, 'aria-pressed': 'false' });
      b.addEventListener('click', () => {
        const m = lireMotif(val());
        m[i] = !m[i];
        ecrire(m[i] ? 'Ouvrir un pas de la porte' : 'Fermer un pas de la porte', x => { x[p.id] = ecrireMotif(m); });
      });
      b.addEventListener('keydown', e => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); boutons[(i + d + PAS_PORTE) % PAS_PORTE]?.focus(); }
      });
      return b;
    });
    const maj = () => { const m = lireMotif(val()); for (const [i, b] of boutons.entries()) b.setAttribute('aria-pressed', String(m[i])); };
    maj();
    synchros.push(maj);
    const outil = (texte: string, f: (m: boolean[]) => boolean[]) => h('button', {
      type: 'button', class: 'btn discret',
      onclick: () => ecrire(`Motif de la porte : ${texte.toLowerCase()}`, x => { x[p.id] = ecrireMotif(f(lireMotif(val()))); }),
    }, texte);
    return h('div', { class: 'pw-motif', 'data-aide': p.help },
      h('div', { class: 'pw-motif-pas-liste', role: 'group', 'aria-label': 'Motif de la porte (16 pas)' }, ...boutons),
      h('div', { class: 'pw-motif-outils' },
        outil('Tout ouvrir', m => m.map(() => true)),
        outil('Croches', m => m.map((_, i) => i % 2 === 0)),
        outil('Inverser', m => m.map(x => !x)),
        outil('Décaler', m => [m[PAS_PORTE - 1] ?? false, ...m.slice(0, -1)]),
        outil('Effacer', m => m.map(() => false))));
  }

  const groupes = grouper(def.params).map(g => {
    const pre = prefixeAdsr(g.params);
    const vue = pre !== null && def.view === 'adsr' ? vueAdsr(g.params, pre) : def.type === 'accord' && g.nom === 'Accord' ? vueAccord(def.params) : null;
    return h('div', { class: 'groupe-reglages' }, h('h3', null, g.nom), vue, h('div', { class: 'rangee-reglages' }, ...g.params.map(controle)));
  });

  // ---------- Accord : mini clavier des notes jouées par la hauteur des pas ----------
  function vueAccord(defs: readonly ParamDef[]): HTMLElement {
    const reglage = (id: string, p: Record<string, ParamValue>) => { const d = defs.find(x => x.id === id); return d ? valeurReglage(d, p) : undefined; };
    const BLANCHES = [0, 2, 4, 5, 7, 9, 11];
    const touches = h('div', { class: 'pw-accord-clavier', 'aria-hidden': 'true' });
    const texte = h('p', { class: 'pw-accord-texte mono' });
    const boite = h('div', { class: 'pw-vue pw-accord', 'data-aide': 'Notes de l\'accord joué par la hauteur des pas du canal (Do4 par défaut).' }, touches, texte);
    let cle = '';
    const maj = () => {
      const e = lire();
      if (!e) return;
      const p = e.params;
      const racine = (e.canal?.rootPitch ?? 60) + Math.round(Number(reglage('octave', p) ?? 0)) * 12;
      const accord = String(reglage('accord', p) ?? 'm7');
      const renv = Math.round(Number(reglage('renversement', p) ?? 0));
      const notes = chordPitches(racine, accord, renv);
      const k = notes.join(',');
      if (k === cle) return;
      cle = k;
      // Deux octaves (trois si l'accord déborde), à partir du do sous la note la plus grave.
      const debut = Math.floor(Math.min(...notes) / 12) * 12;
      const octaves = Math.max(2, Math.ceil((Math.max(...notes) + 1 - debut) / 12));
      const enfants: HTMLElement[] = [];
      for (let o = 0; o < octaves; o++) {
        for (let d = 0; d < 12; d++) {
          const hauteur = debut + o * 12 + d;
          const blanche = BLANCHES.includes(d);
          const t = h('span', { class: `pw-touche ${blanche ? 'blanche' : 'noire'}${notes.includes(hauteur) ? ' jouee' : ''}${hauteur === racine ? ' racine' : ''}` });
          if (!blanche) t.style.setProperty('--x', String(o * 7 + BLANCHES.filter(b => b < d).length));
          enfants.push(t);
        }
      }
      touches.style.setProperty('--blanches', String(octaves * 7));
      touches.replaceChildren(...enfants);
      const triees = [...notes].sort((a, b) => a - b);
      texte.textContent = triees.map(nomNote).join(' · ');
      boite.setAttribute('aria-label', `Notes jouées : ${triees.map(nomNote).join(', ')}`);
    };
    boite.setAttribute('role', 'img');
    maj();
    synchros.push(maj);
    return boite;
  }

  // ---------- Vue ADSR déplaçable ----------
  function vueAdsr(params: ParamDef[], pre: string): HTMLElement {
    const c = h('canvas', { class: 'pw-adsr', 'aria-hidden': 'true' });
    const boite = h('div', { class: 'pw-vue', 'data-aide': 'Enveloppe : glisser les poignées pour régler attaque, déclin, maintien et relâchement.' }, c);
    const d = (s: string) => params.find(x => x.id === pre + s);
    const L = 220; const H = 80; const M = 8;
    const tempsMax = 2000; // échelle des abscisses (ms par segment, logarithmique)
    const xDe = (ms: number) => (Math.log10(1 + ms) / Math.log10(1 + tempsMax)) * ((L - 2 * M) / 3.4);
    const msDe = (x: number) => Math.pow(10, (x / ((L - 2 * M) / 3.4)) * Math.log10(1 + tempsMax)) - 1;
    const valeurs = () => {
      const pa = lire()?.params ?? {};
      const v = (s: string) => { const pd = d(s); return pd ? Number(valeurReglage(pd, pa)) : 0; };
      return { a: v('a'), d: v('d'), s: v('s'), r: v('r') };
    };
    const points = () => {
      const v = valeurs();
      const xa = M + xDe(v.a); const xd = xa + xDe(v.d); const xs = xd + (L - 2 * M) * 0.18; const xr = xs + xDe(v.r);
      const ys = M + (1 - v.s) * (H - 2 * M);
      return { xa, xd, xs, xr, ys, v };
    };
    let prise: 'a' | 'd' | 'r' | null = null;
    const dessiner = () => {
      const g = preparerCanvas(c, L, H);
      const p = points();
      g.fillStyle = '#121419'; g.fillRect(0, 0, L, H);
      g.strokeStyle = '#2E3340'; g.lineWidth = 1;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (H * i) / 4 + 0.5); g.lineTo(L, (H * i) / 4 + 0.5); g.stroke(); }
      const acc = jeton('accent');
      g.beginPath();
      g.moveTo(M, H - M); g.lineTo(p.xa, M); g.lineTo(p.xd, p.ys); g.lineTo(p.xs, p.ys); g.lineTo(p.xr, H - M);
      g.lineTo(M, H - M);
      g.fillStyle = 'rgba(61,220,177,.12)'; g.fill();
      g.beginPath();
      g.moveTo(M, H - M); g.lineTo(p.xa, M); g.lineTo(p.xd, p.ys); g.lineTo(p.xs, p.ys); g.lineTo(p.xr, H - M);
      g.strokeStyle = acc; g.lineWidth = 2; g.stroke();
      for (const [x, y, k] of [[p.xa, M, 'a'], [p.xd, p.ys, 'd'], [p.xr, H - M, 'r']] as const) {
        g.beginPath(); g.arc(x, y, prise === k ? 6 : 4.5, 0, Math.PI * 2);
        g.fillStyle = prise === k ? '#ffffff' : acc; g.fill();
      }
    };
    c.addEventListener('pointerdown', e => {
      const r = c.getBoundingClientRect(); const x = e.clientX - r.left; const y = e.clientY - r.top;
      const p = points();
      const proches = ([['a', p.xa, M], ['d', p.xd, p.ys], ['r', p.xr, H - M]] as const).map(([k, px, py]) => ({ k, dist: Math.hypot(px - x, py - y) })).sort((a1, b1) => a1.dist - b1.dist);
      if (!proches[0] || proches[0].dist > 18) return;
      prise = proches[0].k;
      c.setPointerCapture(e.pointerId);
      dessiner();
    });
    c.addEventListener('pointermove', e => {
      if (!prise) return;
      const r = c.getBoundingClientRect(); const x = e.clientX - r.left; const y = e.clientY - r.top;
      const p = points();
      const regler = (s: string, v: number) => { const pd = d(s); if (pd) ecrire(`Régler ${pd.label.toLowerCase()}`, pa => { pa[pd.id] = borner(v, pd.min ?? 0, pd.max ?? v); }, true); };
      if (prise === 'a') regler('a', Math.round(msDe(x - M)));
      else if (prise === 'd') { regler('d', Math.max(1, Math.round(msDe(x - p.xa)))); regler('s', Math.round(borner(1 - (y - M) / (H - 2 * M), 0, 1) * 100) / 100); }
      else regler('r', Math.max(3, Math.round(msDe(x - p.xs))));
      const v = valeurs();
      aideTemporaire(`Attaque ${formater(v.a, 'ms')} · Déclin ${formater(v.d, 'ms')} · Maintien ${Math.round(v.s * 100)} % · Relâchement ${formater(v.r, 'ms')}`);
    });
    const lacher = () => { if (prise) { prise = null; aideTemporaire(null); finGeste(store); dessiner(); } };
    c.addEventListener('pointerup', lacher);
    c.addEventListener('pointercancel', lacher);
    synchros.push(dessiner);
    requestAnimationFrame(dessiner);
    return boite;
  }

  // ---------- Vues des effets : courbe, réduction de gain ----------
  let animation = 0;
  const vuesEffet: HTMLElement[] = [];
  if (cible.kind === 'effet' && (def.view === 'eq-courbe' || def.view === 'filtre-courbe')) {
    const c = h('canvas', { class: 'pw-courbe', 'aria-hidden': 'true' });
    vuesEffet.push(h('div', { class: 'pw-vue', 'data-aide': 'Courbe : glisser une poignée (horizontal = fréquence, vertical = gain ou résonance). Molette sur une poignée : largeur (Q).' }, c));
    const LC = 420; const HC = 140;
    // Poignées : une par bande d'égaliseur (<b>freq + <b>gain), ou fréquence + résonance pour le filtre.
    const pd = (id: string) => def.params.find(x => x.id === id);
    const poignees = def.params.flatMap(x => {
      const m = /^(.*)freq$/.exec(x.id);
      if (m && pd(`${m[1]}gain`)) return [{ f: x, y: pd(`${m[1]}gain`) as ParamDef, q: pd(`${m[1]}q`), nom: (x.group ?? '').replace(/^Bande (\d+).*/, '$1') }];
      if (x.id === 'frequence' && pd('resonance')) return [{ f: x, y: pd('resonance') as ParamDef, q: undefined, nom: '' }];
      return [];
    });
    const xDeF = (f: number) => (Math.log10(Math.max(20, f) / 20) / 3) * LC;
    const fDeX = (x: number) => 20 * Math.pow(1000, borner(x / LC, 0, 1));
    const yDe = (d: ParamDef, v: number) => (d.unit === 'dB' ? HC / 2 - (v / 24) * (HC / 2 - 4) : HC - 6 - ((v - (d.min ?? 0)) / ((d.max ?? 1) - (d.min ?? 0))) * (HC - 12));
    const vDeY = (d: ParamDef, y: number) => (d.unit === 'dB' ? ((HC / 2 - y) / (HC / 2 - 4)) * 24 : (d.min ?? 0) + ((HC - 6 - y) / (HC - 12)) * ((d.max ?? 1) - (d.min ?? 0)));
    const valeur = (d: ParamDef) => Number(valeurReglage(d, lire()?.params ?? {}));
    let prise: (typeof poignees)[number] | null = null;
    const proche = (x: number, y: number) => poignees.map(q => ({ q, d: Math.hypot(xDeF(valeur(q.f)) - x, yDe(q.y, valeur(q.y)) - y) })).sort((a, b) => a.d - b.d)[0];
    const arrondi = (d: ParamDef, v: number) => { const b = borner(v, d.min ?? -Infinity, d.max ?? Infinity); return d.step ? Math.round(b / d.step) * d.step : Math.round(b); };
    c.addEventListener('pointerdown', e => {
      const r = c.getBoundingClientRect();
      const pr = proche(e.clientX - r.left, e.clientY - r.top);
      if (!pr || pr.d > 16) return;
      prise = pr.q;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', e => {
      if (!prise) return;
      const r = c.getBoundingClientRect();
      const q = prise;
      const f = arrondi(q.f, fDeX(e.clientX - r.left));
      const g = arrondi(q.y, vDeY(q.y, e.clientY - r.top));
      ecrire(`Régler ${q.nom ? `la bande ${q.nom}` : 'le filtre'}`, pa => { pa[q.f.id] = f; pa[q.y.id] = g; }, true);
      aideTemporaire(`${formater(f, 'Hz')} · ${q.y.unit === 'dB' ? formater(g, 'dB') : `${q.y.label} ${String(g).replace('.', ',')}`}`);
    });
    const lacher = () => { if (prise) { prise = null; aideTemporaire(null); finGeste(store); } };
    c.addEventListener('pointerup', lacher);
    c.addEventListener('pointercancel', lacher);
    c.addEventListener('wheel', e => {
      const r = c.getBoundingClientRect();
      const pr = proche(e.clientX - r.left, e.clientY - r.top);
      const qd = pr && pr.d <= 16 ? pr.q.q : undefined;
      if (!qd) return;
      e.preventDefault();
      const v = arrondi(qd, valeur(qd) * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
      ecrire('Régler la largeur', pa => { pa[qd.id] = v; }, true);
      aideTemporaire(`Largeur (Q) : ${String(v).replace('.', ',')}`);
    }, { passive: false });
    const N = 256;
    const freqs = new Float32Array(N); const mag = new Float32Array(N);
    for (let i = 0; i < N; i++) freqs[i] = 20 * Math.pow(1000, i / (N - 1));
    const spectre = new Float32Array(1024);
    const tracer = () => {
      const L = LC; const H = HC;
      const g = preparerCanvas(c, L, H);
      g.fillStyle = '#121419'; g.fillRect(0, 0, L, H);
      g.fillStyle = '#2E3340';
      for (const f of [100, 1000, 10000]) { const x = (Math.log10(f / 20) / 3) * L; g.fillRect(x, 0, 1, H); }
      for (const db of [-12, 0, 12]) g.fillRect(0, H / 2 - (db / 24) * (H / 2), L, 1);
      // Spectre de la tranche en fond.
      if (ctx.moteur.spectrum) {
        ctx.moteur.spectrum(cible.piste, spectre);
        g.fillStyle = 'rgba(140,147,163,.18)';
        g.beginPath(); g.moveTo(0, H);
        for (let i = 1; i < spectre.length; i++) {
          const f = (i * 24000) / spectre.length;
          if (f < 20) continue;
          const x = (Math.log10(f / 20) / 3) * L;
          const y = H - borner(((spectre[i] ?? -100) + 100) / 100, 0, 1) * H;
          g.lineTo(x, y);
        }
        g.lineTo(L, H); g.fill();
      }
      ctx.moteur.frequencyResponse?.(cible.piste, cible.slotId, freqs, mag);
      g.beginPath();
      for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * L; const y = H / 2 - borner((mag[i] ?? 0) / 24, -1, 1) * (H / 2 - 4); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.strokeStyle = jeton('accent'); g.lineWidth = 2; g.stroke();
      g.font = `10px ${getComputedStyle(document.body).fontFamily}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const q of poignees) {
        const x = xDeF(valeur(q.f)); const y = yDe(q.y, valeur(q.y));
        g.beginPath(); g.arc(x, y, prise === q ? 8 : 7, 0, Math.PI * 2);
        g.fillStyle = prise === q ? '#ffffff' : jeton('lecture'); g.fill();
        if (q.nom) { g.fillStyle = '#121419'; g.fillText(q.nom, x, y + 0.5); }
      }
      animation = requestAnimationFrame(tracer);
    };
    animation = requestAnimationFrame(tracer);
  }
  if (cible.kind === 'effet' && (def.view === 'compresseur' || def.type === 'sidechain')) {
    const barre = h('span', { class: 'pw-gr-barre' });
    const texte = h('span', { class: 'pw-gr-texte mono' }, '0,0 dB');
    vuesEffet.push(h('div', { class: 'pw-vue pw-gr', 'data-aide': 'Réduction de gain : combien le compresseur baisse le son en ce moment.' }, h('span', { class: 'doux' }, 'Réduction'), h('span', { class: 'pw-gr-piste' }, barre), texte));
    const tracer = () => {
      const gr = Math.abs(ctx.moteur.gainReduction?.(cible.piste, cible.slotId) ?? 0);
      barre.style.width = `${borner(gr / 24, 0, 1) * 100}%`;
      texte.textContent = `-${gr.toFixed(1).replace('.', ',')} dB`;
      animation = requestAnimationFrame(tracer);
    };
    animation = requestAnimationFrame(tracer);
  }

  // ---------- En-tête : preset, bypass et mix, réglages du canal ----------
  const presets = listPresets(def.type);
  const choixPreset = liste({
    libelle: 'Preset', valeur: '',
    options: [{ value: '', label: presets.length ? 'Choisir un preset…' : 'Aucun preset' }, ...presets.map(p => ({ value: p.id, label: p.name, groupe: p.category }))],
    aide: 'charge un réglage tout prêt (Ctrl+Z pour revenir).',
    surChange: v => {
      const pr = presets.find(p => p.id === v);
      if (!pr) return;
      ecrire(`Charger le preset « ${pr.name} »`, (pa) => { for (const k of Object.keys(pa)) delete pa[k]; Object.assign(pa, defaultParams(def.type), structuredClone(pr.params)); });
      choixPreset.definir('');
    },
  });
  const outils: HTMLElement[] = [choixPreset.el];
  if (cible.kind === 'effet') {
    const bypass = interrupteur({ libelle: 'Actif', texte: 'Actif', variante: 'temoin', actif: !etat.slot?.bypass, aide: 'Éteint l\'effet sans le retirer (bypass).', surChange: a => ecrireSlot(a ? 'Activer l\'effet' : 'Contourner l\'effet', s => { s.bypass = !a; }) });
    const mix = boutonRotatif({ libelle: 'Mix', min: 0, max: 1, step: 0.01, defaut: 1, valeur: etat.slot?.mix ?? 1, taille: 'mini', format: v => `${Math.round(v * 100)} %`, aide: 'dosage entre le son d\'origine et le son traité.',
      surEntree: v => ecrireSlot('Régler le mix', s => { s.mix = v; }, true), surFin: () => finGeste(store) });
    synchros.push(() => { const s = lire()?.slot; if (s) { bypass.definir(!s.bypass); mix.definir(s.mix); } });
    outils.push(bypass.el, mix.el);
  }
  let reglagesCanal: HTMLElement | null = null;
  if (cible.kind === 'instrument') {
    const majCanal = (label: string, f: (c: Channel) => void, merge = false) => store.update(label, d => { const c = d.channels.find(x => x.id === cible.canalId); if (c) f(c); }, merge ? { merge: true } : undefined);
    const hauteur = champNombre({ libelle: 'Hauteur des pas', min: 0, max: 127, step: 1, defaut: 60, valeur: etat.canal?.rootPitch ?? 60, format: v => (def.type === 'frappe' ? VOIX_FRAPPE[v] ?? nomNote(v) : nomNote(v)), aide: def.type === 'frappe' ? 'voix jouée par les pas du Rack (36 grosse caisse … 56 cloche).' : 'note jouée par les pas du Rack.',
      surEntree: v => majCanal('Changer la hauteur des pas', c => { c.rootPitch = v; }, true), surFin: () => finGeste(store) });
    synchros.push(() => { const c = lire()?.canal; if (c) hauteur.definir(c.rootPitch); });
    reglagesCanal = h('div', { class: 'pw-canal' }, h('span', { class: 'doux' }, 'Hauteur des pas'), hauteur.el,
      h('button', { type: 'button', class: 'btn discret', onclick: () => ctx.ui.set({ canalId: cible.canalId, vue: 'piano' }) }, 'Piano roll'));
  }

  const contenu = h('div', { class: 'pw-contenu' },
    h('p', { class: 'pw-description doux' }, def.description),
    reglagesCanal, ...vuesEffet,
    h('div', { class: groupes.length > 4 ? 'pw-groupes nombreux' : 'pw-groupes' }, ...groupes));
  const f = fenetre({
    titre: etat.nom, sousTitre: def.name, outils, contenu, classe: `plugin plugin-${def.type}`,
    surFermeture: () => { ouvertes.delete(cle); desabo(); cancelAnimationFrame(animation); },
  });
  ouvertes.set(cle, f);
  const desabo = store.subscribe(p => {
    const e = lire(p);
    if (!e || e.type !== def.type) { f.fermer(); return; }
    f.titre(e.nom);
    for (const s of synchros) s();
  });
}

/** Ferme toutes les fenêtres (nouveau projet, ouverture d'un fichier). */
export function fermerPlugins(): void { for (const f of [...ouvertes.values()]) f.fermer(); }
