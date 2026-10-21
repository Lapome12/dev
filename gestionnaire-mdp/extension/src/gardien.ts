// Logique du gardien, sans chrome.* ni DOM (testée avec Vitest). offscreen.ts la
// branche sur chrome.runtime, IndexedDB et le presse-papiers.
//
// Règles :
// - le coffre déverrouillé (objet Vault de core) n'existe qu'ici, en mémoire ;
// - un secret ne sort que vers vault.html ou popup.html (getSecret), ou vers
//   le service worker pour remplir une page (interne/identifiants) ;
// - verrouillage automatique après `autoLockMinutes` sans demande d'une page ;
// - presse-papiers effacé après `clipboardSeconds`.
import type { EntryInput, Id, KdfOptions, SecretKind, Vault } from '@cadenas/core';
import { base64VersOctets, ErreurCadenas, secretAutorise, type MessageGardien } from './messages';
import { REGLAGES_DEFAUT, type Reglages } from './reglages';
import type { Stockage } from './storage';

/** Même forme que `VaultState` du contrat §D.2 (app/src/backend.ts). */
export type EtatCoffre =
  | { state: 'aucun-coffre' }
  | { state: 'verrouille'; name: string; fileName?: string }
  | { state: 'deverrouille'; name: string; fileName?: string; dirty: boolean; lastSaved?: number };

/** Ce que le gardien utilise de core : `Vault` et `calibrateKdf`. */
export interface Coeur {
  create(name: string, password: string, keyFile?: Uint8Array, kdf?: KdfOptions): Promise<Vault>;
  open(file: ArrayBuffer, password: string, keyFile?: Uint8Array): Promise<Vault>;
  calibrateKdf(): Promise<KdfOptions>;
}

export interface CodeTotp {
  code: string;
  period: number;
  remaining: number;
}

export interface DependancesGardien {
  coeur: Coeur;
  stockage: Stockage;
  /** Écrit dans le presse-papiers (chaîne vide pour l'effacer). */
  copier(texte: string): void;
  /** Prévient les pages ouvertes d'un changement d'état. */
  diffuser(etat: EtatCoffre): void;
  maintenant(): number;
  programmer(fn: () => void, ms: number): unknown;
  annuler(minuterie: unknown): void;
}

/** Identifiants remis au service worker pour remplir une page (fill/run). */
export interface Identifiants {
  /** URL des cadres où le remplissage est autorisé. */
  urls: string[];
  username: string;
  password: string;
}

const DELAI_SAUVEGARDE_MS = 1000;

export class Gardien {
  #coffre: Vault | null = null;
  #nom = '';
  #nomFichier: string | undefined;
  #modifie = false;
  #enregistre: number | undefined;
  #existe = false;
  #reglages: Reglages = { ...REGLAGES_DEFAUT };
  #derniereActivite: number;
  #minuterieSauvegarde: unknown = null;
  #sauvegardeEnCours: Promise<boolean> | null = null;
  #minuteriePressePapiers: unknown = null;
  #pret: Promise<void>;

  constructor(private readonly d: DependancesGardien) {
    this.#derniereActivite = d.maintenant();
    this.#pret = this.#rechargerDepuisStockage();
  }

