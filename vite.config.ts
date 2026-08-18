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
        includeAssets: ['zaynahs-logo.svg'],
        manifest: false,
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: 'index.html',
          // CRITICAL: Prevent SW from intercepting redirect responses (Safari crash fix)
          // Safari iOS fatally crashes when a SW serves a response with redirections.
          // This denylist ensures auth callbacks, API calls, and Supabase endpoints
          // are NEVER handled by the service worker's NavigationRoute.
          navigateFallbackDenylist: [
            /^\/auth/,           // Supabase auth callbacks
            /^\/api/,            // API routes
            /^\/rest/,           // Supabase REST
            /^\/realtime/,       // Supabase realtime
            /supabase\.co/,      // Any Supabase URL
            /supabase\.com/,     // Supabase management
            /^\/storage/,        // Supabase storage
            /\.(json|xml|txt|csv|pdf|zip)$/, // Non-HTML file types
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
