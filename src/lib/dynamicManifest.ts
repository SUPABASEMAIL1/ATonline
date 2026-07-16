function truncateShortName(name: string, max = 12): string {
  if (!name || name.length <= max) return name || 'Zaynahs';
  return name.substring(0, max - 1) + '\u2026';
}

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
  const name = opts.isStore ? opts.storeName : opts.storeName + ' POS';
  const shortName = truncateShortName(opts.storeName);
  const cacheBust = opts.updatedAt
    ? '?v=' + (typeof opts.updatedAt === 'object' ? (opts.updatedAt as Date).getTime() : opts.updatedAt)
    : '';

  const defaultIcon = origin + '/zaynahs-logo.svg';
  const logoUrl = opts.storeLogo ? resolveIconSrc(opts.storeLogo, origin) + cacheBust : defaultIcon;
  const mimeType = opts.storeLogo ? getMimeType(opts.storeLogo) : 'image/svg+xml';

  const manifest: Record<string, unknown> = {
    name,
    short_name: shortName,
    description: opts.isStore
      ? 'Browse and order items online from our digital storefront'
      : 'Fast, offline-first point-of-sale system',
    start_url: origin + (opts.isStore ? '/store' : '/pos'),
    scope: origin + (opts.isStore ? '/store' : '/pos'),
    display: 'standalone',
    orientation: opts.isStore ? 'portrait' : 'any',
    background_color: opts.isStore ? '#f9fafb' : '#0a0a0a',
    theme_color: opts.themeColor || '#10b981',
    categories: opts.isStore
      ? ['shopping', 'food', 'lifestyle']
      : ['business', 'finance', 'productivity'],
    icons: [
      {
        src: logoUrl,
        sizes: '192x192',
        type: mimeType,
        purpose: 'any',
      },
      {
        src: logoUrl,
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
