import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const page = (nom: string) => fileURLToPath(new URL(nom, import.meta.url));

// Pages : demo.html (DemoBackend), catalogue.html (composants).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        demo: page('demo.html'),
        catalogue: page('catalogue.html'),
      },
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
