// Fichier clé (KeePass XML v2, .keyx) : choix d'un fichier existant ou génération par core.
// Le contenu ne quitte jamais la mémoire de la page, sauf le téléchargement demandé par l'utilisateur.

import { generateKeyFile } from '@cadenas/core';
import { bouton, encart } from './components';
import { h } from './dom';
import { icone } from './icons';

const TAILLE_MAX = 1024 * 1024; // un fichier clé fait quelques centaines d'octets

export function lireFichier(accept: string, tailleMax = TAILLE_MAX): Promise<File> {
  return new Promise((resoudre, rejeter) => {
    const input = h('input', { type: 'file', accept });
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) { rejeter(new DOMException('Aucun fichier choisi.', 'AbortError')); return; }
      if (f.size > tailleMax) { rejeter(new Error(`Fichier trop volumineux (${Math.round(f.size / 1024)} Kio).`)); return; }
      resoudre(f);
    });
    input.addEventListener('cancel', () => rejeter(new DOMException('Aucun fichier choisi.', 'AbortError')));
    input.click();
  });
}

export function telechargerOctets(octets: Uint8Array, nom: string, type = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([octets as BlobPart], { type }));
  const a = h('a', { href: url, download: nom, rel: 'noopener' });
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface ChoixFichierCle {
  el: HTMLElement;
  /** Octets du fichier clé choisi ou généré, ou undefined. */
  valeur(): Uint8Array | undefined;
  vider(): void;
}

/**
 * Bloc « Fichier clé (facultatif) ». `generer` ajoute un bouton qui crée un nouveau fichier clé
 * et le télécharge aussitôt (création d'un coffre, changement de clé).
 */
export function choixFichierCle(o: { generer?: boolean; nomSuggere?: () => string } = {}): ChoixFichierCle {
  let octets: Uint8Array | undefined;
  const etat = h('span', { class: 'doux petit' }, 'Aucun');
  const erreur = h('div', { class: 'erreur', role: 'alert' });
  const retirer = bouton({ icone: 'fermer', variante: 'discret', libelle: 'Retirer le fichier clé', classe: 'petit' });
  retirer.hidden = true;
  const avis = h('div');

  const definir = (o2: Uint8Array | undefined, libelle: string) => {
    octets?.fill(0);
    octets = o2;
    etat.textContent = libelle;
    etat.classList.toggle('doux', !o2);
    retirer.hidden = !o2;
  };
  retirer.addEventListener('click', () => { definir(undefined, 'Aucun'); avis.replaceChildren(); });

  const choisir = bouton({ texte: 'Choisir…', icone: 'cle', classe: 'petit', surClic: async () => {
    erreur.textContent = '';
    try {
      const f = await lireFichier('.keyx,.key,.xml,*/*');
      definir(new Uint8Array(await f.arrayBuffer()), f.name);
      avis.replaceChildren();
    } catch (e) { if (!(e instanceof DOMException)) erreur.textContent = (e as Error).message; }
  } });

  const generer = o.generer ? bouton({ texte: 'Générer', icone: 'de', classe: 'petit', surClic: async () => {
    const nouveau = await generateKeyFile();
    const base = (o.nomSuggere?.() ?? 'cadenas').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const nom = `${base || 'cadenas'}.keyx`;
    telechargerOctets(nouveau, nom, 'application/xml');
    definir(nouveau, `${nom} (nouveau, téléchargé)`);
    avis.replaceChildren(encart('alerte', h('b', null, 'Gardez une copie de ce fichier clé. '),
      'Sans lui, le coffre ne s\'ouvrira plus, même avec le bon mot de passe. Ne le placez pas dans le même dossier synchronisé que le coffre.'));
  } }) : null;

  const el = h('div', { class: 'pile' },
    h('span', { class: 'etiquette' }, 'Fichier clé (facultatif)'),
    h('div', { class: 'groupe-btn fichier-cle' }, icone('cle', 'doux'), etat, retirer, h('span', { class: 'espace' }), choisir, generer),
    erreur, avis);
  return { el, valeur: () => octets, vider: () => definir(undefined, 'Aucun') };
}
