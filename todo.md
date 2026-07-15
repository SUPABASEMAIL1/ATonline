# E-Store Instant Activation & PWA Manifest Checklist

- [x] Renamed and created the two physical manifest files in the `public/` directory to match the user's working setup:
  - **`public/manifest.json`** (Storefront manifest): scope `/store`, start_url `/store`, name "Zaynahs Online Store"
  - **`public/admin-manifest.json`** (POS manifest): scope `/pos`, start_url `/pos`, name "Zaynahs POS System"
- [x] Deleted the old `/site.webmanifest` and `/store.webmanifest` from the `public/` directory.
- [x] Updated default manifest link inside [index.html](file:///Users/shoaib/Desktop/v12.2%20copy/index.html#L16) to point to `/admin-manifest.json`.
- [x] Updated dynamic head script inside [index.html](file:///Users/shoaib/Desktop/v12.2%20copy/index.html#L135) to swap between `/manifest.json` (storefront) and `/admin-manifest.json` (POS).
- [x] Updated React dynamic PWA routers in [App.tsx](file:///Users/shoaib/Desktop/v12.2%20copy/src/App.tsx#L211) and [EStoreApp.tsx](file:///Users/shoaib/Desktop/v12.2%20copy/src/components/estore/EStoreApp.tsx#L197) to use `/manifest.json` and `/admin-manifest.json`.
- [x] Removed `VitePWA` plugin configuration and import from [vite.config.ts](file:///Users/shoaib/Desktop/v12.2%20copy/vite.config.ts) to prevent the build system from injecting static manifests or caching interceptors.
- [x] Created a clean, passive self-destruct Service Worker file [sw.js](file:///Users/shoaib/Desktop/v12.2%20copy/public/sw.js) to satisfy browser PWA requirements and prevent stale assets.
- [x] Injected inline service worker unregister and registration logic in `index.html` to force-uninstall old active caching service workers on page load.
- [x] **Fixed E-Store Instant Activation**:
  - Modified [EStoreApp.tsx](file:///Users/shoaib/Desktop/v12.2%20copy/src/components/estore/EStoreApp.tsx#L24) to initialize the settings state directly from `pos_settings` in `localStorage` for instant zero-flash render without waiting for async fetch on mount.
  - Replaced the direct Supabase network query in `EStoreApp.tsx` settings loader (lines 49-61) with `settingsService.get()`, which reads from the local IndexedDB database first to resolve the network sync delay.
- [x] **Fixed Settings Race Condition on Toggle**:
  - Removed the redundant, nested `enableExtraCharges` auto-enable trigger from the `estoreEnabled` input `onChange` handler inside [Settings.tsx](file:///Users/shoaib/Desktop/v12.2%20copy/src/components/settings/Settings.tsx#L1065).
  - This resolves the state race condition where two asynchronous database writes in parallel caused the second call (`enableExtraCharges`) to overwrite `estoreEnabled` back to `false` and block enabling the feature.
- [x] Verified compilation runs clean with zero TypeScript errors.
