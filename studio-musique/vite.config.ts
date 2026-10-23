import { defineConfig } from 'vitest/config';

// Version de développement et build classique (dist/). L'artefact en un seul fichier : vite.artefact.config.ts.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
