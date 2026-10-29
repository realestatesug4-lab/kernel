import { NextResponse } from 'next/server';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { verifyWebhookSignature } from '@/lib/shasure';

type Callback = {
  event?: string;
  environment?: string;
  tid?: string;
  external_ref?: string;
  type?: 'COLLECTION' | 'DISBURSEMENT' | string;
  status?: 'SUCCESSFUL' | 'FAILED' | string;
  amount?: number;
  charge?: number;
  net_amount?: number;
  msisdn?: string;
  timestamp?: string;
};

/**
 * SHASHURA `transaction.finalized` callback.
 *
 * The raw body is HMAC-SHA256 signed with the app's webhook secret. Deposits are
 * credited here (no admin step); payouts are marked paid, or refunded when the
 * network fails them. `km_settle_payment` is idempotent, so retries are safe.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get('x-shashura-signature');

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ ok: false, code: 'INVALID_SIGNATURE' }, { status: 401 });
  }

  let payload: Callback;
  try {
    payload = JSON.parse(raw) as Callback;
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_BODY' }, { status: 400 });
  }

  if (payload.event !== 'transaction.finalized') {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const reference = (payload.external_ref ?? '').trim();
  if (!reference) {
    return NextResponse.json({ ok: false, code: 'MISSING_REFERENCE' }, { status: 400 });
  }

  if (!hasServiceRole) {
    return NextResponse.json(
      { ok: false, code: 'NOT_CONFIGURED', message: 'SUPABASE_SERVICE_ROLE_KEY is not set.' },
      { status: 503 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('km_settle_payment', {
    p_reference: reference,
    p_kind: payload.type ?? '',
    p_status: payload.status ?? '',
    p_tid: payload.tid ?? null,
    p_amount: Math.round(Number(payload.amount) || 0),
  });

  if (error) {
    // 500 so the gateway retries — the settlement is idempotent.
    return NextResponse.json({ ok: false, code: 'SETTLE_FAILED', message: error.message }, { status: 500 });
  }

  const result = data as { ok?: boolean; code?: string; data?: unknown } | null;
  if (!result?.ok) {
    // Unknown reference: acknowledge so the gateway stops retrying.
    return NextResponse.json({ ok: true, ignored: true, code: result?.code ?? 'UNKNOWN_REFERENCE' });
  }

  return NextResponse.json({ ok: true, data: result.data });
}
