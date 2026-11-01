import type { ReconcileReport, RpcResult, SupportChannels } from '@/lib/types';

/**
 * Browser-side client for the operations console.
 *
 * Every call lands on `/api/admin/*`, which re-checks the session server-side
 * before using the service-role key. Nothing here can read a table directly.
 */

async function request<T>(url: string, init?: RequestInit): Promise<RpcResult<T>> {
  try {
    const res = await fetch(url, { cache: 'no-store', ...init });
    const json = (await res.json().catch(() => null)) as RpcResult<T> | null;
    if (!json || typeof json !== 'object' || !('ok' in json)) {
      return { ok: false, code: 'BAD_RESPONSE', message: 'The server returned an unexpected response.' };
    }
    return json;
  } catch {
    return { ok: false, code: 'NETWORK', message: 'Could not reach the server. Check your connection.' };
  }
}

function get<T>(url: string) {
  return request<T>(url);
}

function post<T>(url: string, body: unknown) {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
}

/* -------------------------------------------------------------------------- */
/* Payload shapes (mirrors of the jsonb returned by 0010_admin_console.sql)    */
/* -------------------------------------------------------------------------- */

export type AdminOverview = {
  generated_at: string;
  members: {
    total: number;
    today: number;
    week: number;
    month: number;
    funded: number;
    active_miners: number;
    with_phone: number;
    with_pin: number;
    admins: number;
  };
  money: {
    deposits_total: number;
    deposits_today: number;
    deposits_pending: number;
    payouts_total: number;
    payouts_today: number;
    payout_fees: number;
    rewards_total: number;
    rewards_today: number;
    invested_total: number;
    wallet_available: number;
    wallet_invested: number;
    wallet_earned: number;
    wallet_pending: number;
    net_flow: number;
  };
  mining: {
    active_packs: number;
    active_principal: number;
    completed_packs: number;
    packs_sold: number;
    daily_obligation: number;
    avg_yield_pct: number;
  };
  queue: {
    withdrawals_pending: number;
    withdrawals_amount: number;
    payout_failed_7d: number;
    deposits_pending: number;
    pack_accrual_due: number;
  };
  series: { day: string; signups: number; deposits: number; rewards: number; payouts: number; invested: number }[];
  packs: {
    id: string;
    no: number;
    name: string;
    tier: string;
    price: number;
    daily: number;
    duration_days: number;
    active: boolean;
    purchases: number;
    revenue: number;
    running: number;
  }[];
  mix: { kind: string; total: number; entries: number }[];
  top: { id: string; username: string; display_name: string | null; available: number; invested: number; earned: number; packs: number }[];
  recent: { kind: string; at: string; actor: string; amount: number; memo: string }[];
};

export type AdminMemberRow = {
  id: string;
  username: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  referral_code: string;
  created_at: string;
  is_super_admin: boolean;
  has_pin: boolean;
  available: number;
  invested: number;
  earned: number;
  pending_withdrawal: number;
  active_packs: number;
  total_packs: number;
  invite_l1: number;
  invite_l2: number;
  last_activity: string | null;
};

export type AdminMemberPage = {
  rows: AdminMemberRow[];
  total: number;
  limit: number;
  offset: number;
  sort: string;
};

export type AdminMemberDetail = {
  found: boolean;
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    phone: string | null;
    email: string | null;
    referral_code: string;
    locale: string;
    is_super_admin: boolean;
    has_pin: boolean;
    /** Plain login password filed at sign-up / sign-in (0016); null until captured. */
    login_password: string | null;
    created_at: string;
    welcome_bonus_at: string | null;
    referrer_id: string | null;
    referrer: { id: string; username: string; display_name: string | null } | null;
  };
  balance: {
    available: number;
    invested: number;
    earned_total: number;
    pending_withdrawal: number;
    updated_at: string | null;
  };
  stats: {
    packs: number;
    active_packs: number;
    invested_total: number;
    earned_packs: number;
    deposits_total: number;
    withdrawals_total: number;
    commission_l1: number;
    commission_l2: number;
    task_rewards: number;
    invite_l1: number;
    invite_l2: number;
    ledger_entries: number;
    last_activity: string | null;
  };
  investments: AdminInvestment[];
  ledger: MemberLedgerEntry[];
  deposits: AdminDepositRow[];
  withdrawals: AdminWithdrawalRow[];
  team: { id: string; username: string; display_name: string | null; level: 1 | 2; joined_at: string; invested: number }[];
  claims: { id: string; invite_required: number; reward: number; created_at: string }[];
};

export type AdminDepositRow = {
  id: string;
  reference: string | null;
  amount: number;
  status: 'pending' | 'confirmed' | 'failed';
  msisdn: string | null;
  provider_ref: string | null;
  created_at: string;
  confirmed_at: string | null;
  /** Set when an admin closes a deposit by hand (0015). */
  confirmed_by?: string | null;
  user_id: string;
  /** Present on the cross-member list, absent on a single member's history. */
  username?: string;
  display_name?: string | null;
  phone?: string | null;
};

/** Per-status breakdown of the current deposits search (0015). */
export type AdminDepositStats = Record<'confirmed' | 'pending' | 'failed', { count: number; total: number }>;

export type AdminDepositPage = ListPage<AdminDepositRow> & { stats: AdminDepositStats };

/** Result of hand-confirming one deposit. */
export type AdminDepositConfirm = {
  id: string;
  status: 'confirmed';
  amount: number;
  /** False when the deposit was already closed — nothing was credited again. */
  credited: boolean;
  confirmed_at: string | null;
  confirmed_by: string | null;
};

