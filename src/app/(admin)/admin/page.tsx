'use client';

import Link from 'next/link';
import {
  ArrowDownToLine, ArrowUpFromLine, BadgeCheck, Clock3, Coins, Pickaxe, RefreshCw,
  TrendingUp, Users, Wallet,
} from 'lucide-react';
import { AdminHeader } from '@/components/admin/AdminShell';
import {
  Empty, Loading, MixBars, Notice, Panel, Stat, TableScroll, Td, Th, TrendBars,
} from '@/components/admin/kit';
import { Badge, Button } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { adminApi } from '@/lib/admin';
import { fmtDateTime, fmtUGX, ledgerLabel } from '@/lib/format';

const ACTIVITY_ICON: Record<string, typeof Users> = {
  signup: Users,
  deposit: ArrowDownToLine,
  withdrawal: ArrowUpFromLine,
  investment: Pickaxe,
};

function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export default function AdminOverviewPage() {
  const { data, loading, reload } = useAsync(() => adminApi.overview(), []);
  const view = data?.ok ? data.data : null;
  const notice = data && !data.ok ? data.message : null;

  const series = view?.series ?? [];
  const yesterday = series[series.length - 2];
  const today = series[series.length - 1];

  const queueTotal = (view?.queue.withdrawals_pending ?? 0) + (view?.queue.deposits_pending ?? 0);

  return (
    <>
      <AdminHeader
        title="Operations overview"
        description="Wallets, mining packs and payouts across the whole programme."
        actions={
          <>
            {view && (
              <span className="tnum text-[11px] text-muted">
                Updated {fmtDateTime(view.generated_at)}
              </span>
            )}
            <Button size="sm" variant="secondary" onClick={reload} icon={<RefreshCw className="size-3.5" />}>
              Refresh
            </Button>
          </>
        }
      />

      {loading && !view ? (
        <Loading label="Loading programme data" />
      ) : notice ? (
        <Notice tone="neg">{notice}</Notice>
      ) : view ? (
        <div className="space-y-4">
          {queueTotal > 0 && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Link href="/admin/withdrawals" className="block">
                <div className="flex items-center gap-3 rounded-card border border-warn/30 bg-warn/10 px-4 py-3 transition hover:border-warn/60">
                  <Clock3 className="size-4 shrink-0 text-warn" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-warn">
                      {view.queue.withdrawals_pending} payout{view.queue.withdrawals_pending === 1 ? '' : 's'} waiting
                    </p>
                    <p className="tnum text-[11px] text-muted">
                      {fmtUGX(view.queue.withdrawals_amount)} UGX held for release
                    </p>
                  </div>
                </div>
              </Link>
              <Link href="/admin/deposits" className="block">
                <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 transition hover:border-accent/60">
                  <ArrowDownToLine className="size-4 shrink-0 text-accent-2" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-fg">
                      {view.queue.deposits_pending} deposit{view.queue.deposits_pending === 1 ? '' : 's'} pending
                    </p>
                    <p className="text-[11px] text-muted">Awaiting network confirmation</p>
                  </div>
                </div>
              </Link>
              <Link href="/admin/investments" className="block">
                <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 transition hover:border-accent/60">
                  <Coins className="size-4 shrink-0 text-accent-2" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-fg">
                      {view.queue.pack_accrual_due} pack{view.queue.pack_accrual_due === 1 ? '' : 's'} awaiting payout
                    </p>
                    <p className="text-[11px] text-muted">Midnight sweep has not settled them yet</p>
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* Headline figures ------------------------------------------------- */}
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Stat
              label="Members"
              value={fmtUGX(view.members.total)}
              hint={`+${view.members.today} today · +${view.members.week} this week`}
              icon={<Users className="size-4" />}
            />
            <Stat
              label="Deposits"
              value={`${fmtUGX(view.money.deposits_total)}`}
              hint={`${fmtUGX(view.money.deposits_today)} UGX today`}
              delta={today && yesterday ? pctChange(today.deposits, yesterday.deposits) : null}
              icon={<ArrowDownToLine className="size-4" />}
            />
            <Stat
              label="Principal in mining"
              value={fmtUGX(view.mining.active_principal)}
              hint={`${view.mining.active_packs} packs running`}
              tone="accent"
              icon={<Pickaxe className="size-4" />}
            />
            <Stat
              label="Payouts released"
              value={fmtUGX(view.money.payouts_total)}
              hint={`${fmtUGX(view.money.payouts_today)} UGX today`}
              icon={<ArrowUpFromLine className="size-4" />}
            />
            <Stat
              label="Wallet float"
              value={fmtUGX(view.money.wallet_available)}
              hint="Available across all wallets"
              icon={<Wallet className="size-4" />}
            />
            <Stat
              label="Rewards credited"
              value={fmtUGX(view.money.rewards_total)}
              hint={`${fmtUGX(view.money.rewards_today)} UGX today`}
              tone="accent"
              icon={<TrendingUp className="size-4" />}
            />
            <Stat
              label="Due at next midnight"
              value={fmtUGX(view.mining.daily_obligation)}
              hint={`Avg yield ${view.mining.avg_yield_pct}% per cycle`}
              tone="warn"
              icon={<Coins className="size-4" />}
            />
            <Stat
              label="Net cash flow"
              value={fmtUGX(view.money.net_flow)}
              hint="Confirmed deposits minus paid withdrawals"
              tone={view.money.net_flow >= 0 ? 'default' : 'neg'}
              icon={<BadgeCheck className="size-4" />}
            />
          </div>

          {/* Flow charts ------------------------------------------------------ */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Panel
              className="lg:col-span-2"
              title="Cash flow · last 14 days"
              subtitle="Confirmed mobile-money deposits against payouts released."
            >
              <TrendBars
                data={series}
                primary="deposits"
                secondary="payouts"
                primaryLabel="Deposits"
                secondaryLabel="Payouts"
                format={(n) => `${fmtUGX(n)}`}
              />
            </Panel>

            <Panel title="Rewards credited" subtitle="Daily earnings, commissions and bonuses.">
              <TrendBars
                data={series}
                primary="rewards"
                primaryLabel="Rewards"
                format={(n) => `${fmtUGX(n)}`}
              />
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-[11px]">
                <div>
                  <p className="text-muted">Lifetime</p>
                  <p className="tnum font-bold text-fg">{fmtUGX(view.money.rewards_total)} UGX</p>
                </div>
                <div className="text-right">
                  <p className="text-muted">Members funded</p>
                  <p className="tnum font-bold text-fg">
                    {view.members.funded} / {view.members.total}
                  </p>
                </div>
              </div>
            </Panel>
          </div>

          {/* Pack performance + ledger mix ------------------------------------ */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Panel
              className="lg:col-span-2"
              title="Pack performance"
              subtitle="Revenue is the principal collected per pack, not profit."
              bodyClassName="p-4 pt-2"
            >
              <TableScroll>
                <thead>
                  <tr>
                    <Th>Pack</Th>
                    <Th className="text-right">Price</Th>
                    <Th className="text-right">Daily</Th>
                    <Th className="text-right">Sold</Th>
                    <Th className="text-right">Running</Th>
                    <Th className="text-right">Revenue</Th>
                  </tr>
                </thead>
                <tbody>
                  {view.packs.map((pack) => (
                    <tr key={pack.id}>
                      <Td>
                        <span className="font-semibold text-fg">{pack.name}</span>
                        <span className="ml-1.5 text-[10px] text-muted">{pack.tier}</span>
                      </Td>
                      <Td className="tnum text-right">{fmtUGX(pack.price)}</Td>
                      <Td className="tnum text-right text-accent-2">{fmtUGX(pack.daily)}</Td>
                      <Td className="tnum text-right">{pack.purchases}</Td>
                      <Td className="tnum text-right">{pack.running}</Td>
                      <Td className="tnum text-right font-semibold">{fmtUGX(pack.revenue)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
            </Panel>

            <Panel title="Money mix · 30 days" subtitle="Where value moved, by ledger kind.">
              {view.mix.length === 0 ? (
                <Empty title="No movement yet" hint="Ledger entries appear as members transact." />
              ) : (
                <MixBars
                  rows={view.mix.map((row) => ({
                    label: ledgerLabel(row.kind),
                    value: row.total,
                    meta: `${row.entries} entries`,
                  }))}
                  format={(n) => fmtUGX(n)}
                />
              )}
            </Panel>
          </div>

          {/* People + activity ------------------------------------------------ */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Top earners" subtitle="Highest lifetime credited earnings.">
              {view.top.length === 0 ? (
                <Empty title="No earnings yet" />
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {view.top.map((member, index) => (
                    <li key={member.id}>
                      <Link href={`/admin/members/${member.id}`} className="flex items-center gap-3 py-2.5">
                        <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-surface-2 text-[10px] font-bold text-muted">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-fg">
                            {member.display_name ?? `@${member.username}`}
                          </p>
                          <p className="truncate text-[10px] text-muted">
                            @{member.username} · {member.packs} pack{member.packs === 1 ? '' : 's'} ·{' '}
                            {fmtUGX(member.invested)} invested
                          </p>
                        </div>
                        <span className="tnum shrink-0 text-[12px] font-bold text-accent-2">
                          {fmtUGX(member.earned)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Recent activity" subtitle="Signups, deposits, pack purchases and payouts.">
              {view.recent.length === 0 ? (
                <Empty title="Nothing has happened yet" />
              ) : (
                <ul className="space-y-2.5">
                  {view.recent.map((item, index) => {
                    const Icon = ACTIVITY_ICON[item.kind] ?? BadgeCheck;
                    return (
                      <li key={`${item.at}-${index}`} className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-surface-2">
                          <Icon className="size-3 text-accent-2" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] text-fg">
                            <span className="font-semibold">@{item.actor}</span> · {item.memo}
                          </p>
                          <p className="text-[10px] text-muted">{fmtDateTime(item.at)}</p>
                        </div>
                        {item.amount > 0 && (
                          <span className="tnum shrink-0 text-[11px] font-semibold text-fg">
                            {fmtUGX(item.amount)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] text-muted">
            <Badge tone="accent">{view.members.admins} admin{view.members.admins === 1 ? '' : 's'}</Badge>
            <span>
              {view.members.with_phone} of {view.members.total} members have a payout number ·{' '}
              {view.members.with_pin} have a security PIN
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
