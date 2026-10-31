import { NextResponse } from 'next/server';
import { adminGuard } from '@/lib/admin-route';
import { reconcileStuckTransactions } from '@/lib/reconcile';

/**
 * On-demand reconciliation sweep for the console (deposits + payouts pages).
 * Resolves pending rows whose SHASHURA callback never arrived by asking the
 * gateway directly and replaying the settlement. Idempotent: safe to click
 * repeatedly.
 */
export async function POST() {
  const guard = await adminGuard();
  if (!guard.ok) return guard.response;

  try {
    const report = await reconcileStuckTransactions();
    return NextResponse.json({ ok: true, data: report });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: 'RECONCILE_FAILED',
        message: error instanceof Error ? error.message : 'The gateway reconciliation failed.',
      },
      { status: 502 },
    );
  }
}
