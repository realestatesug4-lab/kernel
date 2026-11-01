import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * SHASHURA gateway client — server only.
 *
 * Docs: https://www.shashura.com/developers
 * One base URL serves sandbox and production; `X-Target-Environment` picks which.
 * The client secret never reaches the browser: every call is made from a route
 * handler and the browser only ever sees our own JSON responses.
 *
 * The one thing that bites in production: **SHASHURA answers with HTTP 200 even
 * when the call failed.** A failure body carries a numeric `status`
 * (`{"status": 401, "code": "INVALID_APP", "message": "…"}`), while successes
 * carry `status: "success"` plus a `data` object — and a successful `/disburse`
 * also carries a `code` (`TRANSACTION_COMPLETED`). So the HTTP status alone is
 * meaningless here: `readEnvelope()` below is the single place that decides
 * whether a body is an answer or a rejection. Reading only `res.ok` turns every
 * gateway rejection into a silent success, which is exactly how a deposit that
 * was never pushed looked "pending at the gateway" forever.
 */

const BASE = (process.env.SHASHURA_API_BASE || 'https://www.shashura.com/api/v1').replace(/\/+$/, '');
const CLIENT_ID = process.env.SHASHURA_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.SHASHURA_CLIENT_SECRET ?? '';
const WEBHOOK_SECRET = process.env.SHASHURA_WEBHOOK_SECRET ?? '';
const ENVIRONMENT = process.env.SHASHURA_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
const COUNTRY = process.env.SHASHURA_COUNTRY || 'UG';

/** A hung gateway call must never eat the whole serverless budget. */
const CALL_TIMEOUT_MS = 15_000;

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

/**
 * Codes that mean "our app is not addressed correctly" rather than "this
 * transaction failed". Retrying them per transaction is pointless: the whole
 * sweep shares one credential, so the caller should stop and tell the operator.
 */
const CREDENTIAL_CODES = new Set([
  'UNAUTHORIZED',
  'EXPIRED_TOKEN',
  'INVALID_SECRET',
  'INVALID_APP',
  'IP_NOT_WHITELISTED',
  'FORBIDDEN',
]);

export function isCredentialIssue(code: string | null | undefined): boolean {
  return CREDENTIAL_CODES.has(String(code ?? '').toUpperCase());
}

/** Worth a second attempt: the token aged out mid-sweep, or the gateway blinked. */
const TRANSIENT_CODES = new Set(['GATEWAY_TIMEOUT', 'NETWORK', 'SERVER_ERROR', 'HTTP_500', 'HTTP_502', 'HTTP_503', 'HTTP_504', 'RATE_LIMITED', 'HTTP_429']);

export function isTransient(code: string | null | undefined): boolean {
  return TRANSIENT_CODES.has(String(code ?? '').toUpperCase());
}

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

/* -------------------------------------------------------------------------- */
/* Envelope reading                                                            */
/* -------------------------------------------------------------------------- */

type Envelope = {
  ok: boolean;
  /** The gateway's own status number (not the transport one) when it sent one. */
  status: number;
  code: string;
  message: string;
  data: Record<string, unknown> | null;
};

function readEnvelope(httpStatus: number, payload: Record<string, unknown> | null): Envelope {
  const raw = payload?.status;
  const logical = typeof raw === 'number' ? raw : httpStatus;
  const code = typeof payload?.code === 'string' ? payload.code : '';
  const message = typeof payload?.message === 'string' ? payload.message : '';
  const data = (payload?.data ?? null) as Record<string, unknown> | null;

  if (!payload) {
    return { ok: false, status: httpStatus, code: `HTTP_${httpStatus}`, message: '', data: null };
  }

  // A 2xx transport status with an error number in the body is still an error.
  if (raw === 'error' || (typeof raw === 'number' && raw >= 400)) {
    return { ok: false, status: logical, code: code || `HTTP_${logical}`, message, data };
  }
  if (!httpStatus || httpStatus < 200 || httpStatus >= 300) {
    return { ok: false, status: logical || httpStatus, code: code || `HTTP_${httpStatus}`, message, data };
  }
  // 2xx and the body does not say it succeeded: only accept it when there is an
  // actual answer to read. Never let a shape we do not understand look like a
  // pending transaction.
  if (raw !== 'success' && data === null) {
    return { ok: false, status: logical, code: code || 'UNREADABLE_RESPONSE', message, data };
  }
  return { ok: true, status: logical, code, message, data };
}

