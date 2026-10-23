// Actions du menu Projet (étape 3.5) : nouveau depuis un modèle, ouvrir, enregistrer, renommer,
// exporter et importer du MIDI, importer un son, écouter la démo.

import { colorAt, newChannel } from '../project/defaults';
import type { Project } from '../project/types';
import { confirmer, demanderTexte, dialogue } from './components/dialog';
import type { ElementMenu } from './components/menu';
import { toast } from './components/toast';
import type { Contexte } from './contexte';
import { h } from './dom';
import { nouvelId } from './notes';
import { choisirFichier, nomFichier, telecharger } from './services';
import { trancheLibre } from './views/rack';
import { fermerPlugins } from './views/plugin-window';
import { etatInitial } from './ui-state';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const DUREE_MAX_SON = 120; // secondes (§2.7)

/** Remplace le projet (vide l'historique) et remet l'interface à zéro. */
export function chargerProjet(ctx: Contexte, p: Project): void {
  ctx.moteur.stop();
  fermerPlugins();
  ctx.store.replace(p);
  const e = etatInitial(p);
  ctx.ui.set({ patternId: e.patternId, canalId: e.canalId, mode: p.arrangement.clips.length ? 'morceau' : 'pattern' });
}

export async function nouveauDepuisModele(ctx: Contexte): Promise<void> {
  const modeles = ctx.services.modeles ?? [];
  if (!modeles.length) return;
  let choix: string | null = null;
  const liste = h('div', { class: 'modeles', role: 'radiogroup', 'aria-label': 'Modèles' }, ...modeles.map((m, i) => {
    const b = h('button', { type: 'button', class: 'modele', role: 'radio', 'aria-checked': String(i === 0) }, h('strong', null, m.nom), h('span', { class: 'doux' }, m.description));
    b.addEventListener('click', () => { for (const x of liste.querySelectorAll('.modele')) x.setAttribute('aria-checked', 'false'); b.setAttribute('aria-checked', 'true'); choix = m.id; });
    b.addEventListener('dblclick', () => { choix = m.id; d.el.querySelector<HTMLButtonElement>('.dlg-actions .principal')?.click(); });
    return b;
  }));
  choix = modeles[0]?.id ?? null;
  const d = dialogue({
    titre: 'Nouveau projet', large: true,
    contenu: h('div', null, h('p', { class: 'doux' }, 'Le projet actuel sera remplacé. Enregistrez-le d\'abord si vous voulez le garder.'), liste),
    actions: [{ texte: 'Annuler', variante: 'discret' }, { texte: 'Créer', variante: 'principal', defaut: true, action: () => {
      const m = modeles.find(x => x.id === choix);
      if (m) { chargerProjet(ctx, m.creer()); void ctx.echantillons.remplacerTout(new Map()); toast(`Nouveau projet : ${m.nom}.`, 'ok'); }
    } }],
  });
}

export async function ouvrir(ctx: Contexte): Promise<void> {
  const { openFile } = ctx.services;
  if (!openFile) return;
  const f = await choisirFichier('.frequence,application/json');
  if (!f) return;
  try {
    const { project, samples } = await openFile(f);
    chargerProjet(ctx, project);
    const echecs = await ctx.echantillons.remplacerTout(samples);
    toast(echecs.length ? `« ${project.name} » ouvert, mais ${echecs.length} son(s) n'ont pas pu être lus.` : `« ${project.name} » ouvert.`, echecs.length ? 'alerte' : 'ok');
  } catch (e) {
    toast(`Impossible d'ouvrir ce fichier : ${message(e)}`, 'alerte', 6000);
  }
}

export function enregistrer(ctx: Contexte): void {
  const { saveFile } = ctx.services;
  if (!saveFile) return;
  const p = ctx.store.get();
  telecharger(saveFile(structuredClone(p) as Project, ctx.echantillons.octets), nomFichier(p.name, 'frequence'));
  toast('Projet enregistré dans vos téléchargements.', 'ok');
}

export async function renommerProjet(ctx: Contexte): Promise<void> {
  const nom = await demanderTexte('Renommer le projet', 'Nom du projet', ctx.store.get().name, 80);
  if (nom) ctx.store.update('Renommer le projet', d => { d.name = nom; });
}

export function exporterMidi(ctx: Contexte): void {
  const { exportMidi } = ctx.services;
  if (!exportMidi) return;
  const p = ctx.store.get();
  // En mode pattern, on exporte le pattern écouté ; en mode morceau, tout l'arrangement.
  const u = ctx.ui.get();
  const octets = exportMidi(structuredClone(p) as Project, u.mode === 'pattern' ? { patternId: u.patternId } : {});
  telecharger(new Blob([octets.slice().buffer as ArrayBuffer], { type: 'audio/midi' }), nomFichier(p.name, 'mid'));
  toast('Fichier MIDI exporté.', 'ok');
}

