import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

const ici = (chemin: string) => fileURLToPath(new URL(chemin, import.meta.url));

/** Copie manifest.json dans dist/ en y reportant la version du package. */
function manifeste(): Plugin {
  return {
    name: 'cadenas-manifeste',
    generateBundle() {
      const manifest = JSON.parse(readFileSync(ici('./manifest.json'), 'utf8')) as Record<string, unknown>;
      const pkg = JSON.parse(readFileSync(ici('./package.json'), 'utf8')) as { version: string };
      manifest.version = pkg.version;
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(manifest, null, 2) + '\n' });
    },
  };
}

export default defineConfig({
  root: ici('./src'),
  publicDir: ici('./public'),
  base: './',
  resolve: {
    alias: {
      '@cadenas/core': ici('../core/src/index.ts'),
      '@cadenas/app': ici('../app/src'),
    },
  },
  build: {
    outDir: ici('./dist'),
    emptyOutDir: true,
    target: 'chrome116',
    modulePreload: false, // le polyfill injecterait un script en ligne, interdit par la CSP
    minify: false, // code lisible pour la relecture de sécurité et les magasins d'extensions
    sourcemap: false,
    assetsInlineLimit: 0, // pas de data: pour les polices ou le wasm
    rollupOptions: {
      input: {
        background: ici('./src/background.ts'),
        popup: ici('./src/popup.html'),
        vault: ici('./src/vault.html'),
        offscreen: ici('./src/offscreen.html'),
      },
      output: {
        entryFileNames: (morceau) => (morceau.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [manifeste()],
  test: {
    root: ici('.'),
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
