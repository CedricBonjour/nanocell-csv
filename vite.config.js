import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { marked } from 'marked';

const p = (f) => resolve(__dirname, f);
const pkg = JSON.parse(readFileSync(p('package.json'), 'utf-8'));

let commitHash = '';
try {
  const gitRes = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf-8' });
  if (gitRes.status === 0 && gitRes.stdout) {
    commitHash = gitRes.stdout.trim();
  }
} catch {
  // fallback if git command fails
}
if (!commitHash) {
  commitHash = process.env.GIT_COMMIT || process.env.VITE_COMMIT || 'dev';
}

const version = (pkg.version || '1.0.0').replace(/^v/, '');
const appVersion = `${version}-${commitHash}`;
const appTitle = 'NanoCell — Free CSV Editor & Viewer That Never Corrupts Data';
const appDescription = 'Open, edit, and clean CSV/TSV files keeping leading zeros, + signs, and dates intact. Preview multi-GB files instantly—100% offline, free, and open source.';
const appMetaImage = 'https://nanocell-csv.com/nanocell_meta_image_banner.webp';

const devServerRoutingPlugin = () => ({
  name: 'dev-server-routing',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url ? req.url.split('?')[0] : '';
      const query = req.url && req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
      if (url === '/' || url === '/index.html') {
        req.url = '/web/index.html' + query;
      }
      next();
    });
  }
});

const generateHtmlPlugin = (command) => ({
  name: 'generate-html',
  closeBundle() {
    if (command !== 'build') return;
    copyFileSync(p('dist/web/index.html'), p('dist/index.html'));
    const md = (f) => marked.parse(readFileSync(p(f), 'utf-8'));
    const style = '<style>body{max-width:800px;margin:2em auto;font:16px/1.6 sans-serif}</style>';
    const body = `<a href="/">&larr; Home</a>${md('TERMS_OF_USE.md')}<hr>${md('LICENSE.md')}`;
    writeFileSync(p('dist/terms_of_use_and_license.html'), `<!DOCTYPE html>${style}${body}`);
  }
});

const htmlVersionPlugin = () => ({
  name: 'html-version-transform',
  transformIndexHtml(html) {
    return html
      .replace(/__APP_VERSION__/g, appVersion)
      .replace(/__APP_TITLE__/g, appTitle)
      .replace(/__APP_DESCRIPTION__/g, appDescription)
      .replace(/__APP_META_IMAGE__/g, appMetaImage);
  }
});

export default defineConfig(({ command }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_TITLE__: JSON.stringify(appTitle),
    __APP_DESCRIPTION__: JSON.stringify(appDescription),
    __APP_META_IMAGE__: JSON.stringify(appMetaImage)
  },
  build: {
    target: 'chrome120',
    outDir: p('dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Points to the landing page inside web folder
        web: p('web/index.html'),
        // Points to the home.html inside the app folder
        app: p('app/home.html')
      }
    }
  },
  plugins: [
    devServerRoutingPlugin(),
    htmlVersionPlugin(),
    generateHtmlPlugin(command),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['**/*.{png,svg,webp,ico}'],
      workbox: {
        cacheId: appVersion,
        cleanupOutdatedCaches: true,
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,ttf}'],
        globIgnores: ['**/registerSW.js', '**/dev-dist/**']
      },

      // ENABLE PWA IN DEV MODE
      devOptions: {
        enabled: true,
        type: 'module',
        suppressWarnings: true
      },

      manifest: {
        name: 'NanoCell CSV',
        short_name: 'NanoCell CSV',
        description: appDescription,
        theme_color: { toJSON: () => undefined },
        background_color: undefined,
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/app/home.html',
        scope: '/',
        id: '/app/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/favicon-96x96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
          { src: '/favicon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/favicon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ],
        lang: "en",
        dir: "ltr",
        categories: [
          "productivity",
          "utilities",
          "business"
        ],
        prefer_related_applications: false,
        related_applications: [
          {
            platform: "webapp",
            url: "/manifest.webmanifest"
          }
        ],
        launch_handler: {
          client_mode: "auto"
        },
        file_handlers: [
          {
            action: "/app/home.html",
            accept: {
              "text/csv": [
                ".csv",
                ".tsv"
              ]
            }
          }
        ]
      }
    })
  ]
}));
