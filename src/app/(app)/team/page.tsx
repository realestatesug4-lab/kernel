'use client';

import { useState } from 'react';
import { Coins, Layers, Users } from 'lucide-react';
import { AppHeader } from '@/components/layout/TopBar';
import { Card, EmptyState, Spinner } from '@/components/ui';
import { ReferralCard } from '@/components/ReferralCard';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { fmtDate, fmtUGX } from '@/lib/format';
import { rules } from '@/lib/brand';
import type { TeamMember } from '@/lib/types';

type Summary = { code: string; level1: number; level2: number; commission_l1: number; commission_l2: number };

export default function TeamPage() {
  const [level, setLevel] = useState<1 | 2>(1);
  const { data: summary } = useAsync<Summary | null>(
    () => api.team.summary().then((r) => (r.ok ? r.data : null)),
    [],
  );
  const { data: members, loading } = useAsync<TeamMember[]>(() => api.team.members(level), [level]);

  const commission = level === 1 ? summary?.commission_l1 ?? 0 : summary?.commission_l2 ?? 0;

  return (
    <>
      <AppHeader />
      <div className="space-y-4 px-4 pt-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">My team</h1>
          <p className="mt-0.5 text-xs text-muted">
            Two levels deep — {rules.referral.level1}% on level 1 and {rules.referral.level2}% on level 2.
          </p>
        </div>

        <ReferralCard code={summary?.code ?? ''} />

        <div className="grid grid-cols-3 gap-2">
          <Stat icon={<Users className="size-4" />} label="Level 1" value={String(summary?.level1 ?? 0)} />
          <Stat icon={<Layers className="size-4" />} label="Level 2" value={String(summary?.level2 ?? 0)} />
          <Stat icon={<Coins className="size-4" />} label="Commission" value={fmtUGX((summary?.commission_l1 ?? 0) + (summary?.commission_l2 ?? 0))} tone />
        </div>

        <div className="grid grid-cols-2 rounded-2xl bg-surface-2 p-1 text-sm font-semibold">
          {([1, 2] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`h-9 rounded-xl transition ${level === l ? 'bg-surface text-fg shadow-[var(--shadow)]' : 'text-muted'}`}
            >
              Level {l} ({l === 1 ? summary?.level1 ?? 0 : summary?.level2 ?? 0})
            </button>
          ))}
        </div>

        <Card className="divide-y divide-[var(--line)] p-0">
          <div className="flex items-center justify-between px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted">
            <span>Member</span>
            <span>Commission</span>
          </div>

          {loading ? (
            <div className="grid place-items-center py-12">
              <Spinner className="size-6" />
            </div>
          ) : (members ?? []).length === 0 ? (
            <div className="p-3">
              <EmptyState
                title={`No level ${level} members yet`}
                hint={level === 1 ? 'Share your invite link to start building your team.' : 'Your level 1 members’ invites appear here.'}
              />
            </div>
          ) : (
            (members ?? []).map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-2">
                  {m.label.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.label}</p>
                  <p className="tnum text-[11px] text-muted">
                    Joined {fmtDate(m.joined_at)} · {fmtUGX(m.invested)} invested
                  </p>
                </div>
                <p className="tnum text-sm font-bold text-accent-2">+{fmtUGX(m.commission)}</p>
              </div>
            ))
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-bold">How your commission works</h2>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
            <li>· Level 1: {rules.referral.level1}% of every pack bought by people you invite.</li>
            <li>· Level 2: {rules.referral.level2}% of every pack bought by their invites.</li>
            <li>· Commission is credited to your available balance instantly on purchase.</li>
          </ul>
          <p className="mt-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[11px] text-muted">
            Level 1 commission earned: <span className="tnum font-bold text-fg">{fmtUGX(summary?.commission_l1 ?? 0)}</span>
            {' · '}
            Level 2: <span className="tnum font-bold text-fg">{fmtUGX(summary?.commission_l2 ?? 0)}</span>
            {' · '}
            Viewing level {level}: <span className="tnum font-bold text-accent-2">{fmtUGX(commission)}</span>
          </p>
        </Card>
      </div>
    </>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: boolean }) {
  return (
    <Card className="p-3">
      <span className="text-accent-2">{icon}</span>
      <p className={`tnum mt-1 truncate text-sm font-extrabold ${tone ? 'text-accent-2' : ''}`}>{value}</p>
      <p className="truncate text-[11px] text-muted">{label}</p>
    </Card>
  );
}
