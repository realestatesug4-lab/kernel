import 'server-only';
import type { User } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { LOGIN_DOMAIN } from '@/lib/identity';

/** Comma-separated `ADMIN_EMAILS` env var — bootstrap list of accounts allowed to
 * release payouts. Day-to-day promotion happens in the database instead, see
 * `km_set_super_admin()` in `0009_super_admin.sql`. */
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
  const user = data.user ?? null;

  // Two sources, either one grants: `ADMIN_EMAILS` is the bootstrap / break-glass
  // list, the `is_super_admin` flag is what an operator sets from SQL with
  // `km_set_super_admin()` (0009_super_admin.sql). Signed out — or before that
  // migration is applied — the flag read simply yields nothing.
  let flagged = false;
  if (user) {
    const { data: isSuperAdmin } = await supabase.rpc('km_is_super_admin');
    flagged = isSuperAdmin === true;
  }

  return { supabase, user, isAdmin: flagged || isAdminEmail(user?.email) };
}
