/**
 * Universal helper to open links in the correct environment.
 * For Electron, it uses IPC to open the system's default browser.
 * For Web/PWA, it uses window.open.
 */
export const openExternalLink = (url: string) => {
  const isElectron = !!(window as any).electronAPI;

  if (isElectron) {
    (window as any).electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

/**
 * Specifically for email links
 */
export const openMail = (email: string) => {
  openExternalLink(`mailto:${email}`);
};
