// Empaquette extension/dist/ en cadenas-extension.zip, de façon reproductible :
// fichiers triés, date fixe, droits fixes, compression déterministe. Deux builds
// du même commit donnent le même zip, octet pour octet (empreinte SHA-256 affichée).
// Aucune dépendance : format ZIP écrit à la main (en-têtes locaux + répertoire central).
//
// Usage : node scripts/package.mjs [dossier=dist] [sortie=cadenas-extension.zip]
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const ici = fileURLToPath(new URL('..', import.meta.url));
const dossier = join(ici, process.argv[2] ?? 'dist');
const sortie = join(ici, process.argv[3] ?? 'cadenas-extension.zip');

// 1er janvier 2026, 00:00 (format date/heure DOS).
const DATE_DOS = ((2026 - 1980) << 9) | (1 << 5) | 1;
const HEURE_DOS = 0;

function fichiers(d) {
  return readdirSync(d)
    .flatMap((nom) => {
      const chemin = join(d, nom);
      return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
    })
    .sort();
}

const liste = fichiers(dossier).map((chemin) => ({ chemin, nom: relative(dossier, chemin).split(sep).join('/') }));
if (!liste.some((f) => f.nom === 'manifest.json')) {
  console.error(`Pas de manifest.json dans ${dossier} : lancez d'abord « npm run build ».`);
  process.exit(1);
}
// Un build de test ne doit jamais être livré.
const manifest = JSON.parse(readFileSync(join(dossier, 'manifest.json'), 'utf8'));
if (manifest.host_permissions) {
  console.error('Ce build contient des host_permissions (build de test ?) : refusé.');
  process.exit(1);
}

const morceaux = [];
const central = [];
let position = 0;

for (const { chemin, nom } of liste) {
  const donnees = readFileSync(chemin);
  const compresse = deflateRawSync(donnees, { level: 9 });
  const nomOctets = Buffer.from(nom, 'utf8');
  const crc = crc32(donnees);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version nécessaire
  local.writeUInt16LE(0x0800, 6); // noms en UTF-8
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(HEURE_DOS, 10);
  local.writeUInt16LE(DATE_DOS, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compresse.length, 18);
  local.writeUInt32LE(donnees.length, 22);
  local.writeUInt16LE(nomOctets.length, 26);
  local.writeUInt16LE(0, 28);
  morceaux.push(local, nomOctets, compresse);

  const entree = Buffer.alloc(46);
  entree.writeUInt32LE(0x02014b50, 0);
  entree.writeUInt16LE((3 << 8) | 20, 4); // créé sous Unix, version 2.0
  entree.writeUInt16LE(20, 6);
  entree.writeUInt16LE(0x0800, 8);
  entree.writeUInt16LE(8, 10);
  entree.writeUInt16LE(HEURE_DOS, 12);
  entree.writeUInt16LE(DATE_DOS, 14);
  entree.writeUInt32LE(crc, 16);
  entree.writeUInt32LE(compresse.length, 20);
  entree.writeUInt32LE(donnees.length, 24);
  entree.writeUInt16LE(nomOctets.length, 28);
  entree.writeUInt32LE(((0o100644 << 16) >>> 0) >>> 0, 38); // -rw-r--r--
  entree.writeUInt32LE(position, 42);
  central.push(entree, nomOctets);

  position += local.length + nomOctets.length + compresse.length;
}

const tailleCentral = central.reduce((n, b) => n + b.length, 0);
const fin = Buffer.alloc(22);
fin.writeUInt32LE(0x06054b50, 0);
fin.writeUInt16LE(liste.length, 8);
fin.writeUInt16LE(liste.length, 10);
fin.writeUInt32LE(tailleCentral, 12);
fin.writeUInt32LE(position, 16);

const zip = Buffer.concat([...morceaux, ...central, fin]);
writeFileSync(sortie, zip);
const empreinte = createHash('sha256').update(zip).digest('hex');
console.log(`${relative(ici, sortie)} : ${liste.length} fichiers, ${(zip.length / 1024).toFixed(0)} Kio`);
console.log(`SHA-256 ${empreinte}`);
