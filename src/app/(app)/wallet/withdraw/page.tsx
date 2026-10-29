'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';
import { InnerPage } from '@/components/layout/InnerPage';
import { Button, Card, Field, Input, Spinner } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { fmtUGX } from '@/lib/format';
import { rules } from '@/lib/brand';
import { formatMsisdn, networkOf, normalizeMsisdn } from '@/lib/msisdn';
import type { Dashboard } from '@/lib/types';

export default function WithdrawPage() {
  const router = useRouter();
  const toast = useToast();
  const { data } = useAsync<Dashboard | null>(
    () => api.account.dashboard().then((r) => (r.ok ? r.data : null)),
    [],
  );
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const available = data?.balance.available ?? 0;
  const value = Number(amount) || 0;
  const fee = Math.floor((value * rules.withdrawalFeePct) / 100);
  const net = Math.max(0, value - fee);
  const msisdn = normalizeMsisdn(destination);
  const network = networkOf(destination);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value < rules.minWithdrawal) {
      toast.push(`Minimum withdrawal is ${fmtUGX(rules.minWithdrawal)} UGX.`, 'err');
      return;
    }
    if (value > available) {
      toast.push('Amount exceeds your available balance.', 'err');
      return;
    }
    if (!msisdn) {
      toast.push('Enter a valid Ugandan mobile-money number.', 'err');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      toast.push('Enter your 4-digit security PIN.', 'err');
      return;
    }
    setBusy(true);
    const res = await api.wallet.requestWithdrawal({ amount: value, destination: msisdn, pin });
    setBusy(false);
    if (!res.ok) {
      toast.push(res.message, 'err');
      return;
    }
    toast.push(`Withdrawal of ${fmtUGX(net)} UGX submitted.`, 'ok');
    router.push('/wallet');
  }

  if (!data) {
    return (
      <InnerPage title="Withdraw">
        <div className="grid min-h-[50vh] place-items-center">
          <Spinner className="size-7" />
        </div>
      </InnerPage>
    );
  }

  return (
    <InnerPage title="Withdraw">
      <form onSubmit={submit} className="space-y-4">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-surface-2/60 px-3 py-2">
            <span className="text-xs text-muted">Available</span>
            <span className="tnum text-sm font-bold">{fmtUGX(available)} UGX</span>
          </div>

          <Field label="Amount (UGX)" hint={`Minimum ${fmtUGX(rules.minWithdrawal)} UGX`}>
            <Input
              inputMode="numeric"
              placeholder="30,000"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
              className="tnum text-lg font-bold"
            />
          </Field>

          <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
            <span>Fee {rules.withdrawalFeePct}%</span>
            <span className="tnum">You receive {fmtUGX(net)} UGX</span>
          </div>

          <button
            type="button"
            onClick={() => setAmount(String(available))}
            className="mt-2 text-xs font-semibold text-accent-2"
          >
            Withdraw all
          </button>
        </Card>

        <Card className="p-5">
          <Field
            label="Mobile money number"
            hint={msisdn ? `${network ?? 'Uganda'} · ${formatMsisdn(msisdn)}` : 'MTN or Airtel — e.g. 0770 000 000'}
          >
            <Input
              inputMode="tel"
              autoComplete="tel"
              placeholder="0770 000 000"
              value={destination}
              onChange={(e) => setDestination(e.target.value.slice(0, 16))}
              className="tnum"
            />
          </Field>
          <div className="mt-3">
            <Field label="Security PIN" hint="4 digits set at registration">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </Field>
          </div>
        </Card>

        <Card className="flex items-start gap-2 p-3.5">
          <Info className="mt-0.5 size-4 shrink-0 text-accent-2" />
          <p className="text-[11px] leading-relaxed text-muted">
            Every request is reviewed by an admin before the payout is sent to your mobile wallet.
            The amount leaves your available balance immediately and shows as pending until it is
            released.
          </p>
        </Card>

        <Button type="submit" size="lg" block loading={busy} disabled={!msisdn}>
          Request withdrawal
        </Button>
      </form>
    </InnerPage>
  );
}
