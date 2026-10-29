import type { MetadataRoute } from 'next';
import { brand } from '@/lib/brand';

/**
 * Web app manifest — served at /manifest.webmanifest and linked automatically
 * from the document head. Icons are derived from public/assets/logo.jpg by
 * `npm run assets`.
 */
export default function manifest(): MetadataRoute.Manifest {
  const icon = (src: string, sizes: string, purpose: 'any' | 'maskable') => ({
    src,
    sizes,
    type: 'image/png',
    purpose,
  });

  return {
    id: '/',
    name: `${brand.name} — ${brand.tagline}`,
    short_name: brand.name,
    description: brand.description,
    lang: 'en',
    dir: 'ltr',
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#070707',
    theme_color: '#ff6a00',
    categories: ['finance', 'business', 'productivity'],
    icons: [
      icon('/icons/icon-192.png', '192x192', 'any'),
      icon('/icons/icon-512.png', '512x512', 'any'),
      icon('/icons/maskable-512.png', '512x512', 'maskable'),
    ],
    shortcuts: [
      {
        name: 'Deposit',
        short_name: 'Deposit',
        description: 'Top up your wallet with mobile money',
        url: '/wallet/deposit',
        icons: [icon('/icons/icon-192.png', '192x192', 'any')],
      },
      {
        name: 'Mining packs',
        short_name: 'Packs',
        description: 'Compare the five daily-earning packs',
        url: '/products',
        icons: [icon('/icons/icon-192.png', '192x192', 'any')],
      },
      {
        name: 'Withdraw',
        short_name: 'Withdraw',
        description: 'Request a payout to your mobile wallet',
        url: '/wallet/withdraw',
        icons: [icon('/icons/icon-192.png', '192x192', 'any')],
      },
    ],
  };
}
