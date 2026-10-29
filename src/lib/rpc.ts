import { createClient } from '@/lib/supabase/client';
import type { RpcResult } from '@/lib/types';

/**
 * Thin, typed wrapper over Supabase Postgres RPC.
 *
 * Every database write and privileged read goes through a SECURITY DEFINER
 * SQL function (see `supabase/migrations`). The browser never touches tables
 * directly — it only calls `rpc(name, args)` and gets back an RpcResult.
 */
export async function rpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RpcResult<T>> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    return { ok: false, code: error.code ?? 'RPC_ERROR', message: error.message };
  }
  // Functions return either { ok, data } or { ok:false, code, message };
  // scalar returns are wrapped for uniform handling.
  if (data && typeof data === 'object' && 'ok' in (data as object)) {
    return data as RpcResult<T>;
  }
  return { ok: true, data: data as T };
}

/** Read helper for plain (non-wrapped) SELECT-style RPC functions. */
export async function rpcRows<T>(fn: string, args: Record<string, unknown> = {}): Promise<T[]> {
  const res = await rpc<T[]>(fn, args);
  return res.ok ? res.data : [];
}
