import 'server-only';
import type { User } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';

/** Comma-separated `ADMIN_EMAILS` env var — the only accounts allowed to release payouts. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && adminEmails().includes(email.toLowerCase()));
}

export async function getSessionContext(): Promise<{
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  user: User | null;
  isAdmin: boolean;
}> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user ?? null, isAdmin: isAdminEmail(data.user?.email) };
}
