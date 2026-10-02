import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

let commitHash = '';
let commitCount = '';
try {
  const gitRes = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf-8' });
  if (gitRes.status === 0 && gitRes.stdout) {
    commitHash = gitRes.stdout.trim();
  }
  const countRes = spawnSync('git', ['rev-list', '--count', 'HEAD'], { encoding: 'utf-8' });
  if (countRes.status === 0 && countRes.stdout) {
    commitCount = countRes.stdout.trim();
  }
} catch {
  // fallback if git command fails
}
if (!commitHash) {
  commitHash = process.env.GIT_COMMIT || process.env.VITE_COMMIT || 'dev';
}

const parts = (pkg.version || '1.0.0').replace(/^v/, '').split('.');
const major = parts[0] || '1';
const minor = parts[1] || '0';
const patch = commitCount || parts[2] || '0';
const appVersion = `v${major}.${minor}.${patch}-${commitHash}`;

const generateHtmlPlugin = () => ({
  name: 'generate-html',
  closeBundle() {
    console.log('Running design/scripts/generate_html.js...');
    spawnSync('node', ['design/scripts/generate_html.js'], { stdio: 'inherit' });
  }
});

export default defineConfig(({ command }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Points to the index.html at the ROOT of your project
        main: resolve(__dirname, 'index.html'),
        // Points to the home.html inside the app folder
        app: resolve(__dirname, 'app/home.html')
      }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    alias: {
      'virtual:pwa-register': resolve(__dirname, 'tests/mocks/pwa-register.js')
    }
  },
  plugins: [
    generateHtmlPlugin(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['**/*.{png,svg,webp,ico}'],
      workbox: {
        cacheId: appVersion,
        cleanupOutdatedCaches: true,
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,ttf}']
      },

      // ENABLE PWA IN DEV MODE
      devOptions: {
        enabled: true,
        type: 'module'
      },

      manifest: {
        name: 'Nanocell-csv',
        short_name: 'Nanocell-csv',
        description: 'Nanocell - CSV file viewer & editor : free, fast, simple, lightweight, offline, cross platform, data accurate, PWA',
        theme_color: '#e7e7e7',
        background_color: '#e7e7e7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/app/home.html',
        scope: '/app/',
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
