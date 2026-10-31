import { NextResponse } from 'next/server';
import { reconcileStuckTransactions } from '@/lib/reconcile';

/**
 * Gateway reconciliation sweep.
 *
 * SHASHURA settles collections and payouts through the `transaction.finalized`
 * callback. When a callback is lost — misconfigured callback URL, secret
 * mismatch, a deployment in the moment it fired — the transaction would stay
 * pending forever even though the network already moved the money. This route
 * looks every stuck row up with `GET /enquiry/{reference}` and feeds the
 * gateway's answer into the same idempotent settlement the webhook uses.
 *
 * Guarded by CRON_SECRET exactly like /api/cron/accrue. On Vercel Pro this can
 * be scheduled every few minutes via vercel.json; on Hobby (one daily cron) it
 * is still useful as a manual operator call — `curl -H "Authorization: Bearer
 * $CRON_SECRET" <url>` — while daily cleanup rides the accrue cron and traffic
 * itself triggers background sweeps via scheduleBackgroundReconcile().
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get('authorization') ?? '';

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORISED', message: 'Cron secret is missing or wrong.' },
      { status: 401 },
    );
  }

  try {
    const report = await reconcileStuckTransactions();
    return NextResponse.json({ ok: true, data: report });
  } catch (error) {
    return NextResponse.json(
      { ok: false, code: 'RECONCILE_FAILED', message: error instanceof Error ? error.message : 'Sweep failed.' },
      { status: 500 },
    );
  }
}
