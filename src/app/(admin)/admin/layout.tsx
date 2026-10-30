import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/admin-auth';
import { AdminShell } from '@/components/admin/AdminShell';

export const metadata: Metadata = { title: 'Operations' };

// The console is per-request and never cached: it reads the session cookie and
// live figures.
export const dynamic = 'force-dynamic';

/**
 * Server-side gate. `/api/admin/*` re-checks too — this only stops the shell
 * from rendering for somebody who cannot use it.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = await getSessionContext();
  if (!user) redirect('/login');
  if (!isAdmin) redirect('/me');

  return <AdminShell identity={user.email ?? 'Signed in'}>{children}</AdminShell>;
}
