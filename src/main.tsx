import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';


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
