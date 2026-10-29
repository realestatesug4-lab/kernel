'use client';

import { useEffect } from 'react';

/**
 * Registers the PWA service worker (see public/sw.js). Skipped in development
 * so hot-reload traffic never hits a stale cache, and failures stay harmless —
 * the app works without it, it just loses install/offline support.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
