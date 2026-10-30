import { adminGuard, readRpc } from '@/lib/admin-route';

/** The 360° snapshot behind /admin. */
export async function GET() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;
  return readRpc(guard.admin, 'km_admin_overview');
}
