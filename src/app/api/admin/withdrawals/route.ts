import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/admin-auth';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';

function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

/** Admin queue: every withdrawal awaiting review, newest last. */
export async function GET(request: Request) {
  const { user, isAdmin } = await getSessionContext();
  if (!user) return fail('NOT_AUTHENTICATED', 'Sign in first.', 401);
  if (!isAdmin) return fail('FORBIDDEN', 'This area is restricted to approved admins.', 403);
  if (!hasServiceRole) {
    return fail('NOT_CONFIGURED', 'Set SUPABASE_SERVICE_ROLE_KEY to enable the payment admin tools.', 503);
  }

  const status = new URL(request.url).searchParams.get('status') || 'pending';
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('km_admin_list_withdrawals', { p_status: status });

  if (error) return fail('QUERY_FAILED', error.message, 500);
  return NextResponse.json({ ok: true, data: data ?? [] });
}