async function fetchJson(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; token?: string },
): Promise<{ httpStatus: number; payload: Record<string, unknown> | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.token
          ? {
              Authorization: `Bearer ${init.token}`,
              'X-CLIENT-ID': CLIENT_ID,
              'X-Target-Environment': ENVIRONMENT,
              'X-COUNTRY': COUNTRY,
            }
          : { 'X-CLIENT-ID': CLIENT_ID, 'X-Target-Environment': ENVIRONMENT, 'X-COUNTRY': COUNTRY }),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { httpStatus: res.status, payload };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ShashuraError('GATEWAY_TIMEOUT', `The payment gateway did not answer within ${CALL_TIMEOUT_MS / 1000}s.`, 504);
    }
    throw new ShashuraError('NETWORK', 'Could not reach the payment gateway.', 502);
  } finally {
    clearTimeout(timer);
  }
}

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const { httpStatus, payload } = await fetchJson('/auth', {
    method: 'POST',
    body: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
  });
  const env = readEnvelope(httpStatus, payload);
  const data = env.ok ? env.data : null;
  const token = typeof data?.access_token === 'string' ? data.access_token : '';

  if (!env.ok || !token) {
    // The real gateway code (INVALID_APP / INVALID_SECRET / IP_NOT_WHITELISTED …)
    // is the only thing that lets an operator fix this, so keep it verbatim.
    throw new ShashuraError(
      env.code || 'AUTH_FAILED',
      humanError(env.code, env.message || 'The gateway refused to issue an access token.'),
      env.status || 502,
    );
  }

  const ttl = Number(data?.expires_in) || 3600;
  tokenCache = { token, expiresAt: Date.now() + ttl * 1000 };
  return token;
}

async function call(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: Record<string, unknown> } = {},
  allowRetry = true,
): Promise<Record<string, unknown>> {
  if (!paymentsConfigured) {
    throw new ShashuraError('PAYMENTS_NOT_CONFIGURED', 'Mobile-money payments are not configured yet.', 503);
  }

  const token = await accessToken();
  const { httpStatus, payload } = await fetchJson(path, { ...init, token });
  const env = readEnvelope(httpStatus, payload);

  if (!env.ok) {
    // A token that aged out mid-flight is worth exactly one fresh attempt.
    if (allowRetry && (env.status === 401 || env.code === 'EXPIRED_TOKEN' || env.code === 'UNAUTHORIZED')) {
      tokenCache = null;
      return call(path, init, false);
    }
    throw new ShashuraError(env.code || `HTTP_${httpStatus}`, humanError(env.code, env.message), env.status || 502);
  }

  return env.data ?? {};
}

