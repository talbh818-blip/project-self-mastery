import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png'],
      // Make new SW activate immediately and take control of all open tabs,
      // so a single Ctrl+Shift+R after a deploy is enough to pick up new code.
      // Combined with the controllerchange listener in main.tsx, the app will
      // also auto-reload once the new SW takes over.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
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
          // Three entries so Android picks the right asset at each density,
          // plus a separate maskable variant for the adaptive-icon system.
          {
            src: '/logo.png?v=3',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/logo.png?v=3',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/logo.png?v=3',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
