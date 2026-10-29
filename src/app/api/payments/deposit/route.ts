import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/admin-auth';
import { normalizeMsisdn } from '@/lib/msisdn';
import { paymentsConfigured, requestToPay, ShashuraError } from '@/lib/shasure';
import { rules } from '@/lib/brand';
import { fmtUGX } from '@/lib/format';

type DepositBody = { amount?: number | string; msisdn?: string };

function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

/**
 * Opens a mobile-money collection.
 *
 * The browser never sees the gateway credentials: we create the pending deposit
 * row, push the USSD prompt from the server, and store the gateway `tid`. The
 * callback (`/api/webhooks/shasure`) credits the balance.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getSessionContext();
  if (!user) return fail('NOT_AUTHENTICATED', 'Sign in to deposit.', 401);

  let body: DepositBody;
  try {
    body = (await request.json()) as DepositBody;
  } catch {
    return fail('INVALID_BODY', 'Expected a JSON body.');
  }

  const amount = Math.floor(Number(body.amount));
  const msisdn = normalizeMsisdn(body.msisdn);

  if (!Number.isFinite(amount) || amount < rules.minDeposit) {
    return fail('AMOUNT_TOO_SMALL', `Minimum deposit is ${fmtUGX(rules.minDeposit)} UGX.`);
  }
  if (amount > rules.maxDeposit) {
    return fail('AMOUNT_TOO_LARGE', `Maximum deposit is ${fmtUGX(rules.maxDeposit)} UGX per request.`);
  }
  if (!msisdn) {
    return fail('INVALID_MSISDN', 'Enter a valid Ugandan mobile-money number.');
  }

  // Without gateway credentials the wallet stays in demo mode: credit at once.
  if (!paymentsConfigured) {
    const demo = await supabase.rpc('km_request_deposit', { p_amount: amount });
    if (demo.error) return fail('DEPOSIT_FAILED', demo.error.message, 500);
    const payload = demo.data as { ok?: boolean; data?: { deposit_id: string; amount: number }; message?: string } | null;
    if (!payload?.ok) return fail('DEPOSIT_FAILED', payload?.message ?? 'Could not credit the deposit.');

    const history = await supabase.rpc('km_list_deposits', { p_limit: 1 });
    const latest = Array.isArray(history.data) ? (history.data[0] as { reference?: string }) : null;

    return NextResponse.json({
      ok: true,
      data: {
        deposit_id: payload.data?.deposit_id,
        reference: latest?.reference ?? '',
        amount,
        status: 'confirmed',
        simulated: true,
      },
    });
  }

  const created = await supabase.rpc('km_create_deposit', { p_amount: amount, p_msisdn: msisdn });
  if (created.error) return fail('DEPOSIT_FAILED', created.error.message, 500);

  const row = created.data as {
    ok?: boolean;
    code?: string;
    message?: string;
    data?: { deposit_id: string; reference: string; amount: number };
  } | null;
  if (!row?.ok || !row.data) {
    return fail(row?.code ?? 'DEPOSIT_FAILED', row?.message ?? 'Could not open the deposit.');
  }

  try {
    const collection = await requestToPay({ msisdn, amount, reference: row.data.reference });
    await supabase.rpc('km_attach_deposit', {
      p_deposit_id: row.data.deposit_id,
      p_provider_ref: collection.tid,
      p_status: 'pending',
    });

    return NextResponse.json({
      ok: true,
      data: {
        deposit_id: row.data.deposit_id,
        reference: row.data.reference,
        amount,
        tid: collection.tid,
        status: 'pending',
        simulated: false,
        message: collection.message,
      },
    });
  } catch (error) {
    const failure =
      error instanceof ShashuraError
        ? error
        : new ShashuraError('PAYMENT_FAILED', 'The payment gateway could not start the collection.');

    await supabase.rpc('km_attach_deposit', {
      p_deposit_id: row.data.deposit_id,
      p_provider_ref: failure.code,
      p_status: 'failed',
    });

    return fail(failure.code, failure.message, 502);
  }
}
