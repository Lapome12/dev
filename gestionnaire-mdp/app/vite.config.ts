import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

const chemin = (nom: string) => fileURLToPath(new URL(nom, import.meta.url));

function fichiersPublics(dossier: string): string[] {
  return readdirSync(dossier).flatMap(nom => {
    const p = join(dossier, nom);
    return statSync(p).isDirectory() ? fichiersPublics(p) : [relative(chemin('public'), p).split('\\').join('/')];
  });
}

/** Injecte dans sw.js la liste des fichiers de l'application à mettre en cache, et une version. */
function listeServiceWorker(): Plugin {
  return {
    name: 'cadenas-liste-sw',
    apply: 'build',
    generateBundle(_o, bundle) {
      const sw = bundle['sw.js'];
      if (!sw || sw.type !== 'chunk') throw new Error('sw.js absent du build.');
      const fichiers = [
        './', './index.html',
        ...Object.keys(bundle).filter(f => f !== 'sw.js' && !f.endsWith('.map') && !/(^|\/)(demo|catalogue)[.-]/.test(f) && f !== 'demo.html' && f !== 'catalogue.html' && f !== 'index.html'),
        ...fichiersPublics(chemin('public')),
      ].map(f => (f.startsWith('./') ? f : `./${f}`));
      const version = createHash('sha256').update(Object.keys(bundle).sort().join('|')).digest('hex').slice(0, 12);
      sw.code = `const FICHIERS = ${JSON.stringify([...new Set(fichiers)])};\nconst VERSION = ${JSON.stringify(version)};\n${sw.code}`;
    },
  };
}

// Pages : index.html (version web / PWA, WebBackend), demo.html (DemoBackend), catalogue.html (composants).
export default defineConfig({
  base: './',
  plugins: [listeServiceWorker()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: chemin('index.html'),
        demo: chemin('demo.html'),
        catalogue: chemin('catalogue.html'),
        sw: chemin('src/sw.ts'),
      },
      output: {
        entryFileNames: c => (c.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
