import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { buildWebpages, serveWebpageDev, renderAllArticlesGrid } from './webpage-factory.js';

const p = (f) => resolve(__dirname, f);
const pkg = JSON.parse(readFileSync(p('package.json'), 'utf-8'));
const manifestData = JSON.parse(readFileSync(p('manifest.json'), 'utf-8'));

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
const appTitle = manifestData.title;
const appDescription = manifestData.description;
const appMetaImage = manifestData.meta_image;
const pageDefaults = { appDescription, appMetaImage };

const devServerRoutingPlugin = () => ({
  name: 'dev-server-routing',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url ? req.url.split('?')[0] : '';
      const query = req.url && req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
      if (url === '/' || url === '/index.html') {
        req.url = '/web/index.html' + query;
        next();
        return;
      }
      if (serveWebpageDev(url, res, pageDefaults)) return;
      next();
    });
  }
});

const generateHtmlPlugin = (command) => ({
  name: 'generate-html',
  closeBundle() {
    if (command === 'build') buildWebpages(pageDefaults);
  }
});

const htmlVersionPlugin = () => ({
  name: 'html-version-transform',
  transformIndexHtml(html) {
    return html
      .replace(/__APP_VERSION__/g, appVersion)
      .replace(/__APP_TITLE__/g, appTitle)
      .replace(/__APP_DESCRIPTION__/g, appDescription)
      .replace(/__APP_META_IMAGE__/g, appMetaImage)
      .replace(/__ARTICLE_GRID__/g, () => renderAllArticlesGrid(pageDefaults));
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
        globIgnores: ['**/registerSW.js', '**/dev-dist/**', '**/article/**', '**/article-assets/**']
      },

      // ENABLE PWA IN DEV MODE
      devOptions: {
        enabled: true,
        type: 'module',
        suppressWarnings: true
      },

      manifest: {
        ...manifestData,
        version: appVersion,
        theme_color: { toJSON: () => undefined },
        background_color: undefined
      }
    })
  ]
}));
