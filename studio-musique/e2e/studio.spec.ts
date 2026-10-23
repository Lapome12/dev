import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';

// Étape 3.7 : un parcours complet dans l'artefact livré, comme le ferait une personne :
// un beat au Rack, une mélodie au piano roll, des clips dans l'arrangement, une réverbe à la
// console, annuler / rétablir, enregistrer puis rouvrir, exporter un WAV. Aucune requête réseau.

interface Fichier {
  project: {
    channels: { id: string; name: string; mixerTrack: number }[];
    patterns: { id: string; notes: Record<string, { tick: number; pitch: number }[]> }[];
    arrangement: { clips: { start: number }[] };
    mixer: { name: string; effects: { type: string }[] }[];
  };
}

/** Suit toutes les requêtes de la page : seule la page elle-même a le droit d'être chargée. */
function surveillerReseau(page: Page): string[] {
  const requetes: string[] = [];
  page.on('request', r => {
    const url = r.url();
    if (!url.endsWith('/frequence.html') && !url.startsWith('blob:') && !url.startsWith('data:')) requetes.push(url);
  });
  return requetes;
}

async function demarrer(page: Page): Promise<void> {
  await page.goto('/frequence.html');
  await page.getByRole('button', { name: /Cliquer pour activer le son/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function lireTelechargement(d: Download): Promise<Buffer> {
  const chemin = await d.path();
  return readFile(chemin);
}

async function enregistrer(page: Page): Promise<{ nom: string; octets: Buffer; fichier: Fichier }> {
  const attente = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const d = await attente;
  const octets = await lireTelechargement(d);
  return { nom: d.suggestedFilename(), octets, fichier: JSON.parse(octets.toString('utf8')) as Fichier };
}

/** Crête et énergie RMS d'un WAV PCM 16 ou 24 bits (tous canaux confondus). */
function analyserWav(b: Buffer): { crete: number; rms: number; secondes: number } {
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WAVE');
  let o = 12, bits = 16, canaux = 2, frequence = 44100, debut = -1, taille = 0;
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4);
    const n = b.readUInt32LE(o + 4);
    if (id === 'fmt ') { canaux = b.readUInt16LE(o + 10); frequence = b.readUInt32LE(o + 12); bits = b.readUInt16LE(o + 22); }
    if (id === 'data') { debut = o + 8; taille = Math.min(n, b.length - debut); break; }
    o += 8 + n + (n % 2);
  }
  expect(debut).toBeGreaterThan(0);
  const pas = bits / 8;
  let crete = 0, somme = 0, compte = 0;
  for (let i = debut; i + pas <= debut + taille; i += pas) {
    const v = bits === 16 ? b.readInt16LE(i) / 32768 : b.readIntLE(i, 3) / 8388608;
    crete = Math.max(crete, Math.abs(v));
    somme += v * v;
    compte++;
  }
  return { crete, rms: Math.sqrt(somme / Math.max(1, compte)), secondes: compte / canaux / frequence };
}

test('parcours complet : beat, mélodie, arrangement, réverbe, annuler, enregistrer, rouvrir, WAV', async ({ page }) => {
  const requetes = surveillerReseau(page);
  const erreurs: string[] = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  await demarrer(page);

  // 1. Un beat de 4 pas : la grosse caisse sur chaque temps.
  await page.getByRole('tab', { name: 'Rack' }).click();
  for (const pas of [1, 5, 9, 13]) {
    const bouton = page.getByRole('gridcell', { name: `Grosse caisse, pas ${pas}`, exact: true });
    await bouton.click();
    await expect(bouton).toHaveAttribute('aria-pressed', 'true');
  }

  // 2. Huit notes au piano roll, sur le synthé : au clavier (Entrée pose une note et avance).
  await page.getByRole('tab', { name: 'Piano roll' }).click();
  const canal = page.locator('#vue-piano').getByRole('combobox', { name: 'Canal édité' });
  await canal.selectOption({ label: 'Trio' });
  const grille = page.locator('#vue-piano .pr-zone-notes');
  await grille.focus();
  for (const monte of [0, 2, 2, 1, 2, 2, 2, 1]) {    // une gamme majeure
    for (let k = 0; k < monte; k++) await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
  }

  // 3. Trois clips dans l'arrangement.
  await page.getByRole('tab', { name: 'Arrangement' }).click();
  const pistes = page.locator('#vue-arrangement .ar-zone-pistes');
  await pistes.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  // 4. Une réverbe sur la tranche de la grosse caisse.
  await page.getByRole('tab', { name: 'Console' }).click();
  await page.getByRole('region', { name: 'Tranche 1', exact: true }).getByRole('button', { name: 'Ajouter un effet (emplacement 1)' }).click();
  await page.getByRole('menuitem', { name: /Réverbe/ }).click();
  await page.keyboard.press('Escape');      // ferme la fenêtre du plugin si elle s'est ouverte

  let s = await enregistrer(page);
  const p = s.fichier.project;
  const kick = p.channels.find(c => c.name === 'Grosse caisse')!;
  const trio = p.channels.find(c => c.name === 'Trio')!;
  const pattern = p.patterns[0]!;
  expect(pattern.notes[kick.id]?.map(n => n.tick).sort((a, b) => a - b)).toEqual([0, 96, 192, 288]);
  expect(pattern.notes[trio.id]).toHaveLength(8);
  expect(new Set(pattern.notes[trio.id]!.map(n => n.pitch)).size).toBe(8);
  expect(p.arrangement.clips).toHaveLength(3);
  expect(kick.mixerTrack).toBe(1);
  const reverbes = () => s.fichier.project.mixer[1]!.effects.filter(e => e.type === 'reverbe').length;
  expect(s.fichier.project.mixer.flatMap(t => t.effects).map(e => e.type)).toEqual(['reverbe']);
  expect(reverbes()).toBe(1);

  // 5. Annuler retire la réverbe, rétablir la remet.
  await page.getByRole('button', { name: 'Annuler : Ajouter Réverbe', exact: true }).click();
  s = await enregistrer(page);
  expect(reverbes()).toBe(0);
  await page.getByRole('button', { name: 'Rétablir : Ajouter Réverbe', exact: true }).click();
  s = await enregistrer(page);
  expect(reverbes()).toBe(1);
  const avant = s;

  // 6. Rouvrir le fichier dans une page neuve : le projet revient à l'identique.
  await page.reload();
  await page.getByRole('button', { name: /Cliquer pour activer le son/ }).click();
  const choix = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await choix).setFiles({ name: avant.nom, mimeType: 'application/json', buffer: avant.octets });
  await expect(page.getByText(/ouvert\./)).toBeVisible();
  const apres = await enregistrer(page);
  expect(apres.fichier.project).toEqual(avant.fichier.project);

  // 7. Export WAV du morceau : un vrai signal, pas du silence.
  await page.keyboard.press('Control+e');
  const export_ = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Exporter', exact: true }).click();
  const wav = analyserWav(await lireTelechargement(await export_));
  expect(wav.secondes).toBeGreaterThan(2);
  expect(wav.crete).toBeGreaterThan(0.05);
  expect(wav.rms).toBeGreaterThan(0.005);

  expect(requetes).toEqual([]);
  expect(erreurs).toEqual([]);
});

