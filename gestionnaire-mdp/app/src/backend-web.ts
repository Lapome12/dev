// WebBackend : version web autonome. Le coffre est déchiffré par core dans la page,
// le fichier est lu et écrit via l'API File System Access (Chromium) ou, à défaut,
// via <input type="file"> et un téléchargement. Une copie CHIFFRÉE reste dans IndexedDB
// pour rouvrir le coffre au prochain lancement.

import { calibrateKdf, Vault, VaultError } from '@cadenas/core';
import {
  REGLAGES_PAR_DEFAUT,
  type EntryDetail, type EntryInput, type EntrySummary, type GroupInfo, type HealthReport,
  type Id, type SecretKind, type Settings, type VaultBackend, type VaultState,
} from './backend';
import {
  CLE_COFFRE, CLE_REGLAGES, ecrire, lire, stockageDisponible, type CoffreMemorise, type FileHandleCompat,
} from './stockage';

const TYPES_KDBX = [{ description: 'Coffre KeePass', accept: { 'application/octet-stream': ['.kdbx'] } }];
const DELAI_ENREGISTREMENT = 1200;

interface FenetreFsa {
  showOpenFilePicker?(o?: object): Promise<FileHandleCompat[]>;
  showSaveFilePicker?(o?: object): Promise<FileHandleCompat>;
}
const fsa = (): FenetreFsa => window as unknown as FenetreFsa;

export interface OptionsWeb {
  /** Verrouiller dès que la page passe en arrière-plan (téléphone). */
  verrouillerEnArrierePlan?: boolean;
}

export class WebBackend implements VaultBackend {
  private memo: CoffreMemorise | null = null;
  private vault: Vault | null = null;
  private modifie = false;
  private derniereSauvegarde: number | undefined;
  private reglages: Settings = { ...REGLAGES_PAR_DEFAUT };
  private abonnes = new Set<(s: VaultState) => void>();
  private pret: Promise<void>;
  private minuterieVerrou: number | undefined;
  private minuteriePressePapiers: number | undefined;
  private minuterieEcriture: number | undefined;
  private ecritureEnCours: Promise<void> = Promise.resolve();

