import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { brand } from '@/lib/brand';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

/**
 * Canonical origin used to turn share-card paths into absolute URLs.
 *
 * Read from a single build-time value on purpose: `cacheComponents` refuses to
 * prerender metadata that touches runtime data, so `next.config.ts` bakes the
 * Vercel host into `NEXT_PUBLIC_SITE_URL` instead of reading it here.
 * Empty values and hostnames without a scheme fall back safely.
 */
function siteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? '';
  const candidate = raw
    ? /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
      ? raw
      : `https://${raw}`
    : 'http://localhost:3000';

  try {
    return new URL(candidate);
  } catch {
    return new URL('http://localhost:3000');
  }
}

const shareTitle = `${brand.name} — ${brand.tagline}`;
/** 1200x630 card built from the shipped logo; see scripts/pwa-assets.mjs. */
const shareImage = {
  url: '/og/og-default.jpg',
  width: 1200,
  height: 630,
  type: 'image/jpeg',
  alt: shareTitle,
};

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: shareTitle,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  applicationName: brand.name,
  openGraph: {
    type: 'website',
    siteName: brand.name,
    url: '/',
    locale: 'en_UG',
    title: shareTitle,
    description: brand.description,
    images: [shareImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: shareTitle,
    description: brand.description,
    images: [shareImage.url],
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/icons/icon-192.png'],
  },
  appleWebApp: {
    capable: true,
    title: brand.short,
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: '#ff6a00',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg text-fg">
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