function humanError(code: string, fallback: string): string {
  switch (String(code ?? '').toUpperCase()) {
    case 'INSUFFICIENT_FUNDS':
      return 'The merchant float is too low for this payout. Try a smaller amount.';
    case 'DUPLICATE_REFERENCE':
      return 'This transaction reference was already used.';
    case 'INVALID_INPUT':
      return 'The gateway rejected the amount or phone number.';
    case 'INVALID_MSISDN':
      return 'Enter a valid Ugandan mobile-money number.';
    case 'INVALID_APP':
      return 'No SHASHURA app matches this client ID and environment. Check SHASHURA_CLIENT_ID and SHASHURA_ENVIRONMENT (the app must exist for that mode).';
    case 'INVALID_SECRET':
      return 'The SHASHURA client secret does not match this app. Re-copy it from Settings → API Access into SHASHURA_CLIENT_SECRET.';
    case 'UNAUTHORIZED':
    case 'EXPIRED_TOKEN':
      return 'The gateway rejected the access token.';
    case 'IP_NOT_WHITELISTED':
      return 'This server IP is not whitelisted for the SHASHURA app. Clear the allow-list, or add the deployment IPs (Settings → Apps).';
    case 'NOT_FOUND':
      return 'No transaction matches that reference.';
    case 'METHOD_NOT_ALLOWED':
      return 'The gateway endpoint was called with the wrong HTTP method.';
    case 'RATE_LIMITED':
      return 'The gateway is rate-limiting this app. Try again in a moment.';
    case 'SERVER_ERROR':
    case 'HTTP_500':
      return 'SHASHURA reported a server error on their side.';
    case 'GATEWAY_TIMEOUT':
      return 'The payment gateway did not answer in time.';
    case 'NETWORK':
      return 'Could not reach the payment gateway.';
    default:
      return fallback || 'The payment gateway request failed.';
  }
}

export type Collection = { tid: string; message: string };

/**
 * Triggers the USSD PIN prompt on the payer's phone (collection).
 *
 * This is the ONLY place a collection is pushed, and it is called exactly once
 * per deposit row, at creation. Reconciliation never calls it: a transaction
 * that already exists at the gateway is looked up and settled locally, so an
 * approved or reconciled payment is never requested from the customer twice.
 */
export async function requestToPay(input: { msisdn: string; amount: number; reference: string }): Promise<Collection> {
  const data = await call('/requestToPay', {
    method: 'POST',
    body: {
      msisdn: input.msisdn,
      amount: input.amount,
      currency: 'UGX',
      reference: input.reference,
    },
  });
  return {
    tid: String(data.tid ?? ''),
    message: String(data.message ?? 'Payment request pushed. Awaiting customer PIN entry.'),
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
  const data = await call('/disburse', {
    method: 'POST',
    body: {
      msisdn: input.msisdn,
      amount: input.amount,
      currency: 'UGX',
      reference: input.reference,
      remarks: input.remarks ?? 'KernelMiners payout',
    },
  });
  return {
    tid: String(data.tid ?? ''),
    status: String(data.status ?? 'PENDING'),
    charge: Number(data.charge) || 0,
    message: String(data.message ?? 'Payout initiated.'),
  };
}

export type EnquiryState = 'PENDING' | 'TS' | 'TF';

export type Enquiry = {
  tid: string;
  state: EnquiryState;
  /** 0 when the gateway did not echo an amount. */
  amount: number;
  msisdn: string;
  /** Present on TF: why the operator declined. */
  failure?: { code: string; message: string };
};

/**
 * Reconciliation lookup by our own reference (the gateway also accepts its tid
 * in the same slot). Returns `null` only when the gateway has no record of the
 * reference at all; anything it cannot answer with is raised, so a broken
 * credential or a malformed body can never be mistaken for "still waiting".
 */
export async function enquiry(reference: string): Promise<Enquiry | null> {
  let data: Record<string, unknown>;
  try {
    data = await call(`/enquiry/${encodeURIComponent(reference)}`);
  } catch (error) {
    if (error instanceof ShashuraError && (error.code === 'NOT_FOUND' || error.status === 404)) return null;
    throw error;
  }

  const state = String(data.state ?? '').toUpperCase();
  if (state !== 'PENDING' && state !== 'TS' && state !== 'TF') {
    throw new ShashuraError(
      'BAD_ENQUIRY',
      `The gateway answered without a transaction state for ${reference}.`,
      502,
    );
  }

  const failure = data.failure as Record<string, unknown> | undefined;
  return {
    tid: String(data.tid ?? ''),
    state,
    amount: Number(data.amount) || 0,
    msisdn: String(data.msisdn ?? ''),
    ...(state === 'TF' && failure
      ? { failure: { code: String(failure.code ?? 'UNKNOWN'), message: String(failure.message ?? '') } }
      : {}),
  };
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
