import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * SHASHURA gateway client — server only.
 *
 * Docs: https://www.shashura.com/developers
 * One base URL serves sandbox and production; `X-Target-Environment` picks which.
 * The client secret never reaches the browser: every call is made from a route
 * handler and the browser only ever sees our own JSON responses.
 */

const BASE = (process.env.SHASHURA_API_BASE || 'https://www.shashura.com/api/v1').replace(/\/+$/, '');
const CLIENT_ID = process.env.SHASHURA_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.SHASHURA_CLIENT_SECRET ?? '';
const WEBHOOK_SECRET = process.env.SHASHURA_WEBHOOK_SECRET ?? '';
const ENVIRONMENT = process.env.SHASHURA_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
const COUNTRY = process.env.SHASHURA_COUNTRY || 'UG';

/** Collections + payouts are possible only with client credentials. */
export const paymentsConfigured = Boolean(CLIENT_ID && CLIENT_SECRET);
/** Callbacks are only trusted when a signing secret is configured. */
export const webhooksConfigured = Boolean(WEBHOOK_SECRET);

export const paymentEnvironment = ENVIRONMENT;

export class ShashuraError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'ShashuraError';
    this.code = code;
    this.status = status;
  }
}

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const res = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CLIENT-ID': CLIENT_ID,
      'X-Target-Environment': ENVIRONMENT,
      'X-COUNTRY': COUNTRY,
    },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
    cache: 'no-store',
  });

  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const data = payload?.data as Record<string, unknown> | undefined;
  const token = typeof data?.access_token === 'string' ? data.access_token : '';

  if (!res.ok || !token) {
    throw new ShashuraError(
      String(payload?.code ?? 'AUTH_FAILED'),
      'Could not authenticate with the payment gateway. Check the API credentials.',
      502,
    );
  }

  const ttl = Number(data?.expires_in) || 3600;
  tokenCache = { token, expiresAt: Date.now() + ttl * 1000 };
  return token;
}

async function call(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: Record<string, unknown> } = {},
): Promise<Record<string, unknown>> {
  if (!paymentsConfigured) {
    throw new ShashuraError('PAYMENTS_NOT_CONFIGURED', 'Mobile-money payments are not configured yet.', 503);
  }

  const token = await accessToken();
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-CLIENT-ID': CLIENT_ID,
      'X-Target-Environment': ENVIRONMENT,
      'X-COUNTRY': COUNTRY,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });

  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (res.status === 401) tokenCache = null;
  if (!res.ok || payload?.status === 'error') {
    throw new ShashuraError(
      String(payload?.code ?? `HTTP_${res.status}`),
      humanError(String(payload?.code ?? ''), String(payload?.message ?? '')),
      res.status,
    );
  }

  return payload ?? {};
}

function humanError(code: string, fallback: string): string {
  switch (code) {
    case 'INSUFFICIENT_FUNDS':
      return 'The merchant float is too low for this payout. Try a smaller amount.';
    case 'DUPLICATE_REFERENCE':
      return 'This transaction reference was already used.';
    case 'INVALID_INPUT':
      return 'The gateway rejected the amount or phone number.';
    case 'INVALID_MSISDN':
      return 'Enter a valid Ugandan mobile-money number.';
    case 'IP_NOT_WHITELISTED':
      return 'This server IP is not whitelisted for the payment app.';
    case 'NOT_FOUND':
      return 'No transaction matches that reference.';
    default:
      return fallback || 'The payment gateway request failed.';
  }
}

export type Collection = { tid: string; message: string };

/** Triggers the USSD PIN prompt on the payer's phone (collection). */
export async function requestToPay(input: { msisdn: string; amount: number; reference: string }): Promise<Collection> {
  const payload = await call('/requestToPay', {
    method: 'POST',
    body: {
      msisdn: input.msisdn,
      amount: input.amount,
      currency: 'UGX',
      reference: input.reference,
    },
  });
  const data = payload.data as Record<string, unknown> | undefined;
  return {
    tid: String(data?.tid ?? ''),
    message: String(data?.message ?? 'Payment request pushed. Awaiting customer PIN entry.'),
  };
}

export type Payout = { tid: string; status: string; charge: number; message: string };

/** Sends money to a mobile wallet (disbursement, protected by a balance lien). */
export async function disburse(input: {
  msisdn: string;
  amount: number;
  reference: string;
  remarks?: string;
}): Promise<Payout> {
  const payload = await call('/disburse', {
    method: 'POST',
    body: {
      msisdn: input.msisdn,
      amount: input.amount,
      currency: 'UGX',
      reference: input.reference,
      remarks: input.remarks ?? 'KernelMiners payout',
    },
  });
  const data = payload.data as Record<string, unknown> | undefined;
  return {
    tid: String(data?.tid ?? ''),
    status: String(data?.status ?? 'PENDING'),
    charge: Number(data?.charge) || 0,
    message: String(data?.message ?? 'Payout initiated.'),
  };
}

export type Enquiry = {
  tid: string;
  state: 'PENDING' | 'TS' | 'TF' | string;
  amount: number;
  msisdn: string;
};

/** Reconciliation call: look a transaction up by our own reference. */
export async function enquiry(reference: string): Promise<Enquiry | null> {
  try {
    const payload = await call(`/enquiry/${encodeURIComponent(reference)}`);
    const data = payload.data as Record<string, unknown> | undefined;
    return {
      tid: String(data?.tid ?? ''),
      state: String(data?.state ?? 'PENDING'),
      amount: Number(data?.amount) || 0,
      msisdn: String(data?.msisdn ?? ''),
    };
  } catch (error) {
    if (error instanceof ShashuraError && error.code === 'NOT_FOUND') return null;
    throw error;
  }
}

/** `X-Shashura-Signature` is an HMAC-SHA256 (hex) of the raw body. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) return false;

  const received = signature.trim().replace(/^sha256=/i, '').toLowerCase();
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
