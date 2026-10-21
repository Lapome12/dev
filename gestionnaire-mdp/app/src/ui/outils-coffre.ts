// Boîtes « Changer le mot de passe maître » et « Importer » (étape 3.6b).

import { estimateStrength, importCsv, VaultError, type CsvFormat, type ImportedEntry } from '@cadenas/core';
import type { GroupInfo, Id, VaultBackend } from '../backend';
import { bouton, champMotDePasse, encart, jaugeForce, ouvrirDialogue, toast } from './components';
import { messageErreur } from './contexte';
import { h } from './dom';
import { maitreAcceptable } from './ecrans-entree';
import { choixFichierCle, lireFichier } from './fichier-cle';

// ---------- Mot de passe maître et fichier clé ----------

export function ouvrirChangementCle(backend: VaultBackend, nomCoffre: string, surFin: () => void): void {
  const actuel = champMotDePasse({ etiquette: 'Mot de passe maître actuel', autocomplete: 'current-password' });
  const cleActuelle = choixFichierCle();
  const mdp = champMotDePasse({ etiquette: 'Nouveau mot de passe maître', autocomplete: 'new-password' });
  const conf = champMotDePasse({ etiquette: 'Confirmez le nouveau mot de passe', autocomplete: 'new-password' });
  const force = h('div', { 'aria-live': 'polite' });
  const cle = choixFichierCle({ generer: true, nomSuggere: () => nomCoffre });
  const erreur = h('div', { class: 'erreur', role: 'alert' });
  mdp.entree.addEventListener('input', () => {
    const v = mdp.entree.value;
    force.replaceChildren(v ? jaugeForce(estimateStrength(v).score, maitreAcceptable(v) ? 'Suffisant' : 'Trop faible') : '');
  });
  const valider = bouton({ texte: 'Changer la clé', variante: 'principal', surClic: async () => {
    actuel.erreur(''); mdp.erreur(''); conf.erreur(''); erreur.textContent = '';
    if (!actuel.entree.value) { actuel.erreur('Saisissez le mot de passe maître actuel.'); actuel.entree.focus(); return; }
    if (!maitreAcceptable(mdp.entree.value)) { mdp.erreur('Trop faible : utilisez une phrase de 5 mots ou plus.'); mdp.entree.focus(); return; }
    if (mdp.entree.value !== conf.entree.value) { conf.erreur('Les deux mots de passe ne sont pas identiques.'); conf.entree.focus(); return; }
    valider.disabled = true;
    try {
      await backend.changeMasterKey(mdp.entree.value, cle.valeur(), { password: actuel.entree.value, keyFile: cleActuelle.valeur() });
      actuel.entree.value = ''; mdp.entree.value = ''; conf.entree.value = '';
      d.fermer();
      toast('Clé du coffre changée');
      surFin();
    } catch (e) {
      valider.disabled = false;
      if (e instanceof VaultError && e.code === 'mauvais-mot-de-passe') {
        actuel.erreur('Mot de passe actuel ou fichier clé actuel incorrect. Rien n\'a été changé.');
        actuel.entree.select(); actuel.entree.focus();
      } else erreur.textContent = messageErreur(e);
    }
  } });
  const d = ouvrirDialogue({
    titre: 'Changer le mot de passe maître',
    contenu: h('div', { class: 'formulaire' },
      actuel.bloc,
      h('details', { class: 'option' }, h('summary', null, 'Le coffre utilise aussi un fichier clé'), cleActuelle.el),
      h('div', null, mdp.bloc, force), conf.bloc, cle.el,
      encart('alerte', 'Les copies plus anciennes du coffre (sauvegardes, autres appareils) gardent l\'ancien mot de passe. Aucune récupération n\'est possible si vous oubliez le nouveau.'),
      erreur),
    pied: [bouton({ texte: 'Annuler', surClic: () => d.fermer() }), valider],
    surFermeture: () => { actuel.entree.value = ''; mdp.entree.value = ''; conf.entree.value = ''; cle.vider(); cleActuelle.vider(); },
  });
  actuel.entree.focus();
}

// ---------- Import CSV ----------

const FORMATS: { valeur: CsvFormat; texte: string; aide: string }[] = [
  { valeur: 'chrome', texte: 'Chrome, Opera, Edge, Brave', aide: 'Paramètres > Mots de passe > Exporter les mots de passe.' },
  { valeur: 'bitwarden', texte: 'Bitwarden (CSV)', aide: 'Outils > Exporter le coffre > format .csv.' },
  { valeur: 'keepassxc', texte: 'KeePassXC (CSV)', aide: 'Base de données > Exporter > Fichier CSV.' },
];

