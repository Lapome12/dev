// Éditeur d'entrée (création et modification), avec générateur intégré et jauge de force.

import { estimateStrength } from '@cadenas/core';
import type { CustomField, EntryDetail, EntryInput, GroupInfo, Id, VaultBackend } from '../backend';
import { bouton, champ, champMotDePasse, jaugeForce } from './components';
import { messageErreur } from './contexte';
import { h } from './dom';
import { ouvrirGenerateur, generer } from './generateur';

export interface OptionsEditeur {
  backend: VaultBackend;
  groupes: GroupInfo[];
  /** Entrée à modifier ; absente pour une création. */
  entree?: EntryDetail;
  groupeParDefaut: Id;
  surFin(id: Id | null): void;
}

/** Vérifie une graine 2FA : URI otpauth://totp/… ou clé base32 seule. Renvoie l'URI normalisée. */
export function normaliserTotp(saisie: string, titre: string): string | null {
  const v = saisie.trim();
  if (!v) return '';
  if (/^otpauth:\/\/totp\//i.test(v)) {
    try { const u = new URL(v); return u.searchParams.get('secret') ? v : null; } catch { return null; }
  }
  const cle = v.replace(/[\s-]/g, '').toUpperCase();
  if (/^[A-Z2-7]{16,}=*$/.test(cle)) return `otpauth://totp/${encodeURIComponent(titre || 'Cadenas')}?secret=${cle}&period=30&digits=6&algorithm=SHA1`;
  return null;
}

