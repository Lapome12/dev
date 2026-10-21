import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

// Démo en UN SEUL fichier HTML (étape 3.4) : scripts, styles et polices intégrés,
// pour l'artefact. La CSP reste stricte : chaque bloc intégré est autorisé par son empreinte SHA-256.

const sha256 = (texte: string) => `'sha256-${createHash('sha256').update(texte).digest('base64')}'`;

function fichierUnique(): Plugin {
  return {
    name: 'cadenas-fichier-unique',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = Object.values(bundle).find(f => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!page || page.type !== 'asset') throw new Error('Page HTML introuvable dans le build.');
      let html = String(page.source);
      const scripts: string[] = [];
      const styles: string[] = [];
      for (const [nom, f] of Object.entries(bundle)) {
        if (f.type === 'chunk' && f.isEntry) {
          const code = f.code.replace(/<\/script/gi, '<\\/script');
          scripts.push(code);
          html = html.replace(new RegExp(`<script type="module" crossorigin src="[^"]*${f.fileName.replace(/[.]/g, '\\.')}"></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[nom];
        } else if (f.type === 'asset' && f.fileName.endsWith('.css')) {
          const css = String(f.source);
          styles.push(css);
          html = html.replace(new RegExp(`<link rel="stylesheet" crossorigin href="[^"]*${f.fileName.replace(/[.]/g, '\\.')}">`), () => `<style>${css}</style>`);
          delete bundle[nom];
        }
      }
      if (/<script[^>]+src=|<link[^>]+stylesheet/.test(html)) throw new Error('Une ressource n\'a pas été intégrée.');
      html = html.replace(/<link rel="icon"[^>]*>/, '');
      const csp = [
        "default-src 'none'",
        `script-src ${scripts.map(sha256).join(' ')}`,
        `style-src ${styles.map(sha256).join(' ')}`,
        'img-src data:', 'font-src data:', "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
      ].join('; ');
      html = html.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, `<meta http-equiv="Content-Security-Policy" content="${csp}">`);
      page.source = html;
      page.fileName = 'cadenas-demo.html';
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [fichierUnique()],
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist/autonome',
    emptyOutDir: true,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: fileURLToPath(new URL('demo.html', import.meta.url)),
      output: { inlineDynamicImports: true },
    },
  },
});
