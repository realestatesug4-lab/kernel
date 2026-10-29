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
import type { Dashboard } from '@/lib/types';

export default function TransferPage() {
  const router = useRouter();
  const toast = useToast();
  const { data } = useAsync<Dashboard | null>(
    () => api.account.dashboard().then((r) => (r.ok ? r.data : null)),
    [],
  );
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const available = data?.balance.available ?? 0;
  // The PIN is no longer collected at sign-up; the first transfer creates it.
  const hasPin = data?.account.has_pin ?? false;
  const value = Number(amount) || 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!to.trim()) return toast.push('Enter the recipient referral code.', 'err');
    if (to.trim().toUpperCase() === (data?.account.referral_code ?? '')) {
      return toast.push('You cannot transfer to yourself.', 'err');
    }
    if (value <= 0 || value > available) return toast.push('Enter an amount within your balance.', 'err');
    if (!/^\d{4}$/.test(pin)) {
      return toast.push(hasPin ? 'Enter your 4-digit security PIN.' : 'Choose a 4-digit security PIN.', 'err');
    }

    setBusy(true);
    if (!hasPin) {
      const created = await api.account.setPin(pin);
      if (!created.ok) {
        setBusy(false);
        toast.push(created.message, 'err');
        return;
      }
    }
    const res = await api.wallet.transfer({ to: to.trim().toUpperCase(), amount: value, pin });
    setBusy(false);
    if (!res.ok) {
      toast.push(res.message, 'err');
      return;
    }
    toast.push(`Sent ${fmtUGX(value)} UGX to ${to.trim().toUpperCase()}.`, 'ok');
    router.push('/wallet');
  }

  if (!data) {
    return (
      <InnerPage title="Transfer">
        <div className="grid min-h-[50vh] place-items-center">
          <Spinner className="size-7" />
        </div>
      </InnerPage>
    );
  }

  return (
    <InnerPage title="Transfer">
      <form onSubmit={submit} className="space-y-4">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-surface-2/60 px-3 py-2">
            <span className="text-xs text-muted">Available</span>
            <span className="tnum text-sm font-bold">{fmtUGX(available)} UGX</span>
          </div>

          <Field label="Recipient referral code" hint="Ask the member for the code on their team page">
            <Input
              placeholder="e.g. K7X2Q9AB"
              autoCapitalize="characters"
              value={to}
              onChange={(e) => setTo(e.target.value.toUpperCase())}
            />
          </Field>

          <div className="mt-3">
            <Field label="Amount (UGX)">
              <Input
                inputMode="numeric"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
                className="tnum text-lg font-bold"
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field
              label={hasPin ? 'Security PIN' : 'Create security PIN'}
              hint={hasPin ? undefined : '4 digits — used for every payout and transfer'}
            >
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
            Internal transfers are instant and free. Both sides see the movement in their wallet history.
          </p>
        </Card>

        <Button type="submit" size="lg" block loading={busy}>
          Send transfer
        </Button>
      </form>
    </InnerPage>
  );
}