  constructor(private readonly o: OptionsWeb = {}) {
    this.pret = this.charger();
    const activite = () => this.reporterVerrou();
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, activite, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.o.verrouillerEnArrierePlan) void this.lock();
    });
    window.addEventListener('pagehide', () => { this.vault?.close(); });
  }

  private async charger(): Promise<void> {
    if (!stockageDisponible()) return;
    try {
      this.memo = (await lire<CoffreMemorise>(CLE_COFFRE)) ?? null;
      this.reglages = { ...REGLAGES_PAR_DEFAUT, ...(await lire<Partial<Settings>>(CLE_REGLAGES)) };
    } catch { /* navigation privée : on continue sans mémoire */ }
  }

  // ---------- Cycle de vie ----------

  async status(): Promise<VaultState> {
    await this.pret;
    if (!this.memo) return { state: 'aucun-coffre' };
    if (!this.vault) return { state: 'verrouille', name: this.memo.nom, fileName: this.memo.fichier };
    return { state: 'deverrouille', name: this.vault.name, fileName: this.memo.fichier, dirty: this.modifie, lastSaved: this.derniereSauvegarde };
  }

  async create(name: string, password: string, keyFile?: Uint8Array): Promise<void> {
    await this.pret;
    const kdf = await calibrateKdf();
    const v = await Vault.create(name, password, keyFile, kdf);
    this.vault?.close();
    this.vault = v;
    const fichier = `${nomFichier(name)}.kdbx`;
    this.memo = { nom: v.name, fichier, octets: await v.save(), surDisque: false };
    this.modifie = true; // pas encore écrit sur disque : « Enregistrer » demandera où
    await this.memoriser();
    this.reporterVerrou();
    await this.notifier();
  }

  async openFile(): Promise<void> {
    // Le sélecteur doit être le premier appel asynchrone (geste de l'utilisateur).
    let fichier: File;
    let poignee: FileHandleCompat | undefined;
    const f = fsa();
    if (f.showOpenFilePicker) {
      const [p] = await f.showOpenFilePicker({ types: TYPES_KDBX, multiple: false });
      if (!p) return;
      poignee = p;
      fichier = await p.getFile();
    } else {
      fichier = await choisirFichier('.kdbx');
    }
    await this.pret;
    const octets = await fichier.arrayBuffer();
    if (octets.byteLength < 12) throw new VaultError('fichier-corrompu');
    this.vault?.close();
    this.vault = null;
    this.memo = { nom: fichier.name.replace(/\.kdbx$/i, ''), fichier: fichier.name, octets, poignee, surDisque: true };
    this.modifie = false;
    await this.memoriser();
    await this.notifier();
  }

  async unlock(password: string, keyFile?: Uint8Array): Promise<void> {
    await this.pret;
    const memo = this.memo;
    if (!memo) throw new VaultError('introuvable', 'Aucun coffre ouvert.');
    // Relire le fichier sur disque s'il a pu changer (synchronisation Syncthing, Nextcloud…).
    let octets = memo.octets;
    if (memo.poignee && memo.surDisque && await this.permission(memo.poignee, 'read', true)) {
      try { octets = await (await memo.poignee.getFile()).arrayBuffer(); } catch { /* fichier déplacé : on garde la copie */ }
    }
    const v = await Vault.open(octets, password, keyFile);
    this.vault = v;
    memo.nom = v.name;
    if (octets !== memo.octets) { memo.octets = octets; await this.memoriser(); }
    this.modifie = !memo.surDisque;
    this.reporterVerrou();
    await this.notifier();
  }

  async lock(): Promise<void> {
    if (!this.vault) return;
    await this.ecritureEnCours.catch(() => {});
    if (this.minuterieEcriture !== undefined) { window.clearTimeout(this.minuterieEcriture); this.minuterieEcriture = undefined; await this.chiffrerEtEcrire(false); }
    this.vault.close();
    this.vault = null;
    window.clearTimeout(this.minuterieVerrou);
    await this.notifier();
  }

  async save(): Promise<void> {
    const memo = this.memo;
    if (!memo || !this.vault) throw new VaultError('introuvable', 'Le coffre est verrouillé.');
    const f = fsa();
    if (!memo.poignee && f.showSaveFilePicker) {
      // Premier appel asynchrone : le geste de l'utilisateur est encore valable.
      memo.poignee = await f.showSaveFilePicker({ suggestedName: memo.fichier, types: TYPES_KDBX });
      memo.fichier = memo.poignee.name;
    }
    window.clearTimeout(this.minuterieEcriture);
    this.minuterieEcriture = undefined;
    await this.chiffrerEtEcrire(true);
  }

  async exportFile(): Promise<void> {
    const memo = this.memo;
    if (!memo) throw new VaultError('introuvable', 'Aucun coffre ouvert.');
    const octets = this.vault ? await this.vault.save() : memo.octets;
    telecharger(octets, memo.fichier);
  }

  // ---------- Lecture ----------

  async listGroups(): Promise<GroupInfo[]> { return this.v().listGroups(); }
  async listEntries(groupId?: Id): Promise<EntrySummary[]> { return this.v().listEntries(groupId); }
  async search(q: string): Promise<EntrySummary[]> { return this.v().search(q); }
  async getEntry(id: Id): Promise<EntryDetail> { return this.v().getEntry(id); }

  async getSecret(id: Id, kind: SecretKind): Promise<string> {
    if (kind === 'totp') return (await this.v().getTotp(id)).code;
    return this.v().getSecret(id, kind);
  }

  async getTotp(id: Id): Promise<{ code: string; period: number; remaining: number }> {
    const t = await this.v().getTotp(id);
    return { code: t.code, period: t.period, remaining: t.remaining };
  }

  async copySecret(id: Id, kind: SecretKind): Promise<void> {
    const valeur = await this.getSecret(id, kind);
    await navigator.clipboard.writeText(valeur);
    window.clearTimeout(this.minuteriePressePapiers);
    this.minuteriePressePapiers = window.setTimeout(() => { void effacerPressePapiers(valeur); }, this.reglages.clipboardSeconds * 1000);
  }

  // ---------- Écriture ----------

  async addEntry(i: EntryInput): Promise<Id> { const id = this.v().addEntry(i); await this.changer(); return id; }
  async updateEntry(id: Id, i: EntryInput): Promise<void> { this.v().updateEntry(id, i); await this.changer(); }
  async deleteEntry(id: Id): Promise<void> { this.v().deleteEntry(id); await this.changer(); }
  async addGroup(name: string, parentId: Id | null): Promise<Id> { const id = this.v().addGroup(name, parentId); await this.changer(); return id; }
  async renameGroup(id: Id, n: string): Promise<void> { this.v().renameGroup(id, n); await this.changer(); }
  async deleteGroup(id: Id): Promise<void> { this.v().deleteGroup(id); await this.changer(); }
  async changeMasterKey(password: string, keyFile?: Uint8Array): Promise<void> { await this.v().changeMasterKey(password, keyFile); await this.changer(); }
  async health(): Promise<HealthReport> { return this.v().health(); }

  // ---------- Réglages et événements ----------

  async getSettings(): Promise<Settings> { await this.pret; return { ...this.reglages }; }

  async setSettings(s: Partial<Settings>): Promise<void> {
    this.reglages = { ...this.reglages, ...s };
    try { await ecrire(CLE_REGLAGES, this.reglages); } catch { /* sans stockage : réglages de la session */ }
    this.reporterVerrou();
  }

  onChange(cb: (s: VaultState) => void): () => void {
    this.abonnes.add(cb);
    return () => { this.abonnes.delete(cb); };
  }

  // ---------- Interne ----------

  private v(): Vault {
    if (!this.vault) throw new VaultError('introuvable', 'Le coffre est verrouillé.');
    return this.vault;
  }

  /** Après une modification : marque le coffre modifié et programme l'enregistrement chiffré. */
  private async changer(): Promise<void> {
    this.modifie = true;
    await this.notifier();
    window.clearTimeout(this.minuterieEcriture);
    this.minuterieEcriture = window.setTimeout(() => {
      this.minuterieEcriture = undefined;
      this.ecritureEnCours = this.chiffrerEtEcrire(false).catch(() => {});
    }, DELAI_ENREGISTREMENT);
  }

  /**
   * Chiffre le coffre (Argon2id, ~1 s), garde la copie chiffrée dans IndexedDB et l'écrit
   * dans le fichier si la permission d'écriture est acquise. `demander` : peut solliciter la permission.
   */
  private async chiffrerEtEcrire(demander: boolean): Promise<void> {
    const memo = this.memo;
    if (!memo || !this.vault) return;
    const octets = await this.vault.save();
    memo.octets = octets;
    memo.surDisque = false;
    if (memo.poignee && await this.permission(memo.poignee, 'readwrite', demander)) {
      const w = await memo.poignee.createWritable();
      await w.write(octets);
      await w.close();
      memo.surDisque = true;
    } else if (demander && !fsa().showSaveFilePicker) {
      telecharger(octets, memo.fichier); // navigateur sans File System Access : on télécharge
      memo.surDisque = true;
    }
    await this.memoriser();
    if (memo.surDisque) { this.modifie = false; this.derniereSauvegarde = Date.now(); }
    await this.notifier();
  }

  private async permission(p: FileHandleCompat, mode: 'read' | 'readwrite', demander: boolean): Promise<boolean> {
    if (!p.queryPermission) return true;
    let etat = await p.queryPermission({ mode });
    if (etat === 'prompt' && demander && p.requestPermission) etat = await p.requestPermission({ mode });
    return etat === 'granted';
  }

  private async memoriser(): Promise<void> {
    if (!this.memo) return;
    try { await ecrire(CLE_COFFRE, this.memo); } catch { /* navigation privée */ }
  }

  private async notifier(): Promise<void> {
    const s = await this.status();
    for (const cb of this.abonnes) cb(s);
  }

  private reporterVerrou(): void {
    if (!this.vault) return;
    window.clearTimeout(this.minuterieVerrou);
    if (this.reglages.autoLockMinutes > 0) {
      this.minuterieVerrou = window.setTimeout(() => { void this.lock(); }, this.reglages.autoLockMinutes * 60_000);
    }
  }
}

