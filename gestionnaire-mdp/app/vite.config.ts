import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const page = (nom: string) => fileURLToPath(new URL(nom, import.meta.url));

// Pages : catalogue.html (composants). Les écrans arrivent à l'étape 2.5.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        catalogue: page('catalogue.html'),
      },
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
