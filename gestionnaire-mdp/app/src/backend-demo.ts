// DemoBackend : coffre fictif en mémoire, pour l'artefact de démo et les tests de l'interface.
// Rien n'est écrit nulle part : recharger la page remet la démo à zéro.
// Les calculs (force, TOTP) viennent de @cadenas/core, comme dans la vraie application.

import { estimateStrength, totpNow, VaultError } from '@cadenas/core';
import {
  REGLAGES_PAR_DEFAUT,
  type CustomField, type EntryDetail, type EntryInput, type EntrySummary, type GroupInfo, type HealthReport,
  type Id, type SecretKind, type Settings, type VaultBackend, type VaultState,
} from './backend';
import { ENTREES_DEMO, FICHIER_DEMO, GROUPES_DEMO, MOT_DE_PASSE_DEMO, NOM_COFFRE_DEMO } from './demo-data';
import { sansAccents } from './ui/dom';

const JOUR = 86_400_000;
const RACINE = 'g-racine';
const CORBEILLE = 'g-corbeille';

interface Entree {
  id: Id; groupId: Id; title: string; username: string; password: string; url: string; notes: string;
  totpUri?: string; tags: string[]; fields: CustomField[]; created: number; modified: number; historyCount: number;
}

export interface OptionsDemo {
  /** Coffre vide au lieu des 25 entrées fictives. */
  vide?: boolean;
  /** Déverrouillé d'emblée (tests). */
  deverrouille?: boolean;
  /** Horloge injectable pour les tests. */
  maintenant?: () => number;
}

export class DemoBackend implements VaultBackend {
  readonly estDemo = true;
  private etat: 'aucun-coffre' | 'verrouille' | 'deverrouille';
  private nom = NOM_COFFRE_DEMO;
  private fichier: string | undefined = FICHIER_DEMO;
  private motDePasse = MOT_DE_PASSE_DEMO;
  private groupes: GroupInfo[] = [];
  private entrees = new Map<Id, Entree>();
  private modifie = false;
  private derniereSauvegarde: number | undefined;
  private reglages: Settings = { ...REGLAGES_PAR_DEFAUT };
  private abonnes = new Set<(s: VaultState) => void>();
  private minuterieVerrou: ReturnType<typeof setTimeout> | undefined;
  private minuteriePressePapiers: ReturnType<typeof setTimeout> | undefined;
  private compteur = 0;
  private readonly maintenant: () => number;