export async function importerMidi(ctx: Contexte): Promise<void> {
  const { importMidi } = ctx.services;
  if (!importMidi) return;
  const f = await choisirFichier('.mid,.midi,audio/midi');
  if (!f) return;
  try {
    const { channels, pattern, bpm } = importMidi(await f.arrayBuffer());
    // Le tempo du fichier n'est repris que dans un projet encore sans notes.
    const vierge = ctx.store.get().patterns.every(pt => Object.values(pt.notes).every(n => !n.length));
    const tempo = bpm && vierge ? Math.min(300, Math.max(40, Math.round(bpm * 100) / 100)) : null;
    ctx.store.update('Importer un fichier MIDI', d => {
      if (tempo) d.bpm = tempo;
      for (const c of channels) {
        c.color = colorAt(d.channels.length);
        c.mixerTrack = trancheLibre(d);
        d.channels.push(c);
      }
      pattern.color = colorAt(d.patterns.length);
      d.patterns.push(pattern);
    });
    ctx.ui.set({ patternId: pattern.id, canalId: channels[0]?.id ?? ctx.ui.get().canalId });
    toast(`MIDI importé : ${channels.length} canal(aux) dans « ${pattern.name} »${tempo ? `, tempo ${String(tempo).replace('.', ',')} BPM` : ''}.`, 'ok');
  } catch (e) {
    toast(`Impossible d'importer ce fichier MIDI : ${message(e)}`, 'alerte', 6000);
  }
}

/** Importe un son et crée un canal Échantillon qui le joue. */
export async function importerSon(ctx: Contexte, fichier?: File): Promise<void> {
  const f = fichier ?? await choisirFichier('.wav,.mp3,.ogg,.flac,audio/*');
  if (!f) return;
  const id = nouvelId();
  try {
    const audio = await ctx.echantillons.ajouter(id, await f.arrayBuffer());
    if (audio.duration > DUREE_MAX_SON) {
      ctx.echantillons.octets.delete(id); ctx.echantillons.audio.delete(id);
      toast(`Ce son dure plus de ${DUREE_MAX_SON / 60} minutes : trop long pour l'échantillonneur.`, 'alerte', 6000);
      return;
    }
    const nom = f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Son';
    const c = newChannel('echantillon');
    ctx.store.update('Importer un son', d => {
      d.samples.push({ id, name: nom, durationSec: Math.round(audio.duration * 1000) / 1000 });
      c.name = nom;
      c.color = colorAt(d.channels.length);
      c.mixerTrack = trancheLibre(d);
      c.instrument.params['sample'] = id;
      d.channels.push(c);
    });
    ctx.ui.set({ canalId: c.id });
    toast(`Son « ${nom} » importé dans un nouveau canal.`, 'ok');
  } catch (e) {
    toast(`Impossible de lire ce son : ${message(e)}`, 'alerte', 6000);
  }
}

export async function ecouterDemo(ctx: Contexte, demander = true): Promise<void> {
  const { demo } = ctx.services;
  if (!demo) return;
  if (demander && !await confirmer('Écouter la démo ?', 'Le projet actuel sera remplacé par le morceau de démo. Enregistrez-le d\'abord si vous voulez le garder.', 'Charger la démo')) return;
  chargerProjet(ctx, demo());
  await ctx.echantillons.remplacerTout(new Map());
  ctx.ui.set({ mode: 'morceau', vue: 'arrangement' });
  void ctx.moteur.resume();
  ctx.moteur.play({ kind: 'morceau' }, 0);
}

export function menuProjet(ctx: Contexte, a: { exporterWav(): void; raccourcis(): void; aPropos(): void }): ElementMenu[] {
  const s = ctx.services;
  return [
    { titre: ctx.store.get().name },
    { texte: 'Nouveau…', desactive: !s.modeles?.length, action: () => void nouveauDepuisModele(ctx) },
    { texte: 'Ouvrir…', raccourci: 'Ctrl+O', desactive: !s.openFile, action: () => void ouvrir(ctx) },
    { texte: 'Enregistrer', raccourci: 'Ctrl+S', desactive: !s.saveFile, action: () => enregistrer(ctx) },
    { texte: 'Renommer le projet…', action: () => void renommerProjet(ctx) },
    { separateur: true },
    { texte: 'Exporter en WAV…', raccourci: 'Ctrl+E', desactive: !s.renderWav, action: a.exporterWav },
    { texte: 'Exporter en MIDI', desactive: !s.exportMidi, action: () => exporterMidi(ctx) },
    { texte: 'Importer un fichier MIDI…', desactive: !s.importMidi, action: () => void importerMidi(ctx) },
    { texte: 'Importer un son…', desactive: !s.decodeSample, action: () => void importerSon(ctx) },
    { separateur: true },
    { texte: 'Écouter la démo', desactive: !s.demo, action: () => void ecouterDemo(ctx) },
    { texte: 'Raccourcis clavier', raccourci: '?', action: a.raccourcis },
    { texte: 'À propos de Fréquence', action: a.aPropos },
  ];
}
