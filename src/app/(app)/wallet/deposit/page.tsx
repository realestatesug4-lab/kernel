'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Smartphone } from 'lucide-react';
import { InnerPage } from '@/components/layout/InnerPage';
import { Badge, Button, Card, Field, EmptyState, Input, Spinner } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { payments, type DepositInit } from '@/lib/payments';
import { fmtDateTime, fmtUGX } from '@/lib/format';
import { formatMsisdn, networkOf, normalizeMsisdn } from '@/lib/msisdn';
import { rules, products } from '@/lib/brand';
import type { Deposit } from '@/lib/types';

const PRESETS = products.map((p) => p.price);

const STATUS_TONE: Record<Deposit['status'], 'pos' | 'warn' | 'neg'> = {
  confirmed: 'pos',
  pending: 'warn',
  failed: 'neg',
};

export default function DepositPage() {
  const router = useRouter();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [msisdn, setMsisdn] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<DepositInit | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const { data: history } = useAsync<Deposit[]>(() => api.deposits.list(4), [historyKey]);

  const value = Number(amount) || 0;
  const normalized = normalizeMsisdn(msisdn);
  const network = networkOf(msisdn);

  // Deposits already rechecked against the gateway this visit — the set keeps
  // the history effect from re-firing after its own reload.
  const recheckedRef = useRef<Set<string>>(new Set());

  // A lost SHASHURA callback leaves a completed collection pending forever;
  // when old pending rows are on screen, ask the gateway directly and refresh.
  useEffect(() => {
    if (!history) return;
    const stuck = history.filter(
      (d) =>
        d.status === 'pending' &&
        !recheckedRef.current.has(d.id) &&
        Date.now() - new Date(d.created_at).getTime() > 90_000,
    );
    if (stuck.length === 0) return;
    stuck.forEach((d) => recheckedRef.current.add(d.id));
    void payments.recheckDeposits().finally(() => setHistoryKey((k) => k + 1));
  }, [history]);

  // Poll the deposit while the payer approves the USSD prompt.
  useEffect(() => {
    if (!pending || pending.simulated) return;
    let alive = true;
    let ticks = 0;

    const check = async () => {
      const rows = await api.deposits.list(5);
      if (!alive) return;
      const row = rows.find((d) => d.id === pending.deposit_id);
      if (!row) return;

      if (row.status === 'confirmed') {
        toast.push(`${fmtUGX(row.amount)} UGX added to your balance.`, 'ok');
        setHistoryKey((k) => k + 1);
        router.push('/wallet');
      } else if (row.status === 'failed') {
        toast.push('The payment was not completed. You can try again.', 'err');
        setPending(null);
        setHistoryKey((k) => k + 1);
      } else if (++ticks === 5) {
        // Still pending after ~20s: the callback may be lost in flight. Ask
        // the gateway directly; the next poll reads the settled status.
        void payments.recheckDeposits();
      }
    };

    const timer = setInterval(check, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pending, router, toast]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value < rules.minDeposit) {
      toast.push(`Minimum deposit is ${fmtUGX(rules.minDeposit)} UGX.`, 'err');
      return;
    }
    if (!normalized) {
      toast.push('Enter a valid Ugandan mobile-money number.', 'err');
      return;
    }

    setBusy(true);
    const res = await payments.createDeposit({ amount: value, msisdn: normalized });
    setBusy(false);

    if (!res.ok) {
      toast.push(res.message, 'err');
      return;
    }

    setHistoryKey((k) => k + 1);

    if (res.data.simulated) {
      toast.push(`${fmtUGX(res.data.amount)} UGX credited (demo mode).`, 'ok');
      router.push('/wallet');
      return;
    }

    setPending(res.data);
  }

  if (pending) {
    return (
      <InnerPage title="Deposit">
        <Card className="p-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-accent-soft">
            <Smartphone className="size-6 text-accent-2" />
          </div>
          <h2 className="mt-4 text-base font-extrabold">Approve the prompt on your phone</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            We sent a {network ?? 'mobile money'} request for{' '}
            <span className="tnum font-semibold text-fg">{fmtUGX(pending.amount)} UGX</span> to{' '}
            <span className="tnum font-semibold text-fg">{formatMsisdn(normalized)}</span>. Enter your PIN
            to confirm — your balance updates automatically.
          </p>

          <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-muted">
            <Spinner className="size-3.5" />
            Waiting for confirmation
          </div>

          <div className="mt-4 space-y-1.5 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 text-left text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted">Reference</span>
              <span className="tnum font-semibold text-fg">{pending.reference}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Amount</span>
              <span className="tnum font-semibold text-fg">{fmtUGX(pending.amount)} UGX</span>
            </div>
            {pending.tid ? (
              <div className="flex items-center justify-between">
                <span className="text-muted">Gateway id</span>
                <span className="tnum font-semibold text-fg">{pending.tid}</span>
              </div>
            ) : null}
          </div>

          <Button
            variant="secondary"
            block
            className="mt-4"
            onClick={() => {
              setPending(null);
              toast.push('Deposit still pending. It will credit as soon as the network confirms.', 'info');
            }}
          >
            Back to wallet
          </Button>
        </Card>
      </InnerPage>
    );
  }

  return (
    <InnerPage title="Deposit">
      <form onSubmit={submit} className="space-y-4">
        <Card className="p-5">
          <Field
            label="Amount (UGX)"
            hint={`Minimum ${fmtUGX(rules.minDeposit)} · maximum ${fmtUGX(rules.maxDeposit)}`}
          >
            <Input
              inputMode="numeric"
              placeholder="30,000"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
              className="tnum text-lg font-bold"
            />
          </Field>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(String(p))}
                className={`tnum h-10 rounded-xl border text-xs font-semibold transition ${
                  value === p
                    ? 'border-accent bg-accent-soft text-accent-2'
                    : 'border-line bg-surface-2 text-muted hover:text-fg'
                }`}
              >
                {fmtUGX(p)}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <Field
            label="Mobile money number"
            hint={
              normalized
                ? `${network ?? 'Uganda'} · ${formatMsisdn(normalized)}`
                : 'MTN or Airtel — e.g. 0770 000 000'
            }
          >
            <Input
              inputMode="tel"
              autoComplete="tel"
              placeholder="0770 000 000"
              value={msisdn}
              onChange={(e) => setMsisdn(e.target.value.slice(0, 16))}
              className="tnum"
            />
          </Field>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
            <CheckCircle2 className="size-3.5 text-accent-2" />
            A PIN prompt appears on this number. Nothing is charged without it.
          </p>
        </Card>

        <Button type="submit" size="lg" block loading={busy} disabled={value < rules.minDeposit || !normalized}>
          Pay {value > 0 ? `${fmtUGX(value)} UGX` : 'with mobile money'}
        </Button>
      </form>

      <div className="mt-6">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
          <Clock className="size-4 text-muted" />
          Recent top-ups
        </h2>

        {!history?.length ? (
          <EmptyState title="No deposits yet" hint="Your first top-up will appear here." />
        ) : (
          <div className="space-y-2">
            {history.map((d) => (
              <Card key={d.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="tnum text-sm font-bold">{fmtUGX(d.amount)} UGX</p>
                  <p className="truncate text-[11px] text-muted">
                    {d.msisdn ? `${formatMsisdn(d.msisdn)} · ` : ''}
                    {fmtDateTime(d.created_at)}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[d.status] ?? 'neutral'}>{d.status}</Badge>
              </Card>
            ))}
          </div>
        )}
      </div>
    </InnerPage>
  );
}
