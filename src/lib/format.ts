import { rules } from '@/lib/brand';

const ugx = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd4 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const usd6 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });

/** Format a whole-number UGX amount: 30000 → "30,000". */
export function fmtUGX(n: number): string {
  return ugx.format(Math.round(Number.isFinite(n) ? n : 0));
}

/** Amount with the currency prefix: "UGX 30,000". */
export function fmtMoney(n: number): string {
  return `${rules.currency.code} ${fmtUGX(n)}`;
}

/** Signed amount for ledger rows: "+8,000" / "-30,000". */
export function fmtSigned(n: number): string {
  return n >= 0 ? `+${fmtUGX(Math.abs(n))}` : `-${fmtUGX(Math.abs(n))}`;
}

/**
 * USD price with a sensible number of decimals: 96,412.30 / 188.42 / 0.2580 /
 * 0.000061. Used by the live market tape.
 */
export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1) return usd2.format(n);
  if (abs >= 0.01) return usd4.format(n);
  return usd6.format(n);
}

/** Compact volume for tight cards: 18.4B / 940.3M / 12.4K. */
export function fmtCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Whole days/hours remaining until an ISO timestamp. */
export function timeLeft(iso: string): { days: number; hours: number; minutes: number; done: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, done: true };
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return { days, hours, minutes, done: false };
}

/** Percent progress of an investment between started_at and ends_at. */
export function progressPct(startedAt: string, endsAt: string): number {
  const start = new Date(startedAt).getTime();
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  if (end <= start) return 100;
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
}

const LEDGER_LABEL: Record<string, string> = {
  deposit: 'Deposit',
  investment: 'Mining pack purchase',
  daily_reward: 'Daily earnings',
  commission_l1: 'Level 1 commission',
  commission_l2: 'Level 2 commission',
  task_reward: 'Task reward',
  investment_return: 'Investment completed',
  withdrawal: 'Withdrawal',
  withdrawal_refund: 'Withdrawal refund',
  transfer_in: 'Received',
  transfer_out: 'Sent',
  bonus: 'Bonus',
  admin_credit: 'Credit from support',
  admin_debit: 'Debit by support',
};

export function ledgerLabel(kind: string): string {
  return LEDGER_LABEL[kind] ?? kind;
}
