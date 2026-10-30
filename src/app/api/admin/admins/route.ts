import { adminGuard, fail, readBody, readRpc, writeRpc } from '@/lib/admin-route';

type RoleBody = { username?: string; enabled?: boolean };

/** Accounts that hold the super-admin flag. */
export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  return readRpc(guard.admin, 'km_admin_list_admins');
}

/** Promote or demote a member. The database refuses to remove the last admin. */
export async function POST(request: Request) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;

  const body = await readBody<RoleBody>(request);
  if (!body?.username) return fail('INVALID_BODY', 'Enter the username to promote.');

  return writeRpc(guard.admin, 'km_admin_set_admin', {
    p_username: body.username,
    p_enabled: body.enabled ?? true,
  });
}
