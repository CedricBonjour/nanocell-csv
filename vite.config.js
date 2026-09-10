import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

const generateHtmlPlugin = () => ({
  name: 'generate-html',
  closeBundle() {
    console.log('Running scripts/generate_html.js...');
    spawnSync('node', ['scripts/generate_html.js'], { stdio: 'inherit' });
  }
});

export default defineConfig(({ command }) => ({
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
    exclude: ['tests/e2e/**', 'node_modules/**']
  },
  plugins: [
    generateHtmlPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['**/*.{png,svg,webp,ico}'],
      workbox: {
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
          { src: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/favicon-512x512.png', sizes: '512x512', type: 'image/png' }
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
