function resolveIconSrc(src: string, origin: string): string {
  if (src.startsWith('http') || src.startsWith('data:')) return src;
  if (src.startsWith('/')) return origin + src;
  return origin + '/' + src;
}

function getMimeType(src: string): string {
  if (src.startsWith('data:')) {
    const semiIndex = src.indexOf(';');
    if (semiIndex > 5) return src.slice(5, semiIndex);
    return 'image/png';
  }
  if (src.endsWith('.svg')) return 'image/svg+xml';
  if (src.endsWith('.webp')) return 'image/webp';
  if (src.endsWith('.png')) return 'image/png';
  return 'image/png';
}

export function updateDynamicManifest(opts: {
  storeName: string;
  storeLogo?: string;
  isStore?: boolean;
  themeColor?: string;
  updatedAt?: string | number | Date;
}) {
  const origin = window.location.origin;

  // ── UNIVERSAL BRANDING (no brand hardcoded): tenant name from settings, neutral
  //    'POS' fallback. isStore only switches the storefront description/scope. ──
  const bizName = (opts.storeName || '').trim() || 'POS';
  let name = opts.isStore ? bizName : `POS - ${bizName}`;
  const shortName = bizName.length > 12 ? bizName.substring(0, 10) + '\u2026' : bizName;
  const description = opts.isStore
    ? 'Browse and order items online from our digital storefront'
    : 'Fast, offline-first point-of-sale system';
  let iconSrc = origin + '/zaynahs-logo.svg';
  let mimeType = 'image/svg+xml';
  const bgColor = opts.isStore ? '#f9fafb' : '#0a0a0a';
  const orientation: OrientationLockType = opts.isStore ? 'portrait' : 'any';
  const categories = opts.isStore ? ['shopping', 'food', 'lifestyle'] : ['business', 'finance', 'productivity'];

  // ── STORE — use saved tenant settings ──
  if (opts.isStore) {
    name = bizName;

    if (opts.storeLogo) {
      const isDataUrl = opts.storeLogo.startsWith('data:');
      const cacheBust = !isDataUrl && opts.updatedAt
        ? '?v=' + (typeof opts.updatedAt === 'object' ? (opts.updatedAt as Date).getTime() : opts.updatedAt)
        : '';
      iconSrc = resolveIconSrc(opts.storeLogo, origin) + cacheBust;
      mimeType = getMimeType(opts.storeLogo);
    }
  }

  const manifest: Record<string, unknown> = {
    name,
    short_name: shortName,
    description,
    start_url: origin + (opts.isStore ? '/store' : '/pos'),
    scope: origin + (opts.isStore ? '/store' : '/pos'),
    display: 'standalone',
    orientation,
    background_color: bgColor,
    theme_color: opts.themeColor || '#10b981',
    categories,
    icons: [
      {
        src: iconSrc,
        sizes: '192x192',
        type: mimeType,
        purpose: 'any',
      },
      {
        src: iconSrc,
        sizes: '512x512',
        type: mimeType,
        purpose: 'maskable',
      },
    ],
  };

  const blob = new Blob([JSON.stringify(manifest)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);

  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link) {
    link.href = url;
  } else {
    link = document.createElement('link');
    link.rel = 'manifest';
    link.href = url;
    document.head.appendChild(link);
  }

  return url;
}