// Captures d'écran aux trois largeurs de référence (§A.6), sans défilement horizontal.
// FREQUENCE_CAPTURES choisit le dossier (par défaut test-results/captures).
const DOSSIER_CAPTURES = process.env.FREQUENCE_CAPTURES ?? 'test-results/captures';
const LARGEURS = [
  { largeur: 1440, hauteur: 900, vues: ['Rack', 'Piano roll', 'Arrangement', 'Console'] },
  { largeur: 1024, hauteur: 768, vues: ['Rack', 'Piano roll', 'Arrangement', 'Console'] },
  { largeur: 390, hauteur: 844, vues: ['Rack'] },   // téléphone : transport et Rack seulement
];

for (const { largeur, hauteur, vues } of LARGEURS) {
  test(`captures à ${largeur} px`, async ({ page }) => {
    const requetes = surveillerReseau(page);
    await page.setViewportSize({ width: largeur, height: hauteur });
    await page.goto('/frequence.html');
    await page.screenshot({ path: `${DOSSIER_CAPTURES}/${largeur}-accueil.png` });
    await page.getByRole('button', { name: /Cliquer pour activer le son/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    for (const pas of [1, 5, 9, 13]) await page.getByRole('gridcell', { name: `Grosse caisse, pas ${pas}`, exact: true }).click();
    for (const pas of [5, 13]) await page.getByRole('gridcell', { name: `Caisse claire, pas ${pas}`, exact: true }).click();
    for (const vue of vues) {
      if (largeur > 699) await page.getByRole('tab', { name: vue }).click();
      await page.waitForTimeout(150);
      const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(debord, `défilement horizontal dans ${vue}`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${DOSSIER_CAPTURES}/${largeur}-${vue.toLowerCase().replace(' ', '-')}.png` });
    }
    expect(requetes).toEqual([]);
  });
}

// Fichiers piégés ouverts depuis l'interface : un message clair, le projet en cours intact,
// aucune erreur de page, aucun code injecté exécuté.
test('ouvrir un fichier .frequence piégé affiche un message propre', async ({ page }) => {
  const requetes = surveillerReseau(page);
  const erreurs: string[] = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('dialog', d => { erreurs.push(`boîte inattendue : ${d.message()}`); void d.dismiss(); });
  await demarrer(page);
  const ouvrirFichier = async (contenu: string) => {
    const choix = page.waitForEvent('filechooser');
    await page.keyboard.press('Control+o');
    await (await choix).setFiles({ name: 'piege.frequence', mimeType: 'application/json', buffer: Buffer.from(contenu) });
  };
  const valide = (await enregistrer(page)).octets.toString('utf8');
  const piege = (f: (p: Record<string, unknown>, fichier: Record<string, unknown>) => void) => {
    const fichier = JSON.parse(valide) as Record<string, unknown>;
    f(fichier['project'] as Record<string, unknown>, fichier);
    return JSON.stringify(fichier);
  };
  const refus = [
    { contenu: 'ceci n’est pas du JSON {', message: /Impossible d'ouvrir ce fichier : Ce fichier est abîmé/ },
    { contenu: '[1, 2, 3]', message: /Impossible d'ouvrir ce fichier : Ce fichier n’est pas un projet/ },
    { contenu: piege(p => { p['version'] = 99; }), message: /version plus récente/ },
    { contenu: piege(p => { p['channels'] = 'rien'; }), message: /Fichier invalide : les canaux/ },
    { contenu: piege((_, f) => { f['audio'] = 'pas un objet'; }), message: /échantillons sont mal enregistrés/ },
  ];
  for (const { contenu, message } of refus) {
    await ouvrirFichier(contenu);
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByRole('gridcell', { name: 'Grosse caisse, pas 1', exact: true })).toBeVisible();   // projet intact
  }

  // Un projet hostile mais lisible : nettoyé à l'ouverture, le nom reste du texte, rien ne s'exécute.
  const hostile = piege(p => {
    p['name'] = '<img src=x onerror="window.pirate=1">';
    p['bpm'] = 1e9;
    (p['arrangement'] as { clips: unknown[] }).clips.push({ id: 'c', trackId: 'inconnue', patternId: 'inconnu', start: 0, length: 384, offset: 0 });
  }).replace('{"project":{', '{"project":{"__proto__":{"pollue":true},');
  await ouvrirFichier(hostile);
  await expect(page.getByText(/ouvert\./)).toBeVisible();
  const etat = await page.evaluate(() => ({
    pirate: (window as unknown as { pirate?: number }).pirate,
    pollue: ({} as { pollue?: boolean }).pollue,
    images: document.querySelectorAll('img[src="x"]').length,
  }));
  expect(etat).toEqual({ pirate: undefined, pollue: undefined, images: 0 });
  const { fichier } = await enregistrer(page);
  expect(fichier.project.arrangement.clips).toEqual([]);
  expect((fichier.project as unknown as { bpm: number }).bpm).toBeLessThanOrEqual(300);
  expect(requetes).toEqual([]);
  expect(erreurs).toEqual([]);
});
