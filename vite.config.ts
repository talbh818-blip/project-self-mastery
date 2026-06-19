import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// A unique id for THIS build. Baked into the bundle as __APP_VERSION__ and
// also written to /version.json. The running app compares the two to detect
// that a newer build has been deployed (see src/components/VersionGate.tsx).
const BUILD_ID = Date.now();

// Emits dist/version.json holding the build id, served at /version.json.
// The client fetches it (no-store) to learn the latest deployed version.
function emitVersionJson() {
  return {
    name: 'emit-version-json',
    generateBundle() {
      // @ts-expect-error — `this.emitFile` exists in the Rollup plugin context.
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: BUILD_ID }),
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    tailwindcss(),
    emitVersionJson(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'logo.png',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable.png',
        'apple-touch-icon.png',
        'favicon-48.png',
      ],
      // Make new SW activate immediately and take control of all open tabs,
      // so a single Ctrl+Shift+R after a deploy is enough to pick up new code.
      // Combined with the controllerchange listener in main.tsx, the app will
      // also auto-reload once the new SW takes over.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // version.json must never be served from cache — the gate needs the
        // freshest copy from the network to detect new deploys.
        globIgnores: ['**/version.json'],
      },
      manifest: {
        name: 'פרויקט מחויבות לעצמי',
        // Splash screens on Android show short_name; keep it the full project
        // name so the user sees the same text everywhere.
        short_name: 'פרויקט מחויבות לעצמי',
        description: 'בנה הרגלים חיוביים. השמד התמכרויות.',
        lang: 'he',
        dir: 'rtl',
        // Both colors track the in-app dark surface so the splash screen
        // matches the app instead of flashing a white card.
        theme_color: '#0d1319',
        background_color: '#0d1319',
        display: 'standalone',
        start_url: '/',
        icons: [
          // Square, padded icons (compass centered on the dark splash color).
          // The raw logo.png is non-square and edge-to-edge, so OS rounding
          // clipped its rim on the home screen — these fix that.
          {
            src: '/icon-192.png?v=4',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png?v=4',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          // Extra padding (center safe zone) so Android's adaptive mask never
          // crops the compass, whatever shape the launcher uses.
          {
            src: '/icon-maskable.png?v=4',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
