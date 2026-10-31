import { adminGuard, fail, readBody, writeRpc } from '@/lib/admin-route';

type Body = { id?: string };

/**
 * Confirms one deposit by hand.
 *
 * Used when the money is visibly at the operator but the gateway callback never
 * reached us (or the sweep marked the collection failed). The SQL flips the
 * status, credits the wallet, and writes the ledger row in one transaction, so
 * a double click or a late callback can never credit twice.
 */
export async function POST(request: Request) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;

  const body = await readBody<Body>(request);
  const id = body?.id?.trim();
  if (!id) return fail('INVALID_ID', 'Missing deposit id.');

  return writeRpc(guard.admin, 'km_admin_confirm_deposit', {
    p_id: id,
    p_admin: guard.email,
  });
}
