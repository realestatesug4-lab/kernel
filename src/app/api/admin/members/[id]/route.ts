import { adminGuard, fail, readRpc } from '@/lib/admin-route';

/** One member in full: balance, packs, ledger, deposits, payouts, team. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  if (!id) return fail('INVALID_ID', 'Missing member id.');

  return readRpc(guard.admin, 'km_admin_member_detail', { p_user_id: id });
}