  constructor(o: OptionsDemo = {}) {
    this.maintenant = o.maintenant ?? Date.now;
    this.remplir(!o.vide);
    this.etat = o.deverrouille ? 'deverrouille' : 'verrouille';
    if (typeof window !== 'undefined') {
      const activite = () => this.reporterVerrou();
      for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, activite, { passive: true });
    }
    if (o.deverrouille) this.reporterVerrou();
  }

  // ---------- Cycle de vie ----------

  async status(): Promise<VaultState> {
    if (this.etat === 'aucun-coffre') return { state: 'aucun-coffre' };
    if (this.etat === 'verrouille') return { state: 'verrouille', name: this.nom, fileName: this.fichier };
    return { state: 'deverrouille', name: this.nom, fileName: this.fichier, dirty: this.modifie, lastSaved: this.derniereSauvegarde };
  }

  async create(name: string, password: string): Promise<void> {
    this.nom = name.trim() || 'Mon coffre';
    this.fichier = `${sansAccents(this.nom).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'coffre'}.kdbx`;
    this.motDePasse = password;
    this.remplir(false);
    this.etat = 'deverrouille';
    this.modifie = true;
    this.derniereSauvegarde = undefined;
    this.reporterVerrou();
    await this.notifier();
  }

  async openFile(): Promise<void> {
    // Démo : « ouvrir » revient au coffre fictif, verrouillé.
    this.nom = NOM_COFFRE_DEMO; this.fichier = FICHIER_DEMO; this.motDePasse = MOT_DE_PASSE_DEMO;
    this.remplir(true);
    this.etat = 'verrouille';
    await this.notifier();
  }

  async unlock(password: string): Promise<void> {
    if (this.etat === 'aucun-coffre') throw new VaultError('introuvable', 'Aucun coffre ouvert.');
    await attendre(250); // le vrai déverrouillage prend ~1 s (Argon2id) ; on garde une petite pause réaliste
    if (password !== this.motDePasse) throw new VaultError('mauvais-mot-de-passe', 'Mot de passe incorrect.');
    this.etat = 'deverrouille';
    this.reporterVerrou();
    await this.notifier();
  }

  async lock(): Promise<void> {
    if (this.etat !== 'deverrouille') return;
    this.etat = 'verrouille';
    clearTimeout(this.minuterieVerrou);
    await this.notifier();
  }

  async save(): Promise<void> {
    this.exigerOuvert();
    this.modifie = false;
    this.derniereSauvegarde = this.maintenant();
    await this.notifier();
  }

  async exportFile(): Promise<void> {
    throw new Error('L\'export est désactivé dans la démo : aucune donnée ne quitte cette page.');
  }

  // ---------- Lecture ----------

  async listGroups(): Promise<GroupInfo[]> {
    this.exigerOuvert();
    return this.groupes.map(g => ({ ...g }));
  }

  async listEntries(groupId?: Id): Promise<EntrySummary[]> {
    this.exigerOuvert();
    return this.trier([...this.entrees.values()].filter(e => groupId ? e.groupId === groupId : e.groupId !== CORBEILLE));
  }

  async search(query: string): Promise<EntrySummary[]> {
    this.exigerOuvert();
    const mots = sansAccents(query).split(/\s+/).filter(Boolean);
    return this.trier([...this.entrees.values()].filter(e => {
      if (e.groupId === CORBEILLE) return false;
      const texte = sansAccents([e.title, e.username, e.url, ...e.tags].join(' '));
      return mots.every(m => texte.includes(m));
    }));
  }

  async getEntry(id: Id): Promise<EntryDetail> {
    const e = this.entree(id);
    return {
      ...resume(e), notes: e.notes, fields: e.fields.map(f => ({ ...f, value: f.protected ? '' : f.value })),
      created: e.created, historyCount: e.historyCount,
      passwordStrength: e.password ? estimateStrength(e.password).score : 0,
    };
  }

  async getSecret(id: Id, kind: SecretKind): Promise<string> {
    const e = this.entree(id);
    if (kind === 'password') return e.password;
    if (kind === 'totp') return (await this.getTotp(id)).code;
    if (kind.field === 'otp') {
      // Graine otpauth:// (format KeePassXC) : seul l'écran d'édition la demande.
      if (!e.totpUri) throw new VaultError('introuvable', 'Pas de code 2FA pour cette entrée.');
      return e.totpUri;
    }
    const champ = e.fields.find(f => f.key === kind.field);
    if (!champ) throw new VaultError('introuvable', `Champ « ${kind.field} » introuvable.`);
    return champ.value;
  }

  async getTotp(id: Id): Promise<{ code: string; period: number; remaining: number }> {
    const e = this.entree(id);
    if (!e.totpUri) throw new VaultError('introuvable', 'Pas de code 2FA pour cette entrée.');
    return totpNow(e.totpUri, this.maintenant());
  }

  async copySecret(id: Id, kind: SecretKind): Promise<void> {
    const valeur = await this.getSecret(id, kind);
    await ecrirePressePapiers(valeur);
    clearTimeout(this.minuteriePressePapiers);
    this.minuteriePressePapiers = setTimeout(() => { void ecrirePressePapiers(''); }, this.reglages.clipboardSeconds * 1000);
  }

  // ---------- Écriture ----------

  async addEntry(i: EntryInput): Promise<Id> {
    this.exigerOuvert();
    this.exigerGroupe(i.groupId);
    const id = this.nouvelId('e');
    const t = this.maintenant();
    this.entrees.set(id, { id, ...depuisSaisie(i), created: t, modified: t, historyCount: 0 });
    await this.marquer();
    return id;
  }

  async updateEntry(id: Id, i: EntryInput): Promise<void> {
    const e = this.entree(id);
    this.exigerGroupe(i.groupId);
    const n = depuisSaisie(i);
    // Conventions de core : totpUri absent = inchangé, '' = supprimé ; champ protégé renvoyé vide = conservé.
    n.totpUri = i.totpUri === undefined ? e.totpUri : i.totpUri || undefined;
    n.fields = n.fields.map(f => (f.protected && !f.value ? { ...f, value: e.fields.find(x => x.key === f.key)?.value ?? '' } : f));
    Object.assign(e, n, { modified: this.maintenant(), historyCount: e.historyCount + 1 });
    await this.marquer();
  }

  async deleteEntry(id: Id): Promise<void> {
    const e = this.entree(id);
    if (e.groupId === CORBEILLE) this.entrees.delete(id);
    else { e.groupId = CORBEILLE; e.modified = this.maintenant(); }
    await this.marquer();
  }

  async addGroup(name: string, parentId: Id | null): Promise<Id> {
    this.exigerOuvert();
    const id = this.nouvelId('g');
    this.groupes.splice(this.groupes.length - 1, 0, { id, name: name.trim(), parentId: parentId ?? RACINE, isRecycleBin: false });
    await this.marquer();
    return id;
  }

  async renameGroup(id: Id, name: string): Promise<void> {
    const g = this.exigerGroupe(id);
    g.name = name.trim();
    await this.marquer();
  }

  async deleteGroup(id: Id): Promise<void> {
    const g = this.exigerGroupe(id);
    if (g.isRecycleBin || g.id === RACINE) throw new VaultError('introuvable', 'Ce groupe ne peut pas être supprimé.');
    for (const e of this.entrees.values()) if (e.groupId === id) e.groupId = CORBEILLE;
    this.groupes = this.groupes.filter(x => x.id !== id);
    await this.marquer();
  }

  async changeMasterKey(password: string): Promise<void> {
    this.exigerOuvert();
    this.motDePasse = password;
    await this.marquer();
  }

  async health(): Promise<HealthReport> {
    this.exigerOuvert();
    const actives = [...this.entrees.values()].filter(e => e.groupId !== CORBEILLE);
    const avecMdp = actives.filter(e => e.password);
    const weak = avecMdp.filter(e => estimateStrength(e.password).score <= 2).map(e => e.id);
    const parMdp = new Map<string, Id[]>();
    for (const e of avecMdp) parMdp.set(e.password, [...(parMdp.get(e.password) ?? []), e.id]);
    const reused = [...parMdp.values()].filter(ids => ids.length > 1);
    const old = actives.filter(e => this.maintenant() - e.modified > 365 * JOUR).map(e => e.id);
    const withoutPassword = actives.filter(e => !e.password).map(e => e.id);
    const aRevoir = new Set([...weak, ...reused.flat(), ...old, ...withoutPassword]);
    const score = actives.length ? Math.round(100 * (1 - aRevoir.size / actives.length)) : 100;
    return { weak, reused, old, withoutPassword, score };
  }

  // ---------- Réglages et événements ----------

  async getSettings(): Promise<Settings> { return { ...this.reglages }; }

  async setSettings(s: Partial<Settings>): Promise<void> {
    this.reglages = { ...this.reglages, ...s };
    this.reporterVerrou();
  }

  onChange(cb: (s: VaultState) => void): () => void {
    this.abonnes.add(cb);
    return () => { this.abonnes.delete(cb); };
  }

  // ---------- Interne ----------

  private remplir(avecDonnees: boolean): void {
    const t = this.maintenant();
    this.groupes = [
      { id: RACINE, name: this.nom, parentId: null, isRecycleBin: false },
      ...(avecDonnees ? GROUPES_DEMO.map(g => ({ id: g.id, name: g.nom, parentId: RACINE, isRecycleBin: false })) : []),
      { id: CORBEILLE, name: 'Corbeille', parentId: RACINE, isRecycleBin: true },
    ];
    this.entrees.clear();
    if (!avecDonnees) return;
    for (const d of ENTREES_DEMO) {
      this.entrees.set(d.id, {
        id: d.id, groupId: d.groupe, title: d.titre, username: d.identifiant, password: d.motDePasse, url: d.url,
        notes: d.notes ?? '', totpUri: d.totp, tags: d.tags ?? [], fields: d.champs ?? [],
        created: t - (d.age + 200) * JOUR, modified: t - d.age * JOUR, historyCount: d.versions ?? 1,
      });
    }
  }

  private trier(l: Entree[]): EntrySummary[] {
    return l.map(resume).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  }

  private exigerOuvert(): void {
    if (this.etat !== 'deverrouille') throw new VaultError('introuvable', 'Le coffre est verrouillé.');
  }

  private entree(id: Id): Entree {
    this.exigerOuvert();
    const e = this.entrees.get(id);
    if (!e) throw new VaultError('introuvable', 'Entrée introuvable.');
    return e;
  }

  private exigerGroupe(id: Id): GroupInfo {
    this.exigerOuvert();
    const g = this.groupes.find(x => x.id === id);
    if (!g) throw new VaultError('introuvable', 'Groupe introuvable.');
    return g;
  }

  private nouvelId(prefixe: string): Id {
    return `${prefixe}-n${++this.compteur}`;
  }

  private async marquer(): Promise<void> {
    this.modifie = true;
    await this.notifier();
  }

  private async notifier(): Promise<void> {
    const s = await this.status();
    for (const cb of this.abonnes) cb(s);
  }

  private reporterVerrou(): void {
    if (this.etat !== 'deverrouille') return;
    clearTimeout(this.minuterieVerrou);
    if (this.reglages.autoLockMinutes > 0) {
      this.minuterieVerrou = setTimeout(() => { void this.lock(); }, this.reglages.autoLockMinutes * 60_000);
    }
  }
}

function resume(e: Entree): EntrySummary {
  return { id: e.id, groupId: e.groupId, title: e.title, username: e.username, url: e.url, tags: [...e.tags], hasTotp: !!e.totpUri, modified: e.modified };
}

function depuisSaisie(i: EntryInput): Omit<Entree, 'id' | 'created' | 'modified' | 'historyCount'> {
  return {
    groupId: i.groupId, title: i.title.trim(), username: i.username, password: i.password, url: i.url.trim(), notes: i.notes,
    totpUri: i.totpUri || undefined, tags: [...i.tags], fields: i.fields.map(f => ({ ...f })),
  };
}

const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));

async function ecrirePressePapiers(texte: string): Promise<void> {
  try { await navigator.clipboard.writeText(texte); } catch { /* cadre sans permission : la démo continue */ }
}
