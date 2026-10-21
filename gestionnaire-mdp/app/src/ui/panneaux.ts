// Panneaux latéraux : Santé du coffre et Réglages.

import type { HealthReport, Id, Settings } from '../backend';
import { bouton, onglets, ouvrirDialogue, pastille, toast } from './components';
import type { Contexte } from './contexte';
import { messageErreur } from './contexte';
import { h } from './dom';
import { icone } from './icons';

// ---------- Santé ----------

export function ouvrirSante(rapport: HealthReport, surRevoir: (titre: string, ids: Id[]) => void): void {
  const ligne = (n: number, ton: 'danger' | 'alerte', titre: string, sous: string, ids: Id[]) =>
    h('button', { type: 'button', class: 'sante-ligne', disabled: !n, onclick: () => { d.fermer(); surRevoir(titre, ids); } },
      pastille(n, ton), h('span', { class: 'txt' }, titre, h('small', null, n ? sous : 'Rien à signaler.')),
      n ? icone('suivant', 'doux') : null);
  const reutilisees = rapport.reused.flat();
  const d = ouvrirDialogue({
    titre: 'Santé du coffre', panneau: true,
    contenu: h('div', { class: 'gen' },
      h('div', { class: 'sante-score' }, h('b', null, rapport.score), h('span', { class: 'doux' }, 'sur 100')),
      h('p', { class: 'doux' }, 'Calculé sur votre appareil, sans rien envoyer en ligne.'),
      h('div', { class: 'sante-liste' },
        ligne(rapport.weak.length, 'danger', 'Mots de passe faibles', 'Faciles à deviner. Remplacez-les par un mot de passe généré.', rapport.weak),
        ligne(rapport.reused.length, 'alerte', 'Mots de passe réutilisés',
          `${reutilisees.length} entrées partagent ${rapport.reused.length > 1 ? `${rapport.reused.length} mots de passe` : 'un même mot de passe'}. Une fuite sur un site ouvre les autres.`, reutilisees),
        ligne(rapport.old.length, 'alerte', 'Plus d\'un an sans changement', 'À renouveler en priorité pour les comptes importants.', rapport.old),
        ligne(rapport.withoutPassword.length, 'alerte', 'Sans mot de passe', 'Entrées dont le mot de passe est vide.', rapport.withoutPassword))),
  });
}

// ---------- Réglages ----------

export async function ouvrirReglages(ctx: Contexte, o: { estDemo: boolean; actionsSupplementaires?: HTMLElement[] }): Promise<void> {
  const r = await ctx.backend.getSettings();
  const enregistrer = async (s: Partial<Settings>) => {
    try { await ctx.backend.setSettings(s); } catch (e) { toast(messageErreur(e)); }
  };
  const selection = (libelle: string, valeurs: [number, string][], courant: number, surChange: (v: number) => void) => {
    const sel = h('select', { 'aria-label': libelle }, ...valeurs.map(([v, t]) => h('option', { value: v, selected: v === courant }, t)));
    sel.addEventListener('change', () => surChange(Number(sel.value)));
    return h('div', null, h('span', { class: 'etiquette' }, libelle), h('div', { class: 'champ' }, sel));
  };
  const partage = 'share' in navigator && matchMedia('(pointer: coarse)').matches;
  const exporter = bouton({ texte: partage ? 'Partager une copie du coffre (.kdbx)' : 'Télécharger une copie du coffre (.kdbx)', icone: partage ? 'partager' : 'telecharger', surClic: async () => {
    try { await ctx.backend.exportFile(); toast(partage ? 'Copie chiffrée prête' : 'Copie chiffrée téléchargée'); } catch (e) { const m = messageErreur(e); if (m) toast(m); }
  } });

  ouvrirDialogue({
    titre: 'Réglages', panneau: true,
    contenu: h('div', { class: 'gen' },
      h('div', null, h('span', { class: 'etiquette' }, 'Thème'),
        onglets('Thème', [{ valeur: 'systeme', texte: 'Système' }, { valeur: 'clair', texte: 'Clair' }, { valeur: 'sombre', texte: 'Sombre' }], r.theme,
          v => { ctx.appliquerTheme(v); void enregistrer({ theme: v }); })),
      selection('Verrouillage automatique après inactivité',
        [[1, '1 minute'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 heure']],
        r.autoLockMinutes, v => { void enregistrer({ autoLockMinutes: v }); }),
      selection('Effacement du presse-papiers', [[10, '10 secondes'], [20, '20 secondes'], [30, '30 secondes'], [60, '1 minute'], [90, '90 secondes']],
        r.clipboardSeconds, v => { void enregistrer({ clipboardSeconds: v }); }),
      h('div', { class: 'pile' }, h('h3', null, 'Coffre'), exporter, ...(o.actionsSupplementaires ?? []),
        o.estDemo ? h('p', { class: 'aide' }, 'Démo : l\'export et l\'enregistrement sur disque sont désactivés.') : null),
      h('p', { class: 'aide' }, 'Raccourcis clavier : appuyez sur ', h('kbd', { class: 'mono' }, '?'), ' dans le coffre.'),
      h('div', { class: 'pile' }, h('h3', null, 'Compatibilité'),
        h('p', { class: 'aide' }, 'Le fichier .kdbx s\'ouvre aussi dans KeePassXC (ordinateur), KeePassDX (Android) et KeePassium (iPhone). Pour synchroniser, placez-le dans un dossier synchronisé (Syncthing, Nextcloud, Drive).'))),
  });
}
