'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { CalendarClock, Coins, ShieldCheck, X } from 'lucide-react';
import { InnerPage } from '@/components/layout/InnerPage';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { fallbackProducts } from '@/lib/catalog';
import { fmtUGX } from '@/lib/format';
import { rules } from '@/lib/brand';
import type { Product } from '@/lib/types';

export default function ProductDetailPage() {
  const { no } = useParams<{ no: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, loading } = useAsync<Product | null>(
    () => api.products.detail(no).then((r) => (r.ok ? r.data : null)),
    [no],
  );
  const product = data ?? fallbackProducts.find((p) => String(p.no) === String(no)) ?? null;

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const cycles = useMemo(
    () =>
      Array.from({ length: product?.duration_days ?? 0 }, (_, i) => ({
        label: `Day ${i + 1}`,
        amount: product?.daily ?? 0,
      })),
    [product],
  );

  async function invest() {
    if (!product) return;
    setBusy(true);
    const res = await api.invest.buy(product.id);
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      toast.push(
        res.code === 'INSUFFICIENT_FUNDS'
          ? 'Not enough available balance. Deposit or withdraw less first.'
          : res.message,
        'err',
      );
      return;
    }
    toast.push('Pack activated — first payout in 24 hours.', 'ok');
    router.push('/portfolio');
  }

  if (loading) {
    return (
      <InnerPage title="Pack details">
        <div className="grid min-h-[50vh] place-items-center">
          <Spinner className="size-7" />
        </div>
      </InnerPage>
    );
  }

  if (!product) {
    return (
      <InnerPage title="Pack details">
        <EmptyState title="Pack not found" hint="It may have been retired." />
      </InnerPage>
    );
  }

  return (
    <InnerPage title={`#${product.no} ${product.name}`}>
      <div className="space-y-4">
        <Card className="overflow-hidden p-0">
          <div className="relative aspect-[16/10] w-full">
            <Image src={product.image} alt={product.name} fill sizes="480px" className="object-cover" priority />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
            <div className="absolute inset-x-4 bottom-3 flex items-end justify-between">
              <div>
                <Badge tone="accent">{product.tier}</Badge>
                <p className="mt-1 text-lg font-extrabold text-white">{product.name}</p>
              </div>
              <p className="tnum text-right text-xl font-extrabold text-accent-2">
                +{fmtUGX(product.daily)}
                <span className="block text-[10px] font-medium text-white/75">per 24h</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-line">
            <Cell label="Price" value={`${fmtUGX(product.price)} UGX`} />
            <Cell label="Daily earnings" value={`${fmtUGX(product.daily)} UGX`} tone />
            <Cell label="Duration" value={`${product.duration_days} days`} />
            <Cell label="Total earnings" value={`${fmtUGX(product.total)} UGX`} tone />
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-bold">Payout schedule</h2>
          <p className="mt-1 text-xs text-muted">
            Each cycle credits exactly 24 hours after purchase, using the server clock.
          </p>
          <div className="mt-3 space-y-1.5">
            {cycles.map((c, i) => (
              <div
                key={c.label}
                className="flex items-center justify-between rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-xs"
              >
                <span className="inline-flex items-center gap-2 text-muted">
                  <CalendarClock className="size-3.5 text-accent" />
                  {c.label} · cycle {i + 1}/{product.duration_days}
                </span>
                <span className="tnum font-bold text-accent-2">+{fmtUGX(c.amount)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-bold">Good to know</h2>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
            <li>· Balance is deducted from available funds the moment you confirm.</li>
            <li>· Earnings are released automatically — no claim step.</li>
            <li>· You earn {rules.referral.level1}% of every pack your referrals buy.</li>
            <li>· Minimum withdrawal is {fmtUGX(rules.minWithdrawal)} {rules.currency.code}.</li>
          </ul>
        </Card>

        <div className="sticky bottom-20 z-10">
          <Button size="lg" block onClick={() => setConfirming(true)} icon={<Coins className="size-5" />}>
            Invest {fmtUGX(product.price)} UGX
          </Button>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div className="animate-rise w-full max-w-[480px] rounded-t-3xl border-t border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold">Confirm investment</h3>
              <button
                onClick={() => setConfirming(false)}
                className="grid size-8 place-items-center rounded-full hover:bg-surface-2"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-2 rounded-2xl border border-line bg-surface-2/60 p-3 text-sm">
              <Row label="Pack" value={`#${product.no} ${product.name}`} />
              <Row label="Amount" value={`${fmtUGX(product.price)} UGX`} />
              <Row label="Daily earnings" value={`${fmtUGX(product.daily)} UGX`} tone />
              <Row label="Duration" value={`${product.duration_days} days`} />
              <Row label="Total earnings" value={`${fmtUGX(product.total)} UGX`} tone />
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent-2" />
              Funds are locked for the pack duration. Daily earnings start 24 hours after confirmation.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button loading={busy} onClick={invest}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </InnerPage>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`tnum mt-0.5 text-sm font-bold ${tone ? 'text-accent-2' : ''}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={`tnum font-semibold ${tone ? 'text-accent-2' : ''}`}>{value}</span>
    </div>
  );
}
