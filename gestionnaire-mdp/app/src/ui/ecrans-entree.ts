// Écrans avant l'ouverture du coffre : Accueil, Création, Déverrouillage.

import { estimateStrength } from '@cadenas/core';
import { bouton, champ, champMotDePasse, encart, jaugeForce, logo } from './components';
import type { Contexte } from './contexte';
import { messageErreur } from './contexte';
import { h } from './dom';
import { icone } from './icons';

/** Mot de passe maître accepté : score zxcvbn ≥ 3, ou phrase de passe d'au moins 5 mots (PLAN §E). */
export function maitreAcceptable(mdp: string): boolean {
  if (!mdp) return false;
  const mots = mdp.split(/[\s\-_.,;:/+]+/).filter(m => /\p{L}{3,}/u.test(m));
  return mots.length >= 5 || estimateStrength(mdp).score >= 3;
}

// ---------- Accueil ----------

export function ecranAccueil(ctx: Contexte): HTMLElement {
  const erreur = h('div', { class: 'erreur', role: 'alert' });
  const ouvrir = async () => {
    erreur.textContent = '';
    try { await ctx.backend.openFile(); await ctx.rafraichir(); } catch (e) { erreur.textContent = messageErreur(e); }
  };
  return h('main', { class: 'ecran centre' },
    h('div', { class: 'carte-centre' },
      h('div', { class: 'entete' }, logo(), h('h1', null, 'Bienvenue dans Cadenas'),
        h('p', { class: 'doux' }, 'Vos mots de passe dans un fichier chiffré que vous gardez où vous voulez. Compatible KeePassXC, KeePassDX et KeePassium.')),
      h('div', { class: 'choix-accueil' },
        h('button', { type: 'button', class: 'btn principal', onclick: () => ctx.allerCreation() }, icone('plus'),
          h('span', null, 'Créer un coffre', h('small', null, 'Un nouveau fichier .kdbx protégé par un mot de passe maître.'))),
        h('button', { type: 'button', class: 'btn', onclick: () => { void ouvrir(); } }, icone('dossier'),
          h('span', null, 'Ouvrir un coffre existant', h('small', null, 'Un fichier .kdbx créé par Cadenas, KeePass ou KeePassXC.')))),
      erreur,
      h('p', { class: 'pied-centre' }, 'Rien ne quitte cet appareil : aucun compte, aucun serveur.')));
}

// ---------- Création ----------

