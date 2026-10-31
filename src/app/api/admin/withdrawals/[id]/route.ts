import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/admin-auth';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { normalizeMsisdn } from '@/lib/msisdn';
import { disburse, paymentsConfigured, ShashuraError } from '@/lib/shasure';

type Action = 'approve' | 'release' | 'reject' | 'settle_manual';
type PayoutMethod = 'manual' | 'api';
type Body = { action?: Action; reason?: string; method?: PayoutMethod };

type RpcEnvelope<T> = { ok?: boolean; code?: string; message?: string; data?: T };

type Payout = {
  id: string;
  amount: number;
  net: number;
  destination: string;
  reference: string;
  status: string;
  approved_by: string | null;
};

function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

/**
 * The withdrawal gate, now with a payout method chosen at approval.
 *
 * Approve : locks the request to `approved`, records which admin opened the
 *           gate and *how* the money is meant to move:
 *           `manual` — the admin pays the member by hand and confirms with
 *                      settle_manual; nothing is ever sent to SHASHURA;
 *           `api`    — the payout is pushed through SHASHURA immediately, in
 *                      the same call.
 * Release : retry for an approved api request whose push did not complete.
 *           `km_admin_begin_payout` refuses manual rows, anything already
 *           sent, or anything that is not approved.
 * Reject  : the held amount is refunded to `available` and the request closed.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, isAdmin } = await getSessionContext();
  if (!user) return fail('NOT_AUTHENTICATED', 'Sign in first.', 401);
  if (!isAdmin) return fail('FORBIDDEN', 'This area is restricted to approved admins.', 403);
  if (!hasServiceRole) {
    return fail('NOT_CONFIGURED', 'Set SUPABASE_SERVICE_ROLE_KEY to enable the payment admin tools.', 503);
  }

  const { id } = await context.params;
  if (!id) return fail('INVALID_ID', 'Missing withdrawal id.');

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail('INVALID_BODY', 'Expected a JSON body.');
  }

  const admin = createAdminClient();

  if (body.action === 'reject') {
    const { data, error } = await admin.rpc('km_admin_reject_withdrawal', {
      p_id: id,
      p_reason: body.reason ?? null,
    });
    if (error) return fail('REJECT_FAILED', error.message, 500);

    const result = data as RpcEnvelope<unknown> | null;
    if (!result?.ok) return fail(result?.code ?? 'REJECT_FAILED', result?.message ?? 'Could not reject the request.');
    return NextResponse.json({ ok: true, data: { status: 'rejected' } });
  }

  // Step one: approve with a payout method. Manual queues; api pays right away.
  if (body.action === 'approve') {
    const method = body.method;
    if (method !== 'manual' && method !== 'api') {
      return fail('INVALID_METHOD', 'Choose a payout method: manual or api.');
    }

    const approved = await admin.rpc('km_admin_approve_withdrawal', {
      p_id: id,
      p_admin: user.email ?? null,
      p_method: method,
    });
    if (approved.error) return fail('APPROVE_FAILED', approved.error.message, 500);

    const row = approved.data as RpcEnvelope<{ status: string; approved_by: string | null }> | null;
    if (!row?.ok || !row.data) {
      return fail(row?.code ?? 'APPROVE_FAILED', row?.message ?? 'Could not approve the request.');
    }

    if (method === 'manual') {
      return NextResponse.json({
        ok: true,
        data: {
          status: row.data.status,
          payout_method: 'manual' as const,
          approved_by: row.data.approved_by,
          message: 'Approved as a manual payout. Send the money, then confirm it.',
        },
      });
    }

    // api: the approval and the payout are one decision — push now.
    return releasePayout(admin, id);
  }

  if (body.action === 'settle_manual') {
    const settled = await admin.rpc('km_admin_settle_manual_payout', { p_id: id, p_admin: user.email ?? null });
    if (settled.error) return fail('SETTLE_FAILED', settled.error.message, 500);

    const result = settled.data as RpcEnvelope<{ status: string; paid_by: string | null }> | null;
    if (!result?.ok) return fail(result?.code ?? 'SETTLE_FAILED', result?.message ?? 'Could not confirm the payout.');
    return NextResponse.json({ ok: true, data: { status: 'paid', paid_by: result.data?.paid_by ?? null } });
  }

  if (body.action !== 'release') {
    return fail('INVALID_ACTION', 'Action must be approve, release, settle_manual or reject.');
  }

  return releasePayout(admin, id);
}

/**
 * Step two: hand an approved, unsent api request to the gateway. A failure at
 * the network rejects the request again so the held amount returns to the
 * member's available balance automatically.
 */
async function releasePayout(admin: ReturnType<typeof createAdminClient>, id: string): Promise<Response> {
  const begun = await admin.rpc('km_admin_begin_payout', { p_id: id });
  if (begun.error) return fail('RELEASE_FAILED', begun.error.message, 500);

  const envelope = begun.data as RpcEnvelope<Payout> | null;
  if (!envelope?.ok || !envelope.data) {
    return fail(envelope?.code ?? 'RELEASE_FAILED', envelope?.message ?? 'Could not release the payout.');
  }

  const payout = envelope.data;
  const msisdn = normalizeMsisdn(payout.destination);

  // The destination must be a wallet the gateway can pay, otherwise refund it.
  if (!msisdn) {
    await admin.rpc('km_admin_reject_withdrawal', {
      p_id: id,
      p_reason: 'Destination is not a valid mobile-money number',
    });
    return fail('INVALID_MSISDN', 'The destination is not a valid mobile-money number. The request was refunded.', 422);
  }

  // Demo / unconfigured gateway: settle the queue without moving real money.
  if (!paymentsConfigured) {
    const paid = await admin.rpc('km_admin_mark_withdrawal_paid', { p_id: id, p_provider_ref: 'DEMO' });
    if (paid.error) return fail('PAYOUT_FAILED', paid.error.message, 500);
    return NextResponse.json({
      ok: true,
      data: { status: 'paid', payout_method: 'api' as const, simulated: true, net: payout.net, destination: msisdn },
    });
  }

  try {
    const transfer = await disburse({
      msisdn,
      amount: payout.net,
      reference: payout.reference,
      remarks: 'KernelMiners withdrawal',
    });

    await admin.rpc('km_admin_attach_payout', { p_id: id, p_provider_ref: transfer.tid });

    return NextResponse.json({
      ok: true,
      data: {
        status: transfer.status === 'TS' ? 'paid' : 'approved',
        payout_method: 'api' as const,
        tid: transfer.tid,
        net: payout.net,
        charge: transfer.charge,
        destination: msisdn,
        message: transfer.message,
        simulated: false,
      },
    });
  } catch (error) {
    const failure =
      error instanceof ShashuraError
        ? error
        : new ShashuraError('PAYOUT_FAILED', 'The payout could not be sent.');

    // The reference already exists at the gateway: an earlier attempt went out.
    if (failure.code === 'DUPLICATE_REFERENCE') {
      await admin.rpc('km_admin_attach_payout', { p_id: id, p_provider_ref: payout.reference });
      return NextResponse.json({
        ok: true,
        data: { status: 'approved', payout_method: 'api' as const, tid: payout.reference, net: payout.net, destination: msisdn },
      });
    }

    // Refund and close: the member can retry once the issue is fixed.
    await admin.rpc('km_admin_reject_withdrawal', { p_id: id, p_reason: failure.message });

    return fail(failure.code, failure.message, 502);
  }
}
