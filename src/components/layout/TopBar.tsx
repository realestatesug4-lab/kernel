'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/layout/Logo';

/** Inner-page header: back chevron + centered title, matching the SPA nav pattern. */
export function TopBar({ title, right }: { title: ReactNode; right?: ReactNode }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface/80 px-3 backdrop-blur-md">
      <button
        onClick={() => router.back()}
        className="grid size-9 place-items-center rounded-full text-fg hover:bg-surface-2"
        aria-label="Back"
      >
        <ChevronLeft className="size-5" />
      </button>
      <h1 className="truncate text-[15px] font-semibold text-fg">{title}</h1>
      <div className="flex size-9 items-center justify-end">{right}</div>
    </header>
  );
}

/** Brand header for top-level screens (home) with a right-slot action. */
export function AppHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface/80 px-4 backdrop-blur-md">
      <Link href="/home" aria-label="Kernel home">
        <Logo />
      </Link>
      <div className="flex items-center gap-1">{right}</div>
    </header>
  );
}