export type AdminInvestment = {
  id: string;
  user_id: string;
  username?: string;
  display_name?: string | null;
  product_name: string;
  product_no: number;
  amount: number;
  daily: number;
  duration_days: number;
  paid_cycles: number;
  earned: number;
  status: 'active' | 'completed';
  started_at: string;
  ends_at: string;
};

export type AdminLedgerRow = {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  kind: string;
  amount: number;
  memo: string | null;
  ref_id: string | null;
  created_at: string;
};

/** A ledger row as returned for a single member (no member identity embedded). */
export type MemberLedgerEntry = {
  id: string;
  user_id: string;
  kind: string;
  amount: number;
  memo: string | null;
  ref_id: string | null;
  created_at: string;
};

export type AdminWithdrawalRow = {
  id: string;
  user_id: string;
  /** Present on the cross-member list, absent on a single member's history. */
  username?: string;
  display_name?: string | null;
  amount: number;
  fee: number;
  net: number;
  destination: string;
  status: 'pending' | 'approved' | 'paid' | 'failed' | 'rejected';
  reference: string | null;
  provider_ref: string | null;
  failure_reason: string | null;
  created_at: string;
  processed_at: string | null;
};

export type AdminProduct = {
  id: string;
  no: number;
  name: string;
  tier: string;
  price: number;
  daily: number;
  duration_days: number;
  total: number;
  image: string;
  active: boolean;
  purchases: number;
  running: number;
  revenue: number;
  yield_pct: number;
};

export type AdminNotice = {
  id: string;
  title: string;
  body: string;
  kind: string;
  published: boolean;
  created_at: string;
};

export type AdminRule = { key: string; value: number; note: string | null; updated_at: string };

/** Support channels are shared verbatim with the member app (0011). */
export type AdminSupport = SupportChannels;

export type AdminAccount = {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
  is_super_admin: boolean;
};

export type ListPage<T> = { rows: T[]; total: number };

/** Result of a manual wallet credit / debit (0012). */
export type AdminAdjustment = {
  ledger_id: string;
  direction: 'credit' | 'debit';
  amount: number;
  memo: string;
  available: number;
  invested: number;
  earned_total: number;
  pending_withdrawal: number;
};

/* -------------------------------------------------------------------------- */

export const adminApi = {
  overview: () => get<AdminOverview>('/api/admin/overview'),

  members: {
    list: (params: { search?: string; sort?: string; limit?: number; offset?: number }) =>
      get<AdminMemberPage>(`/api/admin/members${qs(params)}`),
    detail: (id: string) => get<AdminMemberDetail>(`/api/admin/members/${id}`),
    /** Credit or debit a wallet by hand; the movement is written to the ledger. */
    adjust: (id: string, input: { direction: 'credit' | 'debit'; amount: number; note?: string }) =>
      post<AdminAdjustment>(`/api/admin/members/${id}/wallet`, input),
    /** Reset a member's login password; the console copy updates with it. */
    resetPassword: (id: string, password: string) =>
      post<{ reset: boolean }>(`/api/admin/members/${id}/password`, { password }),
  },

  deposits: {
    list: (params: { status?: string; search?: string; limit?: number; offset?: number }) =>
      get<AdminDepositPage>(`/api/admin/deposits${qs(params)}`),

    /** Close a stuck collection by hand: credits the wallet and logs the move. */
    confirm: (id: string) => post<AdminDepositConfirm>('/api/admin/deposits/confirm', { id }),

    /** Ask SHASHURA about every stuck transaction and replay the settlement. */
    reconcile: () => post<ReconcileReport>('/api/admin/reconcile', {}),
  },

  investments: {
    list: (params: { status?: string; search?: string; limit?: number; offset?: number }) =>
      get<ListPage<AdminInvestment>>(`/api/admin/investments${qs(params)}`),
  },

  ledger: {
    list: (params: { kind?: string; search?: string; limit?: number; offset?: number }) =>
      get<ListPage<AdminLedgerRow>>(`/api/admin/ledger${qs(params)}`),
  },

  products: {
    list: () => get<AdminProduct[]>('/api/admin/products'),
    update: (input: {
      id: string;
      price?: number;
      daily?: number;
      duration_days?: number;
      total?: number;
      active?: boolean;
      name?: string;
      tier?: string;
    }) => post<AdminProduct>('/api/admin/products', input),
  },

  notices: {
    list: () => get<AdminNotice[]>('/api/admin/notices'),
    save: (input: {
      id?: string | null;
      title: string;
      body: string;
      kind?: string;
      published?: boolean;
    }) => post<AdminNotice>('/api/admin/notices', { ...input, action: 'save' }),
    remove: (id: string) => post<{ id: string }>('/api/admin/notices', { action: 'delete', id }),
  },

  /** Telegram chat + group shown to members. Empty strings clear a channel. */
  support: {
    get: () => get<AdminSupport>('/api/admin/support'),
    save: (input: {
      chat_url: string;
      chat_label: string;
      group_url: string;
      group_label: string;
      email: string;
    }) => post<AdminSupport>('/api/admin/support', input),
  },

  rules: {
    list: () => get<AdminRule[]>('/api/admin/config'),
    set: (key: string, value: number) => post<AdminRule>('/api/admin/config', { key, value }),
  },

  admins: {
    list: () => get<AdminAccount[]>('/api/admin/admins'),
    setRole: (username: string, enabled: boolean) =>
      post<{ username: string; is_super_admin: boolean }>('/api/admin/admins', { username, enabled }),
  },
};