  async #rechargerDepuisStockage(): Promise<void> {
    const stocke = await this.d.stockage.lire();
    this.#existe = stocke !== null;
    this.#nom = stocke?.nom ?? '';
    this.#nomFichier = stocke?.nomFichier;
    this.#enregistre = stocke?.enregistre;
  }

  etat(): EtatCoffre {
    if (!this.#existe) return { state: 'aucun-coffre' };
    const fichier = this.#nomFichier !== undefined ? { fileName: this.#nomFichier } : {};
    if (!this.#coffre) return { state: 'verrouille', name: this.#nom, ...fichier };
    return {
      state: 'deverrouille',
      name: this.#nom,
      ...fichier,
      dirty: this.#modifie,
      ...(this.#enregistre !== undefined ? { lastSaved: this.#enregistre } : {}),
    };
  }

  #changer(): void {
    this.d.diffuser(this.etat());
  }

  #ouvert(): Vault {
    if (!this.#coffre) throw new ErreurCadenas('verrouille', 'Coffre verrouillé. Saisissez votre mot de passe maître.');
    return this.#coffre;
  }

  /** Après chaque modification : marquer et enregistrer peu après (chiffré). */
  #modification(): void {
    this.#modifie = true;
    if (this.#minuterieSauvegarde !== null) this.d.annuler(this.#minuterieSauvegarde);
    this.#minuterieSauvegarde = this.d.programmer(() => {
      this.#minuterieSauvegarde = null;
      void this.enregistrer().catch(() => undefined);
    }, DELAI_SAUVEGARDE_MS);
    this.#changer();
  }

  /** Chiffre et enregistre dans IndexedDB, puis dans le fichier si permis. Vrai si le fichier a été écrit. */
  async enregistrer(): Promise<boolean> {
    if (this.#sauvegardeEnCours) await this.#sauvegardeEnCours.catch(() => undefined);
    const coffre = this.#ouvert();
    if (this.#minuterieSauvegarde !== null) {
      this.d.annuler(this.#minuterieSauvegarde);
      this.#minuterieSauvegarde = null;
    }
    this.#sauvegardeEnCours = (async () => {
      const octets = await coffre.save();
      await this.d.stockage.ecrire(octets, this.#nom);
      this.#modifie = false;
      this.#existe = true;
      this.#enregistre = this.d.maintenant();
      const fichier = await this.d.stockage.ecrireDansFichier(octets).catch(() => false);
      this.#changer();
      return fichier;
    })();
    try {
      return await this.#sauvegardeEnCours;
    } finally {
      this.#sauvegardeEnCours = null;
    }
  }

  async verrouiller(): Promise<void> {
    if (!this.#coffre) return;
    // On ne perd jamais une modification : enregistrement chiffré avant de fermer.
    if (this.#modifie || this.#minuterieSauvegarde !== null) await this.enregistrer().catch(() => undefined);
    this.#coffre.close();
    this.#coffre = null;
    this.#modifie = false;
    this.#effacerPressePapiers();
    this.#changer();
  }

  /** Appelé régulièrement (alarme du service worker, minuterie locale). */
  async tic(): Promise<void> {
    if (!this.#coffre) return;
    const inactif = this.d.maintenant() - this.#derniereActivite;
    if (inactif >= this.#reglages.autoLockMinutes * 60_000) await this.verrouiller();
  }

  definirReglages(r: Partial<Reglages>): void {
    this.#reglages = { ...this.#reglages, ...r };
  }

  reglages(): Reglages {
    return { ...this.#reglages };
  }

  #copier(texte: string): void {
    this.d.copier(texte);
    if (this.#minuteriePressePapiers !== null) this.d.annuler(this.#minuteriePressePapiers);
    this.#minuteriePressePapiers = this.d.programmer(() => this.#effacerPressePapiers(), this.#reglages.clipboardSeconds * 1000);
  }

  #effacerPressePapiers(): void {
    if (this.#minuteriePressePapiers === null) return;
    this.d.annuler(this.#minuteriePressePapiers);
    this.#minuteriePressePapiers = null;
    // L'API ne permet pas de relire le presse-papiers sans la permission clipboardRead
    // (non demandée) : on l'efface donc sans vérifier s'il a changé entre-temps.
    this.d.copier('');
  }

  /** Point d'entrée unique : un message déjà validé par offscreen.ts. */
  async traiter(message: MessageGardien): Promise<unknown> {
    await this.#pret;
    const { type, args, page } = message;
    if (page !== undefined) this.#derniereActivite = this.d.maintenant();
    // Les demandes internes (dont les identifiants pour remplir) ne viennent jamais d'une page.
    if (type.startsWith('interne/') && page !== undefined) throw new ErreurCadenas('refuse', 'Demande refusée.');

    switch (type) {
      case 'interne/tic':
        return this.tic();
      case 'interne/verrouiller':
        return this.verrouiller();
      case 'interne/reglages':
        this.definirReglages(args[0] as Partial<Reglages>);
        return undefined;
      case 'interne/candidats':
        return this.#ouvert().findForUrl(String(args[0]));
      case 'interne/identifiants':
        return this.identifiants(String(args[0]), Array.isArray(args[1]) ? args[1].map(String) : [], String(args[2] ?? ''));
      default:
        break;
    }
    if (page === undefined) throw new ErreurCadenas('refuse', 'Demande refusée.');

    switch (type) {
      case 'vault/status':
        return this.etat();
      case 'vault/create':
        return this.creer(String(args[0]), String(args[1]), octetsOptionnels(args[2]));
      case 'vault/openFile':
        // vault.html a déjà placé le fichier choisi dans IndexedDB : on le prend en compte.
        if (this.#coffre) {
          this.#coffre.close();
          this.#coffre = null;
        }
        this.#modifie = false;
        await this.#rechargerDepuisStockage();
        this.#changer();
        return undefined;
      case 'vault/unlock':
        return this.deverrouiller(String(args[0]), octetsOptionnels(args[1]));
      case 'vault/lock':
        return this.verrouiller();
      case 'vault/save':
        return { fichierEcrit: await this.enregistrer() };
      case 'vault/exportFile':
        // La page lit ensuite le .kdbx chiffré dans IndexedDB et le télécharge.
        if (this.#modifie) await this.enregistrer();
        return undefined;
      case 'vault/listGroups':
        return this.#ouvert().listGroups();
      case 'vault/listEntries':
        return this.#ouvert().listEntries(args[0] === undefined || args[0] === null ? undefined : String(args[0]));
      case 'vault/search':
        return this.#ouvert().search(String(args[0]));
      case 'vault/getEntry':
        return this.#ouvert().getEntry(String(args[0]));
      case 'vault/getSecret':
        if (!secretAutorise(page, args[1])) throw new ErreurCadenas('refuse', 'Demande refusée.');
        return this.#secret(String(args[0]), args[1] as SecretKind);
      case 'vault/getTotp':
        return this.#totp(String(args[0]));
      case 'vault/copySecret':
        if (!secretAutorise(page, args[1])) throw new ErreurCadenas('refuse', 'Demande refusée.');
        this.#copier(await this.#secret(String(args[0]), args[1] as SecretKind));
        return undefined;
      case 'vault/addEntry': {
        const id = this.#ouvert().addEntry(args[0] as EntryInput);
        this.#modification();
        return id;
      }
      case 'vault/updateEntry':
        this.#ouvert().updateEntry(String(args[0]), args[1] as EntryInput);
        this.#modification();
        return undefined;
      case 'vault/deleteEntry':
        this.#ouvert().deleteEntry(String(args[0]));
        this.#modification();
        return undefined;
      case 'vault/addGroup': {
        const id = this.#ouvert().addGroup(String(args[0]), (args[1] ?? null) as Id | null);
        this.#modification();
        return id;
      }
      case 'vault/renameGroup':
        this.#ouvert().renameGroup(String(args[0]), String(args[1]));
        this.#modification();
        return undefined;
      case 'vault/deleteGroup':
        this.#ouvert().deleteGroup(String(args[0]));
        this.#modification();
        return undefined;
      case 'vault/changeMasterKey': {
        const coffre = this.#ouvert();
        await this.#verifierCleActuelle(coffre, args[2]);
        await coffre.changeMasterKey(String(args[0]), octetsOptionnels(args[1]));
        await this.enregistrer();
        return undefined;
      }
      case 'vault/health':
        return this.#ouvert().health();
      default:
        throw new ErreurCadenas('refuse', `Demande inconnue : ${type}`);
    }
  }

  /** Code TOTP du moment, calculé par core : la graine (otpauth://) ne sort pas. */
  #totp(id: string): Promise<CodeTotp> {
    return this.#ouvert().getTotp(id);
  }

  /** Contrat §D.2 : `'totp'` donne le code du moment ; la graine se lit avec `{ field: 'otp' }`. */
  async #secret(id: string, kind: SecretKind): Promise<string> {
    if (kind === 'totp') return (await this.#totp(id)).code;
    return this.#ouvert().getSecret(id, kind);
  }

  async creer(nom: string, motDePasse: string, fichierCle?: Uint8Array): Promise<void> {
    if (this.#coffre) await this.verrouiller();
    const kdf = await this.d.coeur.calibrateKdf();
    this.#coffre = await this.d.coeur.create(nom, motDePasse, fichierCle, kdf);
    this.#nom = nom;
    this.#nomFichier = undefined;
    this.#derniereActivite = this.d.maintenant();
    await this.enregistrer();
  }

  async deverrouiller(motDePasse: string, fichierCle?: Uint8Array): Promise<void> {
    const stocke = await this.d.stockage.lire();
    if (!stocke) throw new ErreurCadenas('introuvable', 'Aucun coffre à déverrouiller.');
    if (this.#coffre) return;
    this.#coffre = await this.d.coeur.open(stocke.octets, motDePasse, fichierCle);
    this.#nom = this.#coffre.name || stocke.nom;
    this.#nomFichier = stocke.nomFichier;
    this.#enregistre = stocke.enregistre;
    this.#modifie = false;
    this.#derniereActivite = this.d.maintenant();
    this.#changer();
  }

  /**
   * Identifiants pour remplir, et parmi les URL des cadres de l'onglet, celles où
   * l'entrée a le droit d'être remplie (règles de core : origine exacte, URL
   * principale ou supplémentaires). La page principale de l'onglet doit elle aussi
   * correspondre : une iframe légitime posée dans une page hostile n'est jamais
   * remplie (la page pourrait la recouvrir ou la déguiser). Sinon rien n'est remis.
   */
  identifiants(entryId: string, urlsCadres: string[], urlPrincipale: string): Identifiants {
    const coffre = this.#ouvert();
    const correspond = (url: string) => coffre.findForUrl(url).some((e) => e.id === entryId);
    if (!urlPrincipale || !correspond(urlPrincipale)) {
      throw new ErreurCadenas('refuse', 'Cette entrée ne correspond pas à ce site.');
    }
    const autorisees = urlsCadres.filter(correspond);
    if (autorisees.length === 0) throw new ErreurCadenas('refuse', 'Cette entrée ne correspond pas à ce site.');
    const entree = coffre.getEntry(entryId);
    return { urls: autorisees, username: entree.username, password: coffre.getSecret(entryId, 'password') };
  }

  /**
   * Revérifie la clé en vigueur avant de la changer : quelqu'un devant un coffre
   * ouvert ne doit pas pouvoir la remplacer sans la connaître.
   */
  async #verifierCleActuelle(coffre: Vault, actuelle: unknown): Promise<void> {
    const refus = () => new ErreurCadenas('mauvais-mot-de-passe', 'Clé actuelle incorrecte.');
    if (!actuelle || typeof actuelle !== 'object') throw refus();
    const { password, keyFile } = actuelle as { password?: unknown; keyFile?: unknown };
    if (typeof password !== 'string') throw refus();
    let verif: Vault;
    try {
      verif = await this.d.coeur.open(await coffre.save(), password, octetsOptionnels(keyFile));
    } catch {
      throw refus();
    }
    verif.close();
  }
}

function octetsOptionnels(v: unknown): Uint8Array | undefined {
  return typeof v === 'string' && v.length > 0 ? base64VersOctets(v) : undefined;
}
