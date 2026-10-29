import 'server-only';
import type { User } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { LOGIN_DOMAIN } from '@/lib/identity';

/** Comma-separated `ADMIN_EMAILS` env var — the only accounts allowed to release payouts. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const address = email.toLowerCase();
  const entries = adminEmails();
  if (entries.includes(address)) return true;

  // Accounts created through the username flow hold a private address on our
  // own login domain, so `ADMIN_EMAILS` may also list the bare username.
  // Gmail-style addresses are never shortened this way.
  const suffix = `@${LOGIN_DOMAIN}`;
  return address.endsWith(suffix) && entries.includes(address.slice(0, -suffix.length));
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
