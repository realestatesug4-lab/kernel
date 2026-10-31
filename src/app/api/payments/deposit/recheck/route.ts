import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/admin-auth';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { reconcileAgainstGateway } from '@/lib/reconcile';
import { paymentsConfigured } from '@/lib/shasure';

/**
 * Self-service recheck for a member's own stuck collections.
 *
 * Normally the SHASHURA callback credits a deposit within seconds. When the
 * callback is lost, the wallet page would show `pending` forever — this route
 * takes the member's own pending deposits older than a minute and asks the
 * gateway directly (`/enquiry/{reference}`), replaying the settlement for any
 * that actually completed. Owner-scoped by construction: the candidate list
 * comes from `km_list_deposits`, which only ever returns auth.uid()'s rows.
 */
const GRACE_MS = 60_000;

export async function POST() {
  const { supabase, user } = await getSessionContext();
  if (!user) {
    return NextResponse.json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Sign in first.' }, { status: 401 });
  }
  if (!paymentsConfigured || !hasServiceRole) {
    // Demo mode or an unconfigured server: nothing exists at the gateway.
    return NextResponse.json({ ok: true, data: { checked: 0, resolved: [], pending: [], errors: [] } });
  }

  const list = await supabase.rpc('km_list_deposits', { p_limit: 10 });
  const rows = Array.isArray(list.data) ? (list.data as unknown[]) : [];
  const cutoff = Date.now() - GRACE_MS;

  const candidates = rows
    .map((raw) => raw as { id: string; reference: string | null; status: string; created_at: string })
    .filter(
      (row) =>
        row.status === 'pending' &&
        row.reference &&
        new Date(row.created_at).getTime() < cutoff,
    )
    .slice(0, 5)
    .map((row) => ({ id: row.id, reference: row.reference as string, kind: 'deposit' as const }));

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, data: { checked: 0, resolved: [], pending: [], errors: [] } });
  }

  try {
    const report = await reconcileAgainstGateway(createAdminClient(), candidates);
    return NextResponse.json({ ok: true, data: report });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: 'RECHECK_FAILED',
        message: error instanceof Error ? error.message : 'The gateway recheck failed.',
      },
      { status: 502 },
    );
  }
}
