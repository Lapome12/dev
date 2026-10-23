// Boîte d'export WAV (étape 3.5) : morceau ou pattern courant, 44,1 / 48 kHz, 16 / 24 bits,
// queue de réverbe, normalisation, barre de progression ; le fichier part dans les téléchargements.

import type { Project } from '../../project/types';
import { dialogue } from '../components/dialog';
import { champNombre } from '../components/number';
import { liste } from '../components/select';
import { toast } from '../components/toast';
import { interrupteur } from '../components/toggle';
import type { Contexte } from '../contexte';
import { h } from '../dom';
import { nomFichier, telecharger, type OptionsRendu } from '../services';

export function ouvrirExport(ctx: Contexte): void {
  const { renderWav } = ctx.services;
  if (!renderWav) { toast('L\'export WAV arrive bientôt.'); return; }
  const p = ctx.store.get();
  const pattern = p.patterns.find(x => x.id === ctx.ui.get().patternId);
  const aMorceau = p.arrangement.clips.length > 0;
  let o: OptionsRendu = { mode: aMorceau ? { kind: 'morceau' } : { kind: 'pattern', patternId: pattern?.id ?? '' }, sampleRate: 44100, bitDepth: 16, tailSec: 2, normalize: false };
  let enCours = false;
  let annule = false;

  const quoi = liste({
    libelle: 'À exporter', etiquetteVisible: true, valeur: o.mode.kind,
    options: [{ value: 'morceau', label: aMorceau ? 'Le morceau (arrangement)' : 'Le morceau (arrangement vide)' }, { value: 'pattern', label: `Le pattern « ${pattern?.name ?? ''} »` }],
    surChange: v => { o = { ...o, mode: v === 'morceau' ? { kind: 'morceau' } : { kind: 'pattern', patternId: pattern?.id ?? '' } }; },
  });
  const frequence = liste({ libelle: 'Fréquence d\'échantillonnage', etiquetteVisible: true, valeur: '44100', options: [{ value: '44100', label: '44,1 kHz (CD)' }, { value: '48000', label: '48 kHz (vidéo)' }], surChange: v => { o = { ...o, sampleRate: Number(v) as 44100 | 48000 }; } });
  const bits = liste({ libelle: 'Résolution', etiquetteVisible: true, valeur: '16', options: [{ value: '16', label: '16 bits' }, { value: '24', label: '24 bits' }], surChange: v => { o = { ...o, bitDepth: Number(v) as 16 | 24 }; } });
  const queue = champNombre({ libelle: 'Queue après la fin', min: 0, max: 10, step: 0.5, defaut: 2, valeur: 2, unite: 's', aide: 'laisse s\'éteindre réverbes et délais après la dernière note.', surEntree: v => { o = { ...o, tailSec: v }; } });
  const normaliser = interrupteur({ libelle: 'Normaliser', texte: 'Normaliser', variante: 'temoin', actif: false, aide: 'Monte le volume pour que la crête atteigne 0 dB.', surChange: a => { o = { ...o, normalize: a }; } });
  const barre = h('span', { class: 'ex-barre' });
  const progression = h('div', { class: 'ex-progression', role: 'progressbar', 'aria-label': 'Progression de l\'export', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0, hidden: true }, barre);
  const etat = h('p', { class: 'ex-etat doux', role: 'status' });

  const d = dialogue({
    titre: 'Exporter en WAV',
    contenu: h('div', { class: 'ex-grille' },
      quoi.el, frequence.el, bits.el,
      h('div', { class: 'ex-champ' }, h('span', { class: 'liste-etiquette' }, 'Queue après la fin'), queue.el),
      h('div', { class: 'ex-champ' }, normaliser.el),
      progression, etat),
    actions: [
      { texte: 'Annuler', variante: 'discret', action: () => { if (enCours) { annule = true; etat.textContent = 'Annulation à la fin du rendu en cours…'; return false; } return true; } },
      { texte: 'Exporter', variante: 'principal', defaut: true, action: async () => {
        if (enCours) return false;
        if (o.mode.kind === 'morceau' && !aMorceau) { etat.textContent = 'L\'arrangement est vide : exportez le pattern, ou posez des clips d\'abord.'; return false; }
        enCours = true;
        progression.hidden = false;
        etat.textContent = 'Rendu en cours…';
        const t0 = performance.now();
        try {
          const blob = await renderWav(structuredClone(ctx.store.get()) as Project, ctx.echantillons.audio, o, r => {
            const pc = Math.round(r * 100);
            barre.style.width = `${pc}%`;
            progression.setAttribute('aria-valuenow', String(pc));
          });
          if (annule) { toast('Export annulé.'); return true; }
          const nom = o.mode.kind === 'pattern' ? `${p.name} - ${pattern?.name ?? 'pattern'}` : p.name;
          telecharger(blob, nomFichier(nom, 'wav'));
          toast(`WAV exporté en ${((performance.now() - t0) / 1000).toFixed(1).replace('.', ',')} s.`, 'ok');
          return true;
        } catch (e) {
          etat.textContent = `L'export a échoué : ${e instanceof Error ? e.message : String(e)}`;
          enCours = false;
          return false;
        }
      } },
    ],
  });
  void d;
}
