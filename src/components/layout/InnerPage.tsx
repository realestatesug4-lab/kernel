'use client';

import type { ReactNode } from 'react';
import { TopBar } from '@/components/layout/TopBar';

/** Standard authenticated inner page: sticky top bar + padded content column. */
export function InnerPage({
  title,
  right,
  children,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <TopBar title={title} right={right} />
      <div className="mx-auto w-full max-w-[480px] px-4 pb-8 pt-4">{children}</div>
    </>
  );
}
