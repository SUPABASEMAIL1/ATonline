const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Get stored Supabase config
  getConfig: () => ipcRenderer.invoke('get-config'),

  // Save Supabase config
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // Restart the app (after config change)
  restartApp: () => ipcRenderer.invoke('restart-app'),

  // Flag to detect Electron environment
  isElectron: true,

  // Open external link in system browser
  openExternal: (url) => ipcRenderer.send('open-external-link', url),

  // Print receipt HTML (string, or { html: string } for future options)
  printHtml: (htmlOrObj) => ipcRenderer.invoke('print-html', htmlOrObj),
});