export async function editeurEntree(o: OptionsEditeur): Promise<HTMLElement> {
  const e = o.entree;
  const [mdpActuel, otpActuel, champsActuels] = e
    ? await Promise.all([
      o.backend.getSecret(e.id, 'password'),
      e.hasTotp ? o.backend.getSecret(e.id, { field: 'otp' }) : Promise.resolve(''),
      Promise.all(e.fields.map(async f => ({ ...f, value: f.protected ? await o.backend.getSecret(e.id, { field: f.key }) : f.value }))),
    ])
    : ['', '', [] as CustomField[]];

  const titre = champ({ etiquette: 'Titre', valeur: e?.title ?? '', requis: true });
  const groupe = h('select', { 'aria-label': 'Groupe' },
    ...o.groupes.filter(g => !g.isRecycleBin).map(g => h('option', { value: g.id, selected: g.id === (e?.groupId ?? o.groupeParDefaut) }, g.parentId === null ? `${g.name} (racine)` : g.name)));
  const ident = champ({ etiquette: 'Identifiant', valeur: e?.username ?? '', autocomplete: 'off' });
  const force = h('div', { class: 'aide', 'aria-live': 'polite' });
  const boutonGen = bouton({ icone: 'de', variante: 'discret', libelle: 'Générer un mot de passe' });
  const mdp = champMotDePasse({ etiquette: 'Mot de passe', valeur: mdpActuel, outils: [boutonGen], autocomplete: 'new-password' });
  const url = champ({ etiquette: 'Adresse du site', valeur: e?.url ?? '', type: 'url', placeholder: 'https://exemple.fr', aide: 'Cadenas ne remplit que sur cette adresse exacte (schéma, domaine et port).' });
  const totp = champ({ etiquette: 'Code 2FA (clé secrète ou lien otpauth://)', valeur: otpActuel, mono: true, aide: 'Facultatif. Format compatible KeePassXC.' });
  const tags = champ({ etiquette: 'Étiquettes', valeur: e?.tags.join(', ') ?? '', placeholder: 'travail, important', aide: 'Séparées par des virgules.' });
  const notes = champ({ etiquette: 'Notes', valeur: e?.notes ?? '', multiligne: true });
  const erreur = h('div', { class: 'erreur', role: 'alert' });

  const majForce = () => {
    const v = mdp.entree.value;
    force.replaceChildren(v ? jaugeForce(estimateStrength(v).score) : '');
  };
  mdp.entree.addEventListener('input', majForce);
  boutonGen.addEventListener('click', () => ouvrirGenerateur({ surUtiliser: v => { mdp.entree.value = v; mdp.entree.type = 'text'; majForce(); } }));
  if (!e) { mdp.entree.value = generer(); majForce(); } else majForce();

  // Champs personnalisés
  const listeChamps = h('div', { class: 'pile' });
  const ajouterChamp = (f: CustomField = { key: '', value: '', protected: false }) => {
    const cle = h('input', { 'aria-label': 'Nom du champ', placeholder: 'Nom', value: f.key });
    const val = h('input', { 'aria-label': 'Valeur du champ', placeholder: 'Valeur', value: f.value, type: f.protected ? 'password' : 'text', class: 'mono' });
    const prot = h('input', { type: 'checkbox', checked: f.protected, 'aria-label': 'Champ protégé (masqué)' });
    prot.addEventListener('change', () => { val.type = prot.checked ? 'password' : 'text'; });
    const ligne = h('div', { class: 'champ-perso', 'data-champ': '' },
      h('div', { class: 'champ' }, cle), h('div', { class: 'champ' }, val),
      h('label', { class: 'case', title: 'Masqué' }, prot, 'Masqué'),
      bouton({ icone: 'corbeille', variante: 'discret', libelle: 'Retirer ce champ', surClic: () => ligne.remove() }));
    listeChamps.appendChild(ligne);
  };
  champsActuels.forEach(f => ajouterChamp(f));

  const lireChamps = (): CustomField[] => Array.from(listeChamps.querySelectorAll<HTMLElement>('[data-champ]')).map(l => {
    const [cle, val, prot] = Array.from(l.querySelectorAll('input'));
    return { key: cle!.value.trim(), value: val!.value, protected: prot!.checked };
  }).filter(f => f.key);

  const enregistrer = bouton({ texte: e ? 'Enregistrer' : 'Ajouter', variante: 'principal', type: 'submit', icone: 'coche' });
  const form = h('form', { class: 'editeur formulaire', novalidate: true },
    h('div', { class: 'detail-tete' }, h('h1', null, e ? 'Modifier l\'entrée' : 'Nouvelle entrée')),
    titre.bloc,
    h('div', null, h('span', { class: 'etiquette' }, 'Groupe'), h('div', { class: 'champ' }, groupe)),
    ident.bloc,
    h('div', null, mdp.bloc, force),
    url.bloc, totp.bloc, tags.bloc, notes.bloc,
    h('div', { class: 'pile' }, h('span', { class: 'etiquette' }, 'Champs personnalisés'), listeChamps,
      h('div', null, bouton({ texte: 'Ajouter un champ', icone: 'plus', classe: 'petit', surClic: () => ajouterChamp() }))),
    erreur,
    h('div', { class: 'pied' }, bouton({ texte: 'Annuler', surClic: () => o.surFin(e?.id ?? null) }), enregistrer));

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    titre.erreur(''); url.erreur(''); totp.erreur(''); erreur.textContent = '';
    if (!titre.entree.value.trim()) { titre.erreur('Donnez un titre à l\'entrée.'); titre.entree.focus(); return; }
    const adresse = url.entree.value.trim();
    if (adresse && !/^[a-z][a-z0-9+.-]*:\/\//i.test(adresse)) { url.erreur('Adresse invalide : commencez par https://'); url.entree.focus(); return; }
    const uriTotp = normaliserTotp(totp.entree.value, titre.entree.value.trim());
    if (uriTotp === null) { totp.erreur('Clé 2FA invalide : collez la clé base32 ou le lien otpauth:// donné par le site.'); totp.entree.focus(); return; }
    const saisie: EntryInput = {
      groupId: groupe.value, title: titre.entree.value.trim(), username: ident.entree.value, password: mdp.entree.value,
      url: adresse, notes: notes.entree.value,
      // Convention core : '' supprime la 2FA ; en création, une chaîne vide n'en ajoute simplement pas.
      totpUri: uriTotp,
      tags: tags.entree.value.split(',').map(t => t.trim()).filter(Boolean), fields: lireChamps(),
    };
    enregistrer.disabled = true;
    try {
      if (e) { await o.backend.updateEntry(e.id, saisie); o.surFin(e.id); }
      else o.surFin(await o.backend.addEntry(saisie));
    } catch (err) {
      erreur.textContent = messageErreur(err);
      enregistrer.disabled = false;
    }
  });
  queueMicrotask(() => titre.entree.focus());
  return form;
}
