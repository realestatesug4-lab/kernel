'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useSession } from '@/components/providers/SessionProvider';
import { TabBar } from '@/components/layout/TabBar';
import { Spinner } from '@/components/ui';

/** Client route guard + mobile app frame (centered column, bottom tab bar). */
export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <Spinner className="size-7" />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-[480px] bg-bg">
      <main className="pb-24">{children}</main>
      <TabBar />
    </div>
  );
}
