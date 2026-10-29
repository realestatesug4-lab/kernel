'use client';

import Link from 'next/link';
import { Globe } from 'lucide-react';
import type { ReactNode } from 'react';

/** Centered mobile column used by login/register/public pages (no tab bar). */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-bg">
      <div className="flex justify-end px-4 pt-4">
        <Link
          href="/settings/language"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-fg shadow-[var(--shadow)]"
        >
          <Globe className="size-4 text-muted" />
          English
        </Link>
      </div>
      <div className="flex-1 px-4 pb-10 pt-2">{children}</div>
    </div>
  );
}
