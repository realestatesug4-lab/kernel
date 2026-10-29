/** Domain model shared by the client and the SQL RPC layer. Amounts are whole UGX. */

export type Account = {
  id: string;
  email: string | null;
  display_name: string | null;
  username: string;
  phone: string | null;
  referral_code: string;
  referrer_id: string | null;
  referrer_l2_id: string | null;
  has_pin: boolean;
  locale: string;
  created_at: string;
};

export type Balance = {
  available: number;
  invested: number;
  earned_total: number;
  pending_withdrawal: number;
};

/** A daily-earning mining pack. */
export type Product = {
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
};

export type Investment = {
  id: string;
  product_id: string;
  product_name: string;
  product_no: number;
  amount: number;
  daily: number;
  duration_days: number;
  started_at: string;
  ends_at: string;
  paid_cycles: number;
  earned: number;
  status: 'active' | 'completed';
};

export type LedgerEntry = {
  id: string;
  kind:
    | 'deposit'
    | 'investment'
    | 'daily_reward'
    | 'commission_l1'
    | 'commission_l2'
    | 'task_reward'
    | 'investment_return'
    | 'withdrawal'
    | 'withdrawal_refund'
    | 'transfer_in'
    | 'transfer_out'
    | 'bonus';
  amount: number;
  memo: string | null;
  created_at: string;
};

export type WithdrawalRequest = {
  id: string;
  amount: number;
  fee: number;
  net: number;
  destination: string;
  reference?: string | null;
  provider_ref?: string | null;
  failure_reason?: string | null;
  status: 'pending' | 'approved' | 'paid' | 'failed' | 'rejected';
  created_at: string;
};

/** Mobile-money top-up opened through the payment gateway. */
export type Deposit = {
  id: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'failed';
  reference: string | null;
  msisdn: string | null;
  provider_ref: string | null;
  created_at: string;
  confirmed_at: string | null;
};

export type TeamMember = {
  id: string;
  label: string;
  level: 1 | 2;
  joined_at: string;
  invested: number;
  commission: number;
};

/** Invite milestone: reach N direct referrals to unlock + earn a bonus. */
export type Milestone = {
  id: string;
  invite_required: number;
  unlock_amount: number;
  extra_reward: number;
  invites: number;
  unlocked: boolean;
  claimed: boolean;
};

export type Dashboard = {
  account: Account;
  balance: Balance;
  stats: {
    active_investments: number;
    total_invested: number;
    total_earned: number;
    today_earned: number;
    direct_referrals: number;
    network_size: number;
  };
  investments: Investment[];
  milestones: Milestone[];
};

export type RpcOk<T> = { ok: true; data: T };
export type RpcErr = { ok: false; code: string; message: string };
export type RpcResult<T> = RpcOk<T> | RpcErr;
