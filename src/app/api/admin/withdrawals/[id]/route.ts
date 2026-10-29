import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/admin-auth';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { normalizeMsisdn } from '@/lib/msisdn';
import { disburse, paymentsConfigured, ShashuraError } from '@/lib/shasure';

type Action = 'approve' | 'reject';
type Body = { action?: Action; reason?: string };

type RpcEnvelope<T> = { ok?: boolean; code?: string; message?: string; data?: T };

function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

/**
 * Releases or rejects a withdrawal.
 *
 * Approve : the request is locked to `approved`, then the payout is pushed from
 *           the server. If the gateway refuses, the request is rejected again
 *           so the held amount returns to the member automatically.
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

  if (body.action !== 'approve') {
    return fail('INVALID_ACTION', 'Action must be approve or reject.');
  }

  const approved = await admin.rpc('km_admin_approve_withdrawal', { p_id: id });
  if (approved.error) return fail('APPROVE_FAILED', approved.error.message, 500);

  const row = approved.data as
    | RpcEnvelope<{
        id: string;
        amount: number;
        net: number;
        destination: string;
        reference: string;
        provider_ref: string | null;
        status: string;
      }>
    | null;
  if (!row?.ok || !row.data) {
    return fail(row?.code ?? 'APPROVE_FAILED', row?.message ?? 'Could not approve the request.');
  }

  const payout = row.data;
  const msisdn = normalizeMsisdn(payout.destination);

  // A payout was already pushed (retry after an interrupted request): never pay twice.
  if (payout.provider_ref) {
    return NextResponse.json({
      ok: true,
      data: {
        status: payout.status,
        tid: payout.provider_ref,
        net: payout.net,
        destination: msisdn ?? payout.destination,
        message: 'Payout already submitted to the network.',
      },
    });
  }

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
      data: { status: 'paid', simulated: true, net: payout.net, destination: msisdn },
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
        data: { status: 'approved', tid: payout.reference, net: payout.net, destination: msisdn },
      });
    }

    // Refund and close: the member can retry once the issue is fixed.
    await admin.rpc('km_admin_reject_withdrawal', { p_id: id, p_reason: failure.message });

    return fail(failure.code, failure.message, 502);
  }
}