/** Crée (ou retrouve) les groupes d'un chemin « Banque/Pro » sous la racine ; renvoie l'id du dernier. */
export async function groupePourChemin(backend: VaultBackend, groupes: GroupInfo[], racine: Id, chemin: string): Promise<Id> {
  let parent = racine;
  for (const nom of chemin.split('/').map(s => s.trim()).filter(Boolean)) {
    const existant = groupes.find(g => g.parentId === parent && !g.isRecycleBin && g.name === nom);
    if (existant) { parent = existant.id; continue; }
    const id = await backend.addGroup(nom, parent);
    groupes.push({ id, name: nom, parentId: parent, isRecycleBin: false });
    parent = id;
  }
  return parent;
}

export function ouvrirImport(backend: VaultBackend, surFin: () => void): void {
  let format: CsvFormat = 'chrome';
  let entrees: ImportedEntry[] = [];
  let nomFichier = '';
  const aide = h('p', { class: 'aide' }, FORMATS[0]!.aide);
  const sel = h('select', { 'aria-label': 'Exporté depuis' }, ...FORMATS.map(f => h('option', { value: f.valeur }, f.texte)));
  const apercu = h('div', { 'aria-live': 'polite' });
  const erreur = h('div', { class: 'erreur', role: 'alert' });
  const importer = bouton({ texte: 'Importer', variante: 'principal', desactive: true });

  const analyser = (texte: string) => {
    erreur.textContent = ''; entrees = []; importer.disabled = true; apercu.replaceChildren();
    try {
      entrees = importCsv(texte, format);
    } catch (e) { erreur.textContent = `Lecture impossible : ${messageErreur(e)}`; return; }
    if (!entrees.length) { erreur.textContent = 'Aucune entrée trouvée dans ce fichier.'; return; }
    const dossiers = new Set(entrees.map(e => e.groupPath).filter(Boolean));
    apercu.replaceChildren(encart('', h('b', null, `${entrees.length} entrée${entrees.length > 1 ? 's' : ''} prête${entrees.length > 1 ? 's' : ''} à importer`),
      ` depuis ${nomFichier}`, dossiers.size ? `, dans ${dossiers.size} dossier${dossiers.size > 1 ? 's' : ''}.` : ', dans un groupe « Importé ».'));
    importer.disabled = false;
  };
  let texteCsv = '';
  sel.addEventListener('change', () => {
    format = sel.value as CsvFormat;
    aide.textContent = FORMATS.find(f => f.valeur === format)!.aide;
    if (texteCsv) analyser(texteCsv);
  });
  const choisir = bouton({ texte: 'Choisir le fichier CSV…', icone: 'importer', surClic: async () => {
    try {
      const f = await lireFichier('.csv,text/csv', 50 * 1024 * 1024);
      nomFichier = f.name;
      texteCsv = await f.text();
      analyser(texteCsv);
    } catch (e) { if (!(e instanceof DOMException)) erreur.textContent = messageErreur(e); }
  } });

  importer.addEventListener('click', async () => {
    importer.disabled = true;
    try {
      const groupes = await backend.listGroups();
      const racine = groupes.find(g => g.parentId === null);
      if (!racine) throw new Error('Groupe racine introuvable.');
      const cache = new Map<string, Id>();
      let n = 0;
      for (const e of entrees) {
        const chemin = e.groupPath || 'Importé';
        let groupId = cache.get(chemin);
        if (!groupId) { groupId = await groupePourChemin(backend, groupes, racine.id, chemin); cache.set(chemin, groupId); }
        const { groupPath: _chemin, ...saisie } = e;
        await backend.addEntry({ ...saisie, groupId });
        n++;
        if (n % 25 === 0) importer.replaceChildren(h('span', null, `Import… ${n}/${entrees.length}`));
      }
      texteCsv = ''; entrees = [];
      d.fermer();
      toast(`${n} entrée${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}. Supprimez maintenant le fichier CSV : il n'est pas chiffré.`, { duree: 6000 });
      surFin();
    } catch (e) {
      erreur.textContent = messageErreur(e);
      importer.disabled = false;
      importer.replaceChildren(h('span', null, 'Importer'));
    }
  });

  const d = ouvrirDialogue({
    titre: 'Importer des mots de passe',
    contenu: h('div', { class: 'formulaire' },
      h('div', null, h('span', { class: 'etiquette' }, 'Exporté depuis'), h('div', { class: 'champ' }, sel), aide),
      h('div', null, choisir), apercu, erreur,
      encart('alerte', 'Un export CSV contient vos mots de passe en clair. Après l\'import, supprimez-le et videz la corbeille de votre ordinateur.')),
    pied: [bouton({ texte: 'Annuler', surClic: () => d.fermer() }), importer],
    surFermeture: () => { texteCsv = ''; entrees = []; },
  });
}
