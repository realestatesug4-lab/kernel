import { NextResponse } from 'next/server';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { reconcileStuckTransactions } from '@/lib/reconcile';

/**
 * Midnight earnings distribution.
 *
 * Vercel Cron calls this daily at 21:00 UTC — 00:00 East Africa Time — which is
 * the settlement boundary every pack is keyed to. `km_payout_tick` credits each
 * active pack the cycles that have come due since the last run and writes an
 * audit row to `km_payout_run`.
 *
 * Safe to call more than once a day (and to call from pg_cron as well): accrual
 * only pays whole elapsed cycles, so a second run credits nothing.
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

  if (!hasServiceRole) {
    return NextResponse.json(
      { ok: false, code: 'NOT_CONFIGURED', message: 'SUPABASE_SERVICE_ROLE_KEY is not set.' },
      { status: 503 },
    );
  }

  const { data, error } = await createAdminClient().rpc('km_payout_tick', {
    p_source: 'vercel-cron',
  });

  if (error) {
    return NextResponse.json(
      { ok: false, code: 'PAYOUT_FAILED', message: error.message },
      { status: 500 },
    );
  }

  // Piggyback the reconciliation sweep: on plans where the extra cron entry in
  // vercel.json is not available, this at least clears lost callbacks once a
  // day. A failure here must not obscure a successful accrual run.
  let reconciled: unknown = null;
  try {
    reconciled = await reconcileStuckTransactions();
  } catch {
    reconciled = { skipped: 'reconcile_failed' };
  }

  return NextResponse.json({ ...(data as object), reconciled });
}
