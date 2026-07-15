const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const Store = require('electron-store').default;

// v9.7: Absolute Hardware Access for OPFS
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer,WebAssemblyJSPI');
app.commandLine.appendSwitch('enable-blink-features', 'SharedArrayBuffer');

// Initialize electron-store for persistent config
const store = new Store({
  name: 'zaynahs-pos-config',
  defaults: {
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseServiceRoleKey: ''
  }
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: "Zaynah's POS",
    icon: path.join(__dirname, app.isPackaged ? 'dist' : 'public', 'zaynahs-logo.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for OPFS multithreading
    },
    autoHideMenuBar: true,
    show: false, // Show when ready to prevent flicker
  });

  // Remove default menu bar
  Menu.setApplicationMenu(null);

  // Determine if running in development or production
  const isDev = !app.isPackaged;

  if (isDev) {
    // In dev mode, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools in dev
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle external links for target="_blank"
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle external links for normal navigation (e.g. WhatsApp, http/https)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow local vite dev server and file:// protocol for internal navigation
    if (!url.startsWith('http://localhost:5173') && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── IPC Handlers ───────────────────────────────────────────────────

// Get stored Supabase config
ipcMain.handle('get-config', () => {
  return {
    supabaseUrl: store.get('supabaseUrl'),
    supabaseAnonKey: store.get('supabaseAnonKey'),
    supabaseServiceRoleKey: store.get('supabaseServiceRoleKey'),
  };
});

// Save Supabase config
ipcMain.handle('save-config', (_event, config) => {
  if (config.supabaseUrl) store.set('supabaseUrl', config.supabaseUrl);
  if (config.supabaseAnonKey) store.set('supabaseAnonKey', config.supabaseAnonKey);
  if (config.supabaseServiceRoleKey) store.set('supabaseServiceRoleKey', config.supabaseServiceRoleKey);
  return { success: true };
});

// Restart app (after config change)
ipcMain.handle('restart-app', () => {
  app.relaunch();
  app.exit(0);
});

// Open external link
ipcMain.on('open-external-link', (_event, url) => {
  shell.openExternal(url);
});

// Print HTML: load about:blank then inject — avoids file:// / data: URLs showing as junk text on thermal drivers
ipcMain.handle('print-html', async (_event, payload) => {
  const htmlContent =
    typeof payload === 'string' ? payload : payload && typeof payload.html === 'string' ? payload.html : '';
  if (!htmlContent) {
    return { success: false, failureReason: 'Missing HTML' };
  }

  return new Promise((resolve) => {
    const printWindow = new BrowserWindow({
      show: false,
      title: " ", // Neutral title to prevent ID/Path leakage
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const finish = (success, failureReason) => {
      printWindow.close();
      resolve({ success, failureReason });
    };

    const runPrint = () => {
      printWindow.webContents.print(
        {
          silent: false,
          printBackground: true,
          margins: { marginType: 'none' },
          header: '', // Suppress browser headers
          footer: '', // Suppress browser footers
        },
        (success, failureReason) => finish(success, failureReason),
      );
    };

    printWindow.webContents.once('did-finish-load', () => {
      const js = `document.open();document.write(${JSON.stringify(htmlContent)});document.close();`;
      printWindow.webContents
        .executeJavaScript(js)
        .then(() => {
          setTimeout(runPrint, 200);
        })
        .catch((e) => finish(false, String(e)));
    });

    printWindow.loadURL('about:blank');
  });
});

// ─── App Lifecycle ──────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
