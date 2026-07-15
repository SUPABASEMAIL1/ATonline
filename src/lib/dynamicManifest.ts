export function updateDynamicManifest(opts: {
  storeName: string;
  storeLogo?: string;
  isStore?: boolean;
}) {
  const origin = window.location.origin;
  const name = opts.isStore ? opts.storeName : opts.storeName + ' POS';
  const shortName = opts.storeName;

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
    theme_color: '#10b981',
    categories: opts.isStore
      ? ['shopping', 'food', 'lifestyle']
      : ['business', 'finance', 'productivity'],
    icons: [
      {
        src: opts.storeLogo
          ? (opts.storeLogo.startsWith('http') ? opts.storeLogo : origin + opts.storeLogo)
          : origin + '/zaynahs-logo.svg',
        sizes: 'any',
        type: 'image/svg+xml',
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