export function ecranCreation(ctx: Contexte): HTMLElement {
  const nom = champ({ etiquette: 'Nom du coffre', valeur: 'Personnel', requis: true });
  const mdp = champMotDePasse({ etiquette: 'Mot de passe maître', requis: true, autocomplete: 'new-password',
    aide: 'Une phrase de cinq mots ou plus est facile à retenir et très difficile à deviner.' });
  const conf = champMotDePasse({ etiquette: 'Confirmez le mot de passe maître', requis: true, autocomplete: 'new-password' });
  const force = h('div', { 'aria-live': 'polite' });
  const accord = h('input', { type: 'checkbox', required: true });
  const erreur = h('div', { class: 'erreur', role: 'alert' });
  const creer = bouton({ texte: 'Créer le coffre', variante: 'principal', type: 'submit', classe: 'large' });

  const majForce = () => {
    const v = mdp.entree.value;
    if (!v) { force.replaceChildren(); return; }
    const f = estimateStrength(v);
    const ok = maitreAcceptable(v);
    force.replaceChildren(h('div', { class: 'pile' },
      jaugeForce(f.score, `${ok ? 'Suffisant' : 'Trop faible'} · temps pour le deviner : ${f.crackTime}`),
      !ok && f.warning ? h('div', { class: 'aide' }, f.warning) : null));
  };
  mdp.entree.addEventListener('input', majForce);

  const form = h('form', { class: 'carte-centre large formulaire', novalidate: true },
    h('div', { class: 'entete' }, logo(), h('h1', null, 'Créer un coffre'),
      h('p', { class: 'doux' }, 'Le coffre est chiffré en AES-256 au format KDBX 4, avec une clé dérivée par Argon2id.')),
    nom.bloc, h('div', null, mdp.bloc, force), conf.bloc,
    encart('alerte', h('b', null, 'Aucune récupération possible. '),
      'Si vous oubliez le mot de passe maître, personne ne pourra ouvrir ce coffre, pas même nous. Notez-le sur papier et rangez-le en lieu sûr.'),
    h('label', { class: 'case' }, accord, 'J\'ai compris qu\'aucune récupération n\'est possible.'),
    erreur, creer,
    h('p', { class: 'pied-centre' }, h('button', { type: 'button', class: 'lien-btn', onclick: () => ctx.allerAccueil() }, 'Retour')));

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    erreur.textContent = ''; nom.erreur(''); mdp.erreur(''); conf.erreur('');
    if (!nom.entree.value.trim()) { nom.erreur('Donnez un nom au coffre.'); nom.entree.focus(); return; }
    if (!maitreAcceptable(mdp.entree.value)) { mdp.erreur('Mot de passe maître trop faible : utilisez une phrase de 5 mots ou plus.'); mdp.entree.focus(); return; }
    if (mdp.entree.value !== conf.entree.value) { conf.erreur('Les deux mots de passe ne sont pas identiques.'); conf.entree.focus(); return; }
    if (!accord.checked) { erreur.textContent = 'Cochez la case pour confirmer.'; accord.focus(); return; }
    creer.disabled = true;
    creer.replaceChildren(icone('horloge'), h('span', null, 'Création et chiffrement…'));
    try {
      await ctx.backend.create(nom.entree.value.trim(), mdp.entree.value);
      mdp.entree.value = ''; conf.entree.value = '';
      await ctx.rafraichir();
    } catch (e) {
      erreur.textContent = messageErreur(e);
      creer.disabled = false;
      creer.replaceChildren(h('span', null, 'Créer le coffre'));
    }
  });
  queueMicrotask(() => nom.entree.focus());
  return h('main', { class: 'ecran centre' }, form);
}

// ---------- Déverrouillage ----------

export function ecranVerrou(ctx: Contexte, nomCoffre: string, fichier?: string): HTMLElement {
  const mdp = champMotDePasse({ etiquette: 'Mot de passe maître', autocomplete: 'current-password' });
  mdp.bloc.querySelector('.etiquette')?.classList.add('lecteur');
  mdp.entree.placeholder = 'Mot de passe maître';
  const erreur = h('div', { class: 'erreur', role: 'alert' });
  const ok = bouton({ texte: 'Déverrouiller', variante: 'principal', type: 'submit', classe: 'large' });

  const form = h('form', { class: 'carte-centre', autocomplete: 'off' },
    h('div', { class: 'entete' }, logo(), h('h1', null, 'Coffre verrouillé'),
      h('p', { class: 'fichier-ouvert' }, icone('fichier'), h('span', { class: 'mono' }, fichier ?? nomCoffre), ' · KDBX 4 · Argon2id')),
    mdp.bloc, erreur, ok,
    ctx.indiceDemo && h('p', { class: 'pied-centre' }, 'Pour la démo, le mot de passe maître est ', h('b', { class: 'mono' }, ctx.indiceDemo), '.'),
    h('p', { class: 'pied-centre' }, h('button', { type: 'button', class: 'lien-btn', onclick: async () => {
      try { await ctx.backend.openFile(); await ctx.rafraichir(); } catch (e) { erreur.textContent = messageErreur(e); }
    } }, 'Ouvrir un autre coffre')));

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!mdp.entree.value) { mdp.entree.focus(); return; }
    erreur.textContent = '';
    ok.disabled = true;
    ok.replaceChildren(icone('horloge'), h('span', null, 'Déverrouillage…'));
    try {
      await ctx.backend.unlock(mdp.entree.value);
      mdp.entree.value = '';
      await ctx.rafraichir();
    } catch (e) {
      erreur.textContent = messageErreur(e);
      ok.disabled = false;
      ok.replaceChildren(h('span', null, 'Déverrouiller'));
      mdp.entree.select();
    }
  });
  queueMicrotask(() => mdp.entree.focus());
  return h('main', { class: 'ecran centre' }, form);
}
