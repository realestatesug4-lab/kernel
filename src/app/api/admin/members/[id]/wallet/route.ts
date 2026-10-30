import { adminGuard, fail, readBody, writeRpc } from '@/lib/admin-route';

type Body = { direction?: string; amount?: number; note?: string };

/**
 * Credits or debits one member's wallet.
 *
 * The amount lands in `available` and a ledger row (admin_credit / admin_debit)
 * is written in the same transaction, so the movement shows up in the member's
 * own wallet history and in the console ledger. `earned_total` is untouched —
 * a manual credit is not mining income.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  if (!id) return fail('INVALID_ID', 'Missing member id.');

  const body = await readBody<Body>(request);
  if (!body) return fail('INVALID_BODY', 'Expected a JSON body.');

  const direction = body.direction === 'debit' ? 'debit' : body.direction === 'credit' ? 'credit' : null;
  if (!direction) return fail('BAD_DIRECTION', 'Direction must be credit or debit.');

  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return fail('BAD_AMOUNT', 'Enter an amount greater than zero.');
  }

  return writeRpc(guard.admin, 'km_admin_adjust_wallet', {
    p_user_id: id,
    p_direction: direction,
    p_amount: amount,
    p_note: typeof body.note === 'string' ? body.note.trim() : null,
    p_admin: guard.email,
  });
}
