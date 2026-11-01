import { NextResponse } from 'next/server';
import { adminGuard, fail, readBody } from '@/lib/admin-route';

type Body = { password?: string };

/**
 * Resets one member's login password.
 *
 * Two writes must agree: the auth hash goes through the service-role admin API,
 * and the console's readable copy on `km_profile.login_password` (0016) is
 * updated in the same request so the admin never sees a stale value after a
 * reset. Only approved admins reach this route — `adminGuard` re-checks the
 * session cookie and the admin flag on every call.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  if (!id) return fail('INVALID_ID', 'Missing member id.');

  const body = await readBody<Body>(request);
  if (!body) return fail('INVALID_BODY', 'Expected a JSON body.');

  const password = body.password ?? '';
  if (password.length < 6 || password.length > 72) {
    return fail('INVALID_PASSWORD', 'Password must be 6-72 characters.');
  }

  const { error: authError } = await guard.admin.auth.admin.updateUserById(id, { password });
  if (authError) {
    return fail('RESET_FAILED', authError.message || 'Could not reset the password.', 500);
  }

  const { error: profileError } = await guard.admin
    .from('km_profile')
    .update({ login_password: password })
    .eq('id', id);
  if (profileError) {
    return fail('RESET_FAILED', profileError.message, 500);
  }

  return NextResponse.json({ ok: true, data: { reset: true } });
}
