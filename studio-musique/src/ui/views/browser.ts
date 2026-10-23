// Navigateur à gauche (étape 3.5) : presets par instrument et par catégorie, effets, modèles de
// projet, sons importés. Clic : ajouter ; glisser un preset sur une ligne du Rack (change
// l'instrument) ou sur une tranche de la console (ajoute l'effet).

import { listPlugins, type PluginDef } from '../../engine/params';
import { listPresets, type Preset } from '../../project/presets';
import type { InstrumentType } from '../../project/types';
import { aide } from '../aide';
import { bouton } from '../components/button';
import { confirmer } from '../components/dialog';
import { toast } from '../components/toast';
import type { Contexte } from '../contexte';
import { h } from '../dom';
import { chargerProjet, importerSon } from '../projet';
import { ajouterEffetPreset, reglages, TYPE_GLISSE, type Glisse } from '../presets-glisses';
import { ajouterCanal } from './rack';

export const sansAccents = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function navigateur(ctx: Contexte): HTMLElement {
  const { store, ui } = ctx;
  const recherche = h('input', { class: 'champ nv-recherche', type: 'search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher un preset', autocomplete: 'off', spellcheck: 'false' });
  const arbre = h('div', { class: 'nv-arbre' });
  const el = h('aside', { class: 'navigateur', 'aria-label': 'Navigateur' },
    h('div', { class: 'nv-entete' }, h('h2', null, 'Navigateur'), bouton({ icone: 'fermer', libelle: 'Masquer le navigateur', variante: 'discret', surClic: () => ui.set({ navigateur: false }) })),
    recherche, arbre);
  const ouverts = new Set<string>(['Instruments']);

  const item = (texte: string, sous: string | null, g: Glisse | null, action: () => void, aideTexte: string) => {
    const b = h('button', { type: 'button', class: 'nv-item', draggable: g ? 'true' : 'false' }, h('span', { class: 'nv-texte' }, texte), sous ? h('span', { class: 'nv-sous doux' }, sous) : null);
    aide(b, aideTexte);
    b.addEventListener('click', action);
    if (g) b.addEventListener('dragstart', e => { e.dataTransfer?.setData(TYPE_GLISSE, JSON.stringify(g)); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'; });
    return h('li', null, b);
  };
  const dossier = (titre: string, cle: string, enfants: HTMLElement[], filtre: boolean): HTMLElement | null => {
    if (!enfants.length) return null;
    const d = h('details', { class: 'nv-dossier' }, h('summary', null, titre), h('ul', null, ...enfants));
    d.open = filtre || ouverts.has(cle);
    d.addEventListener('toggle', () => { if (d.open) ouverts.add(cle); else ouverts.delete(cle); });
    return d;
  };

  const rendre = () => {
    const q = sansAccents(recherche.value.trim());
    const filtre = q.length > 0;
    const garde = (...t: (string | undefined)[]) => !filtre || t.some(x => x && sansAccents(x).includes(q));
    const plugins = listPlugins();
    const parType = (kind: PluginDef['kind']) => plugins.filter(p => p.kind === kind).map(p => {
      const presets = listPresets(p.type);
      const categories = new Map<string, Preset[]>();
      for (const pr of presets) if (garde(pr.name, pr.category, p.name)) { const l = categories.get(pr.category) ?? []; l.push(pr); categories.set(pr.category, l); }
      const enfants: HTMLElement[] = [];
      const ajouter = (presetId?: string) => (kind === 'instrument'
        ? () => { ajouterCanal(ctx, p.type as InstrumentType, presetId); toast(`Canal ${reglages(p.type, presetId).nom ?? p.name} ajouté au Rack.`, 'ok'); }
        : () => { const c = store.get().channels.find(x => x.id === ui.get().canalId); ajouterEffetPreset(ctx, c?.mixerTrack ?? 0, { kind, type: p.type, ...(presetId ? { presetId } : {}) }); });
      const aideClic = kind === 'instrument' ? 'Clic : ajouter un canal. Glisser sur une ligne du Rack : changer son instrument.' : 'Clic : ajouter à la tranche du canal sélectionné. Glisser sur une tranche de la console.';
      if (garde(p.name, 'réglage de base')) enfants.push(item('Réglage de base', null, { kind, type: p.type }, ajouter(), aideClic));
      for (const [cat, liste] of categories) {
        const d = dossier(cat, `${p.type}/${cat}`, liste.map(pr => item(pr.name, null, { kind, type: p.type, presetId: pr.id }, ajouter(pr.id), aideClic)), filtre);
        if (d) enfants.push(h('li', null, d));
      }
      return dossier(`${p.name} ${presets.length ? `(${presets.length})` : ''}`.trim(), p.type, enfants, filtre);
    }).filter((x): x is HTMLElement => !!x);

    const modeles = (ctx.services.modeles ?? []).filter(m => garde(m.nom, m.description)).map(m => item(m.nom, m.description, null, async () => {
      if (await confirmer(`Nouveau projet « ${m.nom} » ?`, 'Le projet actuel sera remplacé. Enregistrez-le d\'abord si vous voulez le garder.', 'Créer')) {
        chargerProjet(ctx, m.creer());
        void ctx.echantillons.remplacerTout(new Map());
      }
    }, 'Clic : commencer un nouveau projet à partir de ce modèle.'));

    const sons = store.get().samples.filter(s => garde(s.name)).map(s => item(s.name, `${s.durationSec.toFixed(1).replace('.', ',')} s`, null, () => {
      const id = ajouterCanal(ctx, 'echantillon');
      store.update('Choisir un son', d => { const c = d.channels.find(x => x.id === id); if (c) { c.instrument.params['sample'] = s.id; c.name = s.name; } });
    }, 'Clic : nouveau canal Échantillon qui joue ce son.'));
    sons.push(h('li', null, bouton({ texte: 'Importer un son…', icone: 'import', variante: 'discret', classe: 'nv-importer', desactive: !ctx.services.decodeSample, surClic: () => void importerSon(ctx) })));

    arbre.replaceChildren(...[
      dossier('Instruments', 'Instruments', parType('instrument').map(x => h('li', null, x)), filtre),
      dossier('Effets', 'Effets', parType('effet').map(x => h('li', null, x)), filtre),
      dossier('Modèles de projet', 'Modèles', modeles, filtre),
      dossier('Sons importés', 'Sons', sons, filtre),
    ].filter((x): x is HTMLElement => !!x));
  };
  recherche.addEventListener('input', rendre);
  recherche.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { recherche.value = ''; rendre(); } });
  // Déposer un fichier son n'importe où dans le navigateur l'importe.
  el.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  el.addEventListener('drop', e => {
    const f = e.dataTransfer?.files[0];
    if (!f) return;
    e.preventDefault();
    void importerSon(ctx, f);
  });
  let echantillons = '';
  store.subscribe(p => { const k = p.samples.map(s => s.id + s.name).join(); if (k !== echantillons) { echantillons = k; rendre(); } });
  rendre();
  return el;
}
