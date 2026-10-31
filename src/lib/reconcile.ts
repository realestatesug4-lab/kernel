import 'server-only';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enquiry, paymentsConfigured, ShashuraError } from '@/lib/shasure';
import type { ReconcileItem, ReconcileReport } from '@/lib/types';

/**
 * Gateway reconciliation — the safety net behind `transaction.finalized`.
 *
 * Settlement of a collection or payout is normally driven by the SHASHURA
 * callback. When a callback never arrives — the app's callback URL is wrong or
 * unset, the signing secret mismatches, the deployment URL changed, or the
 * server was down at that moment — the transaction stays open forever even
 * though the network already moved the money. `GET /enquiry/{reference}` is
 * the authoritative lookup by *our* reference, so a sweep can close exactly
 * the same settlement path the webhook would (`km_settle_payment` is
 * idempotent, so a late callback after a sweep — or the other way round — is
 * harmless).
 *
 * Sweep scope, deliberately narrow:
 *   deposits     still `pending` after the grace window (callback never came)
 *   withdrawals  `approved` WITH a provider_ref — already pushed to the
 *                gateway, waiting for finalisation. Manual payouts are never
 *                touched: they have no gateway transaction to reconcile.
 * Rows younger than the grace window are left alone so in-flight USSD prompts
 * settle through the normal callback path.
 *
 * Cadence without a frequent cron (Vercel Hobby allows one daily run): the
 * sweep rides the daily accrue cron, can be fired from the console, from
 * /api/cron/reconcile when a secret curl is handy, and — via
 * `scheduleBackgroundReconcile()` — opportunistically after real traffic:
 * every deposit creation and every admin deposits view tops up the queue.
 */

/** Give the callback this long before the sweep steps in. */
const GRACE_MS = 2 * 60_000;
/** One sweep makes at most this many gateway calls per table. */
const BATCH = 25;
/** Background sweeps stay small: they run inside the request's grace period. */
const BACKGROUND_BATCH = 8;
/** Per-instance floor between opportunistic background sweeps. */
const BACKGROUND_GAP_MS = 10 * 60_000;

type Candidate = { id: string; reference: string; kind: ReconcileItem['kind'] };
type ReconcileBase = Omit<ReconcileItem, 'outcome'>;

export async function reconcileStuckTransactions(limit: number = BATCH): Promise<ReconcileReport> {
  const report: ReconcileReport = { checked: 0, resolved: [], pending: [], errors: [] };
  if (!paymentsConfigured) {
    report.skipped = 'payments_not_configured';
    return report;
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - GRACE_MS).toISOString();

  const { data: deposits, error: depErr } = await admin
    .from('km_deposit')
    .select('id, reference')
    .eq('status', 'pending')
    .not('reference', 'is', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (depErr) throw new Error(`deposits: ${depErr.message}`);

  const { data: withdrawals, error: wdErr } = await admin
    .from('km_withdrawal')
    .select('id, reference')
    .eq('status', 'approved')
    .not('provider_ref', 'is', null)
    .not('reference', 'is', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (wdErr) throw new Error(`withdrawals: ${wdErr.message}`);

  const candidates: Candidate[] = [
    ...(deposits ?? []).map((row) => ({ ...row, kind: 'deposit' as const })),
    ...(withdrawals ?? []).map((row) => ({ ...row, kind: 'withdrawal' as const })),
  ];

  return reconcileAgainstGateway(admin, candidates);
}

// Module-scope, so it throttles per serverless instance — deliberately loose:
// the sweep is idempotent and the gateway tolerates repeat enquiries.
let lastBackgroundAt = 0;

/**
 * Queue a small reconciliation sweep to run AFTER the current response is
 * sent (`after()` → waitUntil semantics), at most once per BACKGROUND_GAP_MS
 * per instance. Call it from routes that touch money: it replaces the frequent
 * cron that Vercel Hobby does not allow. Never throws — a missing request
 * context or a failed sweep just means the next trigger retries.
 */
export function scheduleBackgroundReconcile() {
  if (!paymentsConfigured) return;
  const now = Date.now();
  if (now - lastBackgroundAt < BACKGROUND_GAP_MS) return;
  lastBackgroundAt = now;

  try {
    after(async () => {
      try {
        await reconcileStuckTransactions(BACKGROUND_BATCH);
      } catch {
        lastBackgroundAt = 0; // let the next request try sooner
      }
    });
  } catch {
    lastBackgroundAt = 0;
    // Not inside a request render (or after() unsupported): silently skip.
  }
}

/**
 * Ask the gateway about each candidate and replay the settlement the webhook
 * would have delivered. Exposed for the member-facing recheck, which feeds it
 * only their own stuck deposits.
 */
export async function reconcileAgainstGateway(
  admin: ReturnType<typeof createAdminClient>,
  candidates: Candidate[],
): Promise<ReconcileReport> {
  const report: ReconcileReport = { checked: 0, resolved: [], pending: [], errors: [] };

  for (const row of candidates) {
    report.checked += 1;
    const base: ReconcileBase = { id: row.id, kind: row.kind, reference: row.reference };

    try {
      const result = await enquiry(row.reference);

      if (!result) {
        // The gateway has no record of this reference at all: the collection
        // or payout never reached it, so no callback will ever come. Close it
        // as failed — for a withdrawal this refunds the member's hold.
        await settle(admin, row, 'FAILED', null);
        report.resolved.push({ ...base, outcome: 'not_found_failed', reason: 'No transaction at the gateway' });
        continue;
      }

      if (result.state === 'TS') {
        await settle(admin, row, 'SUCCESSFUL', result.tid);
        report.resolved.push({ ...base, outcome: 'settled_success', tid: result.tid });
      } else if (result.state === 'TF') {
        await settle(admin, row, 'FAILED', result.tid);
        report.resolved.push({ ...base, outcome: 'settled_failed', tid: result.tid });
      } else {
        report.pending.push({ ...base, outcome: 'still_pending', tid: result.tid });
      }
    } catch (error) {
      report.errors.push({
        ...base,
        outcome: 'error',
        reason: error instanceof ShashuraError ? error.message : 'Gateway lookup failed',
      });
    }
  }

  return report;
}

/** Same envelope the webhook feeds: kind by table, idempotent on the SQL side. */
async function settle(
  admin: ReturnType<typeof createAdminClient>,
  row: Candidate,
  status: 'SUCCESSFUL' | 'FAILED',
  tid: string | null,
) {
  const { error } = await admin.rpc('km_settle_payment', {
    p_reference: row.reference,
    p_kind: row.kind === 'deposit' ? 'COLLECTION' : 'DISBURSEMENT',
    p_status: status,
    p_tid: tid,
    p_amount: null,
  });
  if (error) throw new Error(`km_settle_payment: ${error.message}`);
}
