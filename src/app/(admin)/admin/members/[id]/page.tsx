'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, BadgeCheck, ShieldOff, ShieldCheck } from 'lucide-react';
import { AdminHeader } from '@/components/admin/AdminShell';
import {
  Empty, Loading, Notice, Panel, Stat, TableScroll, Td, Th, statusTone,
} from '@/components/admin/kit';
import { Badge, Button } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { useAsync } from '@/lib/useAsync';
import { adminApi } from '@/lib/admin';
import { fmtDate, fmtDateTime, fmtSigned, fmtUGX, ledgerLabel } from '@/lib/format';
import { formatMsisdn } from '@/lib/msisdn';

export default function AdminMemberDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const { data, loading, reload } = useAsync(() => adminApi.members.detail(id), [id]);
  const detail = data?.ok ? data.data : null;
  const notice = data && !data.ok ? data.message : null;

  async function toggleAdmin() {
    if (!detail?.found) return;
    const profile = detail.profile;
    const promote = !profile.is_super_admin;
    const confirmed = window.confirm(
      promote
        ? `Give @${profile.username} access to the operations console?`
        : `Remove console access from @${profile.username}?`,
    );
    if (!confirmed) return;

    setBusy(true);
    const res = await adminApi.admins.setRole(profile.username, promote);
    setBusy(false);

    if (!res.ok) {
      toast.push(res.message, 'err');
      return;
    }
    toast.push(
      promote ? `@${profile.username} is now an admin.` : `@${profile.username} is no longer an admin.`,
      'ok',
    );
    reload();
  }

  if (loading && !detail) return <Loading label="Loading member" />;

  if (notice) {
    return (
      <>
        <AdminHeader title="Member" description="Could not load this account." />
        <Notice tone="neg">{notice}</Notice>
      </>
    );
  }

  if (!detail || !detail.found) {
    return (
      <>
        <AdminHeader title="Member" description="This account is not in the register." />
        <Empty title="Member not found" hint="The account may have been deleted." />
        <Link href="/admin/members" className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-accent-2">
          <ArrowLeft className="size-3.5" />
          Back to members
        </Link>
      </>
    );
  }

  const { profile, balance, stats } = detail;

  return (
    <>
      <AdminHeader
        title={profile.display_name ?? `@${profile.username}`}
        description={`@${profile.username} · ${profile.referral_code}`}
        actions={
          <>
            <Link
              href="/admin/members"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 text-[12px] font-semibold text-fg transition hover:border-accent/60"
            >
              <ArrowLeft className="size-3.5" />
              Members
            </Link>
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={toggleAdmin}
              icon={
                profile.is_super_admin ? <ShieldOff className="size-3.5" /> : <ShieldCheck className="size-3.5" />
              }
            >
              {profile.is_super_admin ? 'Remove admin' : 'Make admin'}
            </Button>
          </>
        }
      />

      <div className="space-y-3">
        {/* Identity ---------------------------------------------------------- */}
        <Panel bodyClassName="p-4">
          <div className="flex flex-wrap items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl brand-gradient text-base font-extrabold text-black">
              {(profile.display_name ?? profile.username).slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-sm font-bold text-fg">{profile.display_name ?? `@${profile.username}`}</p>
                {profile.is_super_admin && (
                  <Badge tone="accent">
                    <BadgeCheck className="mr-1 size-3" />
                    admin
                  </Badge>
                )}
                <Badge tone={profile.has_pin ? 'pos' : 'warn'}>
                  {profile.has_pin ? 'PIN set' : 'no PIN'}
                </Badge>
              </div>
              <div className="mt-1 grid gap-x-6 gap-y-0.5 text-[11px] text-muted sm:grid-cols-2">
                <span className="tnum">Phone · {profile.phone ? formatMsisdn(profile.phone) : '—'}</span>
                <span className="truncate">Email · {profile.email ?? '—'}</span>
                <span>Joined · {fmtDate(profile.created_at)}</span>
                <span>
                  Invited by{' '}
                  {profile.referrer ? (
                    <Link href={`/admin/members/${profile.referrer.id}`} className="text-accent-2">
                      @{profile.referrer.username}
                    </Link>
                  ) : (
                    '—'
                  )}
                </span>
                <span>Locale · {profile.locale}</span>
                <span>Last activity · {stats.last_activity ? fmtDateTime(stats.last_activity) : '—'}</span>
              </div>
            </div>
          </div>
        </Panel>

        {/* Wallet ------------------------------------------------------------ */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Stat label="Available" value={fmtUGX(balance.available)} hint="Withdrawable now" />
          <Stat label="In mining" value={fmtUGX(balance.invested)} hint={`${stats.active_packs} packs running`} />
          <Stat label="Earned" value={fmtUGX(balance.earned_total)} tone="accent" hint="Lifetime credited" />
          <Stat
            label="Pending payout"
            value={fmtUGX(balance.pending_withdrawal)}
            tone={balance.pending_withdrawal > 0 ? 'warn' : 'default'}
            hint="Held for release"
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Packs" value={stats.packs} hint={`${stats.active_packs} active`} />
          <Stat label="Deposited" value={fmtUGX(stats.deposits_total)} hint="Confirmed" />
          <Stat label="Withdrawn" value={fmtUGX(stats.withdrawals_total)} hint="Paid out" />
          <Stat label="L1 / L2" value={`${stats.invite_l1} / ${stats.invite_l2}`} hint="Referrals" />
          <Stat label="Commission" value={fmtUGX(stats.commission_l1 + stats.commission_l2)} hint="Both levels" />
          <Stat label="Task rewards" value={fmtUGX(stats.task_rewards)} hint="Milestones" />
        </div>

        {/* Packs ------------------------------------------------------------- */}
        <Panel title="Mining packs" subtitle={`${stats.packs} purchased · ${stats.active_packs} still running`}>
          {detail.investments.length === 0 ? (
            <Empty title="No packs yet" hint="This member has not bought a mining pack." />
          ) : (
            <TableScroll>
              <thead>
                <tr>
                  <Th>Pack</Th>
                  <Th className="text-right">Paid</Th>
                  <Th className="text-right">Daily</Th>
                  <Th className="text-right">Cycles</Th>
                  <Th className="text-right">Earned</Th>
                  <Th>Status</Th>
                  <Th>Started</Th>
                </tr>
              </thead>
              <tbody>
                {detail.investments.map((pack) => (
                  <tr key={pack.id}>
                    <Td className="font-semibold">{pack.product_name}</Td>
                    <Td className="tnum text-right">{fmtUGX(pack.amount)}</Td>
                    <Td className="tnum text-right text-accent-2">{fmtUGX(pack.daily)}</Td>
                    <Td className="tnum text-right">
                      {pack.paid_cycles}/{pack.duration_days}
                    </Td>
                    <Td className="tnum text-right font-semibold">{fmtUGX(pack.earned)}</Td>
                    <Td>
                      <Badge tone={statusTone(pack.status)}>{pack.status}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-[10px] text-muted">{fmtDate(pack.started_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}
        </Panel>

        {/* Ledger + payouts --------------------------------------------------- */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Ledger" subtitle="Every credit and debit on this wallet.">
            {detail.ledger.length === 0 ? (
              <Empty title="No entries" />
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {detail.ledger.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] text-fg">{ledgerLabel(entry.kind)}</p>
                      <p className="truncate text-[10px] text-muted">
                        {entry.memo ?? '—'} · {fmtDateTime(entry.created_at)}
                      </p>
                    </div>
                    <span
                      className={`tnum shrink-0 text-[12px] font-semibold ${
                        entry.amount >= 0 ? 'text-pos' : 'text-neg'
                      }`}
                    >
                      {fmtSigned(entry.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Payout history" subtitle={`${detail.withdrawals.length} request(s)`}>
            {detail.withdrawals.length === 0 ? (
              <Empty title="No withdrawals" />
            ) : (
              <TableScroll>
                <thead>
                  <tr>
                    <Th>Requested</Th>
                    <Th className="text-right">Net</Th>
                    <Th>Destination</Th>
                    <Th>Status</Th>
                    <Th>When</Th>
                  </tr>
                </thead>
                <tbody>
                  {detail.withdrawals.map((row) => (
                    <tr key={row.id}>
                      <Td className="tnum font-semibold">{fmtUGX(row.amount)}</Td>
                      <Td className="tnum text-right">{fmtUGX(row.net)}</Td>
                      <Td className="tnum text-[11px]">{formatMsisdn(row.destination)}</Td>
                      <Td>
                        <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-[10px] text-muted">{fmtDate(row.created_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
            )}
          </Panel>
        </div>

        {/* Deposits ---------------------------------------------------------- */}
        <Panel title="Deposits" subtitle="Mobile-money top-ups.">
          {detail.deposits.length === 0 ? (
            <Empty title="No deposits" />
          ) : (
            <TableScroll>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                  <Th>From</Th>
                  <Th>Created</Th>
                  <Th>Confirmed</Th>
                </tr>
              </thead>
              <tbody>
                {detail.deposits.map((row) => (
                  <tr key={row.id}>
                    <Td className="tnum text-[11px]">{row.reference ?? '—'}</Td>
                    <Td className="tnum text-right font-semibold">{fmtUGX(row.amount)}</Td>
                    <Td>
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    </Td>
                    <Td className="tnum text-[11px]">{row.msisdn ? formatMsisdn(row.msisdn) : '—'}</Td>
                    <Td className="whitespace-nowrap text-[10px] text-muted">{fmtDate(row.created_at)}</Td>
                    <Td className="whitespace-nowrap text-[10px] text-muted">
                      {row.confirmed_at ? fmtDateTime(row.confirmed_at) : '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}
        </Panel>

        {/* Team + claims ----------------------------------------------------- */}
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel className="lg:col-span-2" title="Referral team" subtitle="Two levels deep.">
            {detail.team.length === 0 ? (
              <Empty title="No invitees" />
            ) : (
              <TableScroll>
                <thead>
                  <tr>
                    <Th>Member</Th>
                    <Th>Level</Th>
                    <Th className="text-right">Invested</Th>
                    <Th>Joined</Th>
                  </tr>
                </thead>
                <tbody>
                  {detail.team.map((member) => (
                    <tr key={member.id}>
                      <Td>
                        <Link href={`/admin/members/${member.id}`} className="font-semibold text-accent-2">
                          @{member.username}
                        </Link>
                        {member.display_name && (
                          <span className="ml-1.5 text-[10px] text-muted">{member.display_name}</span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={member.level === 1 ? 'accent' : 'neutral'}>L{member.level}</Badge>
                      </Td>
                      <Td className="tnum text-right">{fmtUGX(member.invested)}</Td>
                      <Td className="whitespace-nowrap text-[10px] text-muted">{fmtDate(member.joined_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
            )}
          </Panel>

          <Panel title="Task claims" subtitle="Invite milestones paid out.">
            {detail.claims.length === 0 ? (
              <Empty title="No claims" />
            ) : (
              <ul className="space-y-2">
                {detail.claims.map((claim) => (
                  <li key={claim.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted">{claim.invite_required} invites</span>
                    <span className="tnum font-semibold text-accent-2">{fmtUGX(claim.reward)}</span>
                    <span className="text-[10px] text-muted">{fmtDate(claim.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
