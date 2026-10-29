'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { Download, EllipsisVertical, Share, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Card } from '@/components/ui';
import { brand } from '@/lib/brand';

/** Chromium fires this once the manifest, worker and icons all pass its checks. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const noSubscription = () => () => {};
const serverSnapshot = () => false;

const standaloneQuery = () => window.matchMedia('(display-mode: standalone)');

function subscribeToDisplayMode(onChange: () => void) {
  const query = standaloneQuery();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function readStandalone() {
  return standaloneQuery().matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function readIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * "Download app" entry point for the installable PWA.
 *
 * The button consumes `beforeinstallprompt` when the browser offers it, and
 * otherwise opens a short how-to sheet (iOS Safari has no prompt API at all).
 */
export function InstallApp() {
  const standalone = useSyncExternalStore(subscribeToDisplayMode, readStandalone, serverSnapshot);
  const ios = useSyncExternalStore(noSubscription, readIos, serverSnapshot);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setJustInstalled(true);
      setPrompt(null);
      setHelpOpen(false);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (standalone || justInstalled) return null;

  async function download() {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') setPrompt(null);
      return;
    }
    setHelpOpen(true);
  }

  return (
    <>
      <Card className="p-3.5">
        <div className="flex items-center gap-3">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-2xl border border-line"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Get the app</p>
            <p className="text-[11px] leading-snug text-muted">
              Full screen, offline-ready — straight to your home screen, no store needed.
            </p>
          </div>
        </div>
        <Button size="sm" block className="mt-3" onClick={download} icon={<Download className="size-4" />}>
          Download app
        </Button>
      </Card>

      {helpOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="animate-rise w-full max-w-[480px] rounded-t-3xl border-t border-line bg-surface p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-1 flex items-start justify-between gap-3">
              <h2 id="install-title" className="text-base font-bold">
                Install {brand.name}
              </h2>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="Close"
                className="grid size-8 place-items-center rounded-full bg-surface-2 text-muted hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs text-muted">
              This browser will not offer the install prompt, so add the app from its menu:
            </p>

            <ol className="mt-4 space-y-3">
              {ios ? (
                <>
                  <Step icon={<Share className="size-4" />}>
                    Tap <b>Share</b> in Safari&rsquo;s toolbar.
                  </Step>
                  <Step icon={<Download className="size-4" />}>
                    Choose <b>Add to Home Screen</b>, then tap <b>Add</b>.
                  </Step>
                </>
              ) : (
                <>
                  <Step icon={<EllipsisVertical className="size-4" />}>
                    Open the browser menu (<b>&#8942;</b>).
                  </Step>
                  <Step icon={<Download className="size-4" />}>
                    Tap <b>Install app</b> or <b>Add to Home screen</b>.
                  </Step>
                </>
              )}
            </ol>

            <p className="mt-4 text-[11px] leading-relaxed text-muted">
              On desktop Chrome or Edge, the install icon in the address bar does the same thing.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Step({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-2">{icon}</span>
      <span className="pt-1 text-[13px] leading-snug">{children}</span>
    </li>
  );
}
