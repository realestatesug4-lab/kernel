import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionContext } from '@/lib/admin-auth';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';

/**
 * Shared plumbing for `/api/admin/*`.
 *
 * Every handler starts with `adminGuard()`. It re-derives the session from the
 * request cookies — an admin flag rendered into the client is never trusted —
 * and only then hands back a service-role client.
 */

export function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

type Guard =
  | { ok: true; admin: SupabaseClient; email: string | null }
  | { ok: false; response: NextResponse };

export async function adminGuard(): Promise<Guard> {
  const { user, isAdmin } = await getSessionContext();
  if (!user) return { ok: false, response: fail('NOT_AUTHENTICATED', 'Sign in first.', 401) };
  if (!isAdmin) {
    return { ok: false, response: fail('FORBIDDEN', 'This area is restricted to approved admins.', 403) };
  }
  if (!hasServiceRole) {
    return {
      ok: false,
      response: fail('NOT_CONFIGURED', 'Set SUPABASE_SERVICE_ROLE_KEY to enable the admin console.', 503),
    };
  }
  return { ok: true, admin: createAdminClient(), email: user.email ?? null };
}

/** Calls a read function and passes its jsonb straight through. */
export async function readRpc(
  admin: SupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) return fail('QUERY_FAILED', error.message, 500);
  return NextResponse.json({ ok: true, data });
}

/**
 * Calls a mutation that returns a `km_ok` / `km_err` envelope and unwraps it,
 * so the browser always sees `{ ok, data }` or `{ ok:false, code, message }`.
 */
export async function writeRpc(
  admin: SupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) return fail('QUERY_FAILED', error.message, 500);

  const envelope = data as { ok?: boolean; code?: string; message?: string; data?: unknown } | null;
  if (!envelope || envelope.ok !== true) {
    return fail(
      envelope?.code ?? 'FAILED',
      envelope?.message ?? 'The change was not saved.',
    );
  }
  return NextResponse.json({ ok: true, data: envelope.data ?? null });
}

/** Reads a JSON body, tolerating an empty one. */
export async function readBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
