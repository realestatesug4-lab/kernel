'use client';

import { isSupabaseConfigured } from '@/lib/supabase/config';

/** Shown on public screens until the Supabase project is wired up. */
export function SetupNotice() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="mb-4 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-xs leading-relaxed text-fg">
      <p className="font-semibold">Demo mode — backend not connected</p>
      <p className="mt-1 text-muted">
        Copy <code className="rounded bg-surface-2 px-1">.env.example</code> to{' '}
        <code className="rounded bg-surface-2 px-1">.env.local</code> with your Supabase URL &amp;
        anon key, then run the SQL in <code className="rounded bg-surface-2 px-1">supabase/migrations</code>.
      </p>
    </div>
  );
}
