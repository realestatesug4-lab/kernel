'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowDownToLine, ArrowUpFromLine, Bell, ChevronRight, History, Pickaxe, Sparkles, TrendingUp, Users,
} from 'lucide-react';
import { AppHeader } from '@/components/layout/TopBar';
import { Button, Card, EmptyState, ProgressBar, Spinner } from '@/components/ui';
import { ReferralCard } from '@/components/ReferralCard';
import { InstallApp } from '@/components/InstallApp';
import { MarketsTicker } from '@/components/market/MarketsTicker';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { fmtDate, fmtUGX, progressPct, timeLeft } from '@/lib/format';
import type { Dashboard, Investment } from '@/lib/types';
import { brand, products } from '@/lib/brand';

export default function HomePage() {
  const { data, loading } = useAsync<Dashboard | null>(
    () => api.account.dashboard().then((r) => (r.ok ? r.data : null)),
    [],
  );

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner className="size-7" />
      </div>
    );
  }
  if (!data) return <EmptyState title="Could not load your account" hint="Pull down to retry." />;

  const { account, balance, stats, investments, milestones } = data;
  const total = balance.available + balance.invested;
  const active = investments.filter((i) => i.status === 'active');
  const nextMilestone = milestones.find((m) => !m.claimed);
  const earnedToday = stats.today_earned;

  return (
    <>
      <AppHeader
        right={
          <Link href="/notice" aria-label="Notifications" className="relative grid size-9 place-items-center rounded-full hover:bg-surface-2">
            <Bell className="size-5" />
            <span className="absolute right-2 top-2 size-2 rounded-full bg-accent" />
          </Link>
        }
      />

      <div className="space-y-4 px-4 pt-4">
        {/* Balance hero */}
        <Card className="relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full bg-accent/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 size-44 rounded-full bg-accent-2/15 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-medium uppercase tracking-widest text-muted">Total balance</p>
            <p className="tnum mt-1 text-[38px] font-extrabold leading-none tracking-tight">
              <span className="mr-1 text-base font-bold text-accent-2">UGX</span>
              {fmtUGX(total)}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-line bg-surface-2/70 px-3 py-2">
                <p className="text-muted">Available</p>
                <p className="tnum mt-0.5 text-sm font-bold">{fmtUGX(balance.available)}</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-2/70 px-3 py-2">
                <p className="text-muted">In mining</p>
                <p className="tnum mt-0.5 text-sm font-bold">{fmtUGX(balance.invested)}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-5 gap-1">
              <QuickAction href="/wallet/deposit" icon={<ArrowDownToLine className="size-4" />} label="Deposits" primary />
              <QuickAction href="/wallet/withdraw" icon={<ArrowUpFromLine className="size-4" />} label="Withdraw" />
              <QuickAction href="/income" icon={<TrendingUp className="size-4" />} label="Income" />
              <QuickAction href="/products" icon={<Pickaxe className="size-4" />} label="Strategy" />
              <QuickAction href="/wallet/withdrawals" icon={<History className="size-4" />} label="Withdraw history" />
            </div>
          </div>
        </Card>

        {/* Stat strip */}
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={<TrendingUp className="size-4" />} label="Total earned" value={fmtUGX(stats.total_earned)} />
          <Stat icon={<Sparkles className="size-4" />} label="Today" value={fmtUGX(earnedToday)} />
          <Stat icon={<Users className="size-4" />} label="Team" value={String(stats.network_size)} />
        </div>

        {/* Installs the PWA from the same build — no store listing needed. */}
        <InstallApp />

        {/* Nearby milestone */}
        {nextMilestone && (
          <Link href="/tasks" className="block">
            <Card className="flex items-center gap-3 p-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-2">
                <Users className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold">
                    Invite {nextMilestone.invite_required} friends
                  </p>
                  <span className="tnum shrink-0 text-xs font-bold text-accent-2">
                    {Math.min(nextMilestone.invites, nextMilestone.invite_required)}/{nextMilestone.invite_required}
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar value={Math.min(100, (nextMilestone.invites / nextMilestone.invite_required) * 100)} />
                </div>
                <p className="mt-1.5 text-[11px] text-muted">
                  Unlock {fmtUGX(nextMilestone.unlock_amount)} · extra {fmtUGX(nextMilestone.extra_reward)}
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </Card>
          </Link>
        )}

        {/* Live markets — the sliding crypto tape above the packs */}
        <MarketsTicker />

        {/* Packs */}
        <section>
          <SectionHead title="Mining packs" href="/products" />
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {products.map((p) => (
              <Link key={p.no} href={`/products/${p.no}`} className="w-[150px] shrink-0">
                <Card className="overflow-hidden p-0">
                  <div className="relative h-24 w-full">
                    <Image src={brand.productImage} alt={p.name} fill sizes="150px" className="object-cover" />
                    <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-accent-2 backdrop-blur">
                      #{p.no}
                    </span>
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-xs font-semibold">{p.name}</p>
                    <p className="tnum mt-0.5 text-[11px] text-muted">
                      {fmtUGX(p.price)} · {p.duration}d
                    </p>
                    <p className="tnum mt-1 text-sm font-extrabold text-accent-2">
                      +{fmtUGX(p.daily)}
                      <span className="text-[10px] font-medium text-muted"> /day</span>
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* Active mining */}
        <section>
          <SectionHead title="Active mining" href="/portfolio" />
          {active.length === 0 ? (
            <Card className="p-4 text-center">
              <p className="text-sm font-medium">No active packs yet</p>
              <p className="mt-1 text-xs text-muted">Buy a mining pack to start earning at midnight every day.</p>
              <Link href="/products" className="mt-3 inline-block">
                <Button size="sm">Browse packs</Button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {active.slice(0, 2).map((inv) => (
                <InvestmentRow key={inv.id} inv={inv} />
              ))}
            </div>
          )}
        </section>

        <ReferralCard code={account.referral_code} />
      </div>
    </>
  );
}

function QuickAction({
  href, icon, label, primary,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1 rounded-xl py-1 transition hover:bg-surface-2">
      <span
        className={`grid size-9 place-items-center rounded-full ${
          primary ? 'brand-gradient text-black' : 'bg-surface-2 text-accent-2'
        }`}
      >
        {icon}
      </span>
      <span className={`text-center text-[9px] leading-tight ${primary ? 'font-bold text-fg' : 'text-muted'}`}>
        {label}
      </span>
    </Link>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <span className="text-accent-2">{icon}</span>
      <p className="tnum mt-1 truncate text-sm font-bold">{value}</p>
      <p className="truncate text-[11px] text-muted">{label}</p>
    </Card>
  );
}

function SectionHead({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-bold">{title}</h2>
      <Link href={href} className="inline-flex items-center gap-0.5 text-xs font-medium text-accent-2">
        View all <ChevronRight className="size-3.5" />
      </Link>
    </div>
  );
}

function InvestmentRow({ inv }: { inv: Investment }) {
  const left = timeLeft(inv.ends_at);
  return (
    <Link href="/portfolio" className="block">
      <Card className="p-3.5">
        <div className="flex items-center gap-3">
          <div className="relative size-10 shrink-0 overflow-hidden rounded-xl">
            <Image src={brand.productImage} alt={inv.product_name} fill sizes="40px" className="object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{inv.product_name}</p>
            <p className="tnum text-[11px] text-muted">
              {fmtUGX(inv.amount)} · {inv.duration_days}d · {fmtDate(inv.ends_at)}
            </p>
          </div>
          <div className="text-right">
            <p className="tnum text-sm font-bold text-accent-2">+{fmtUGX(inv.daily)}</p>
            <p className="text-[10px] text-muted">/day</p>
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar value={progressPct(inv.started_at, inv.ends_at)} />
          <div className="mt-1.5 flex justify-between text-[10px] text-muted">
            <span className="tnum">Earned {fmtUGX(inv.earned)}</span>
            <span>{left.done ? 'Completed' : `${left.days}d ${left.hours}h left`}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
