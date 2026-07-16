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

  // ── DEFAULT (POS/admin) — hardcoded Zaynahs brand ──
  let name = 'Zaynahs POS';
  let shortName = 'Zaynahs';
  let description = 'Fast, offline-first point-of-sale system';
  let iconSrc = origin + '/zaynahs-logo.svg';
  let mimeType = 'image/svg+xml';
  let bgColor = '#0a0a0a';
  let orientation: OrientationLockType = 'any';
  let categories = ['business', 'finance', 'productivity'];

  // ── STORE — use saved tenant settings ──
  if (opts.isStore) {
    name = opts.storeName;
    shortName = opts.storeName;
    description = 'Browse and order items online from our digital storefront';
    bgColor = '#f9fafb';
    orientation = 'portrait';
    categories = ['shopping', 'food', 'lifestyle'];

    if (opts.storeLogo) {
      const cacheBust = opts.updatedAt
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