function nomFichier(nom: string): string {
  return nom.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'coffre';
}

function telecharger(octets: ArrayBuffer, nom: string): void {
  const url = URL.createObjectURL(new Blob([octets], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url; a.download = nom; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Repli sans File System Access : <input type="file"> créé à la volée (doit suivre un geste). */
function choisirFichier(accept: string): Promise<File> {
  return new Promise((resoudre, rejeter) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (f) resoudre(f); else rejeter(new DOMException('Aucun fichier choisi.', 'AbortError'));
    });
    input.addEventListener('cancel', () => rejeter(new DOMException('Aucun fichier choisi.', 'AbortError')));
    input.click();
  });
}

/**
 * Efface le presse-papiers, sauf si l'utilisateur y a copié autre chose entre-temps.
 * On ne relit le presse-papiers que si la lecture est déjà autorisée (sinon readText()
 * ouvrirait une demande d'autorisation) ; à défaut, on efface sans vérifier.
 */
async function effacerPressePapiers(secret: string): Promise<void> {
  try {
    const p = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
    if (p.state === 'granted' && (await navigator.clipboard.readText()) !== secret) return;
  } catch { /* permission inconnue de ce navigateur : on efface */ }
  try { await navigator.clipboard.writeText(''); } catch { /* page en arrière-plan */ }
}
