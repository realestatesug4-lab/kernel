'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Pickaxe, LineChart, Users, UserRound } from 'lucide-react';
import type { ComponentType } from 'react';
import { nav } from '@/lib/brand';

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  home: Home,
  pick: Pickaxe,
  chart: LineChart,
  users: Users,
  user: UserRound,
};

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] border-t border-line bg-surface/90 backdrop-blur-md">
      <ul className="grid grid-cols-5">
        {nav.tabs.map((tab) => {
          const Icon = ICONS[tab.icon] ?? Home;
          const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition ${
                  active ? 'text-accent-2' : 'text-muted hover:text-fg'
                }`}
              >
                <Icon className={`size-[22px] ${active ? 'drop-shadow-[0_0_8px_rgba(255,198,0,0.6)]' : ''}`} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
