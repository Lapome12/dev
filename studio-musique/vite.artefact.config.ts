import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

// Artefact en UN SEUL fichier HTML (étape 1.5) : scripts et styles intégrés, aucune requête réseau.
// La CSP reste stricte : chaque bloc intégré est autorisé par son empreinte SHA-256, connect-src 'none'.
// Note pour l'interface : el.style.x = … reste permis, mais pas les attributs style="" ni setAttribute('style').

const sha256 = (texte: string) => `'sha256-${createHash('sha256').update(texte).digest('base64')}'`;

function fichierUnique(): Plugin {
  return {
    name: 'frequence-fichier-unique',
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
      if (Object.keys(bundle).some(n => n !== page.fileName)) throw new Error(`Fichiers non intégrés : ${Object.keys(bundle).join(', ')}`);
      html = html.replace(/<link rel="icon"[^>]*>/, '');
      const csp = [
        "default-src 'none'",
        `script-src ${scripts.map(sha256).join(' ')}`,
        `style-src ${styles.length ? styles.map(sha256).join(' ') : "'none'"}`,
        'img-src data: blob:', 'media-src blob:', "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
      ].join('; ');
      html = html.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, `<meta http-equiv="Content-Security-Policy" content="${csp}">`);
      page.source = html;
      page.fileName = 'frequence.html';
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [fichierUnique()],
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist/artefact',
    emptyOutDir: true,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: fileURLToPath(new URL('index.html', import.meta.url)),
      output: { inlineDynamicImports: true },
    },
  },
});
