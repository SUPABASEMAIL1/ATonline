import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    base: mode === 'electron' ? '' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'favicon-32x32.png', 'favicon-16x16.png'],
      manifest: {
        name: 'Zaynahs POS System',
        short_name: 'ZaynahsPOS',
        description: 'Fast, offline-first point-of-sale system by ZaynahsPOS',
        theme_color: '#10b981',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        categories: ['business', 'finance', 'productivity'],
        icons: [
          {
            src: 'android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Netlify build fix: allow precaching assets bigger than default 2 MiB.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Cache all static assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Required for offline SPA routing:
        navigateFallback: 'index.html',
        // Runtime caching — NetworkOnly for API so app's own IndexedDB + syncEngine
        // handles offline (prevents stale 24h cached responses from SW).
        // Use StaleWhileRevalidate for static assets only.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
          // Cache static fonts/images with stale-while-revalidate
          {
            urlPattern: /\.(?:woff2?|eot|ttf|otf|svg|png|jpg|jpeg|gif|ico)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  optimizeDeps: {
    force: true,
    exclude: ['lucide-react', '@electric-sql/pglite', '@electric-sql/pglite-react'],
  },
  };
});
