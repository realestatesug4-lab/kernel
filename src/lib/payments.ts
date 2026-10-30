import type { RpcResult } from '@/lib/types';

/**
 * Browser-side helpers for the payment endpoints. Everything here talks to our
 * own route handlers — never to the gateway, and never with gateway secrets.
 */

async function post<T>(url: string, body?: unknown): Promise<RpcResult<T>> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as RpcResult<T> | null;
    if (!json || typeof json !== 'object' || !('ok' in json)) {
      return { ok: false, code: 'BAD_RESPONSE', message: 'The server returned an unexpected response.' };
    }
    return json;
  } catch {
    return { ok: false, code: 'NETWORK', message: 'Could not reach the server. Check your connection.' };
  }
}

async function get<T>(url: string): Promise<RpcResult<T>> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as RpcResult<T> | null;
    if (!json || typeof json !== 'object' || !('ok' in json)) {
      return { ok: false, code: 'BAD_RESPONSE', message: 'The server returned an unexpected response.' };
    }
    return json;
  } catch {
    return { ok: false, code: 'NETWORK', message: 'Could not reach the server. Check your connection.' };
  }
}

export type DepositInit = {
  deposit_id: string;
  reference: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'failed';
  tid?: string;
  simulated: boolean;
  message?: string;
};

export const payments = {
  /** Pushes a mobile-money collection to the payer's phone. */
  createDeposit: (input: { amount: number; msisdn: string }) =>
    post<DepositInit>('/api/payments/deposit', input),
};

export type AdminWithdrawal = {
  id: string;
  user_id?: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  display_name: string | null;
  referral_code: string;
  amount: number;
  fee: number;
  net: number;
  destination: string;
  status: 'pending' | 'approved' | 'paid' | 'failed' | 'rejected';
  reference: string | null;
  provider_ref: string | null;
  failure_reason: string | null;
  created_at: string;
};

export const adminPayments = {
  withdrawals: (status = 'pending') =>
    get<AdminWithdrawal[]>(`/api/admin/withdrawals?status=${encodeURIComponent(status)}`),

  approve: (id: string) =>
    post<{ status: string; tid?: string; simulated?: boolean; message?: string }>(
      `/api/admin/withdrawals/${id}`,
      { action: 'approve' },
    ),

  reject: (id: string, reason?: string) =>
    post<{ status: string }>(`/api/admin/withdrawals/${id}`, { action: 'reject', reason }),
};
