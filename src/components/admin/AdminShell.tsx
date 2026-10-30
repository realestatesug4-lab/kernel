'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowUpFromLine, LayoutDashboard, LifeBuoy, LogOut,
  Package, Pickaxe, ScrollText, SlidersHorizontal, Users,
} from 'lucide-react';
import { useSession } from '@/components/providers/SessionProvider';

type NavItem = { href: string; label: string; icon: ComponentType<{ className?: string }> };

const NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/members', label: 'Members', icon: Users },
  { href: '/admin/deposits', label: 'Deposits', icon: ArrowDownToLine },
  { href: '/admin/withdrawals', label: 'Payouts', icon: ArrowUpFromLine },
  { href: '/admin/investments', label: 'Mining', icon: Pickaxe },
  { href: '/admin/ledger', label: 'Ledger', icon: ScrollText },
  { href: '/admin/products', label: 'Packs', icon: Package },
  { href: '/admin/notices', label: 'Support', icon: LifeBuoy },
  { href: '/admin/settings', label: 'Settings', icon: SlidersHorizontal },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 px-1">
      <span className="grid size-8 place-items-center rounded-xl brand-gradient text-sm font-extrabold text-black">
        K
      </span>
      <span className="leading-tight">
        <span className="block text-[13px] font-bold text-fg">KernelMiners</span>
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-accent-2">
          Operations
        </span>
      </span>
    </Link>
  );
}

/**
 * Console frame: persistent sidebar from `lg`, a scrolling nav strip below it.
 * Deliberately outside the member AppShell — no bottom tab bar, wider canvas.
 */
export function AdminShell({
  children,
  identity,
}: {
  children: ReactNode;
  identity: string;
}) {
  const pathname = usePathname();
  const { signOut } = useSession();

  return (
    <div className="min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-3 py-4">
          <Brand />
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
                  active ? 'bg-accent-soft text-accent-2' : 'text-muted hover:bg-surface-2 hover:text-fg'
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line px-3 py-3">
          <p className="truncate text-[11px] text-muted">{identity}</p>
          <div className="mt-2 flex items-center gap-2">
            <Link
              href="/me"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[11px] font-semibold text-fg transition hover:border-accent/60"
            >
              <ArrowLeft className="size-3" />
              Member app
            </Link>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="grid size-7 place-items-center rounded-lg border border-line text-muted transition hover:border-neg/60 hover:text-neg"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md lg:hidden">
          <div className="flex h-12 items-center justify-between px-3">
            <Brand />
            <Link
              href="/me"
              className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-muted"
            >
              <ArrowLeft className="size-3" />
              App
            </Link>
          </div>
          <nav className="no-scrollbar flex gap-1 overflow-x-auto px-2 pb-2">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                    active
                      ? 'border-accent/40 bg-accent-soft text-accent-2'
                      : 'border-line text-muted'
                  }`}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1180px] px-4 py-5 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

/** Page title block shared by every console screen. */
export function AdminHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-extrabold tracking-tight text-fg lg:text-xl">{title}</h1>
        {description && <p className="mt-0.5 text-[12px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
