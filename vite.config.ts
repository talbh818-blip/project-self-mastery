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
      includeAssets: ['compass.svg'],
      manifest: {
        name: 'פרויקט מחויבות לעצמי',
        short_name: 'מחויבות',
        description: 'בנה הרגלים חיוביים. השמד התמכרויות.',
        lang: 'he',
        dir: 'rtl',
        theme_color: '#1B4332',
        background_color: '#FAF7EE',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/compass.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
});
