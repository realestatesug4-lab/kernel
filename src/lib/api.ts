import { rpc, rpcRows } from '@/lib/rpc';
import type {
  Dashboard, Product, Investment, LedgerEntry, WithdrawalRequest, Deposit,
  TeamMember, Milestone, RpcResult,
} from '@/lib/types';

/** All server interactions, grouped by feature. Each maps to a Postgres function. */

export const api = {
  account: {
    dashboard: () => rpc<Dashboard>('km_dashboard'),
    setPin: (pin: string) => rpc<boolean>('km_set_pin', { p_pin: pin }),
    setLocale: (locale: string) => rpc<boolean>('km_set_locale', { p_locale: locale }),
    updateProfile: (displayName: string) =>
      rpc<boolean>('km_update_profile', { p_display_name: displayName }),
  },

  auth: {
    /** Provision profile + referral links (level 1 & 2) after sign-up. */
    bootstrap: (referralCode: string | null) =>
      rpc<{ user_id: string; referral_code: string }>('km_bootstrap_account', {
        p_referral_code: referralCode,
      }),
  },

  products: {
    list: () => rpcRows<Product>('km_list_products'),
    detail: (key: string) => rpc<Product>('km_product_detail', { p_key: key }),
  },

  invest: {
    buy: (productId: string) =>
      rpc<{ investment_id: string; amount: number; ends_at: string }>('km_invest', {
        p_product_id: productId,
      }),
    list: () => rpcRows<Investment>('km_list_investments'),
    accrue: () => rpc<{ credited: number }>('km_accrue'),
  },

  wallet: {
    ledger: (limit = 100) => rpcRows<LedgerEntry>('km_list_ledger', { p_limit: limit }),
    requestWithdrawal: (input: { amount: number; destination: string; pin: string }) =>
      rpc<WithdrawalRequest>('km_request_withdrawal', {
        p_amount: input.amount,
        p_destination: input.destination,
        p_pin: input.pin,
      }),
    withdrawals: () => rpcRows<WithdrawalRequest>('km_list_withdrawals'),
    transfer: (input: { to: string; amount: number; pin: string }) =>
      rpc<{ tx_id: string }>('km_transfer', {
        p_to_referral_code: input.to,
        p_amount: input.amount,
        p_pin: input.pin,
      }),
  },

  /** Mobile-money top-ups (funded through the payment gateway, polled until settled). */
  deposits: {
    list: (limit = 10) => rpcRows<Deposit>('km_list_deposits', { p_limit: limit }),
  },

  team: {
    summary: () =>
      rpc<{ code: string; level1: number; level2: number; commission_l1: number; commission_l2: number }>(
        'km_team_summary',
      ),
    members: (level = 1) => rpcRows<TeamMember>('km_team_members', { p_level: level }),
  },

  tasks: {
    list: () => rpcRows<Milestone>('km_list_milestones'),
    claim: (id: string) => rpc<{ reward: number }>('km_claim_milestone', { p_id: id }),
  },

  notices: () => rpcRows<{ id: string; title: string; body: string; kind: string; created_at: string }>(
    'km_list_notices',
  ),
};

export type Api = typeof api;
export type { RpcResult };
