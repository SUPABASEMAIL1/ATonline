import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';


// Auto-reload the page if a lazy-loaded chunk (module) fails to fetch (e.g. after a new deploy)
window.addEventListener('error', (e) => {
  const isChunkError = 
    e.message?.includes('Failed to fetch dynamically imported module') ||
    e.message?.includes('Importing a module script failed') ||
    ((e.target as HTMLElement)?.tagName === 'SCRIPT' && ((e.target as HTMLScriptElement)?.src?.includes('/assets/')));
  
  if (isChunkError) {
    console.warn('Chunk loading failed. Auto-refreshing to load new version...');
    window.location.reload();
  }
}, true);

window.addEventListener('unhandledrejection', (e) => {
  const isChunkError = e.reason?.message?.includes('Failed to fetch dynamically imported module') || e.reason?.message?.includes('Importing a module script failed');
  if (isChunkError) {
    console.warn('Unhandled chunk rejection. Auto-refreshing to load new version...');
    window.location.reload();
  }
});

// Register the PWA service worker for offline support in production only
if (!import.meta.env.DEV) {
  registerSW({ immediate: true });
} else {
  // Active cleanup of leftover service workers in development to prevent white screen issues on normal refresh
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) {
            console.log('Unregistered active service worker for local development:', registration.scope);
            window.location.reload();
          }
        });
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter future={{ v7_relativeSplatPath: true }}>
    <App />
  </BrowserRouter>
);
