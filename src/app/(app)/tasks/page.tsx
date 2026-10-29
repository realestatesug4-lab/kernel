'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, Gift, Lock, PartyPopper, Users } from 'lucide-react';
import { AppHeader } from '@/components/layout/TopBar';
import { Button, Card, EmptyState, ProgressBar, Spinner } from '@/components/ui';
import { ReferralCard } from '@/components/ReferralCard';
import { useToast } from '@/components/providers/ToastProvider';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';
import { fmtUGX } from '@/lib/format';
import { milestones as seedMilestones } from '@/lib/brand';
import type { Milestone } from '@/lib/types';

const seed: Milestone[] = seedMilestones.map((m) => ({
  id: String(m.invite),
  invite_required: m.invite,
  unlock_amount: m.unlock,
  extra_reward: m.extra,
  invites: 0,
  unlocked: false,
  claimed: false,
}));

export default function TasksPage() {
  const toast = useToast();
  const { data, loading, reload } = useAsync<Milestone[]>(() => api.tasks.list(), []);
  const { data: summary } = useAsync<{ code: string } | null>(
    () => api.team.summary().then((r) => (r.ok ? r.data : null)),
    [],
  );
  const [claiming, setClaiming] = useState<string | null>(null);

  const list = data && data.length ? data : seed;
  const totalReward = list.filter((m) => m.claimed).reduce((s, m) => s + m.extra_reward, 0);

  async function claim(m: Milestone) {
    setClaiming(m.id);
    const res = await api.tasks.claim(m.id);
    setClaiming(null);
    if (!res.ok) {
      toast.push(res.message, 'err');
      return;
    }
    toast.push(`Task reward of ${fmtUGX(res.data.reward)} UGX credited.`, 'ok');
    reload();
  }

  return (
    <>
      <AppHeader />
      <div className="space-y-4 px-4 pt-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Task center</h1>
          <p className="mt-0.5 text-xs text-muted">
            Invite friends on level 1 to unlock pack value and claim extra rewards.
          </p>
        </div>

        <Card className="flex items-center gap-3 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-2">
            <PartyPopper className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-xs text-muted">Rewards claimed</p>
            <p className="tnum text-lg font-extrabold text-accent-2">{fmtUGX(totalReward)} UGX</p>
          </div>
          <Link href="/team" className="text-xs font-semibold text-accent-2">My team</Link>
        </Card>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Spinner className="size-7" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState title="No tasks available" hint="Check back soon." />
        ) : (
          <div className="space-y-3">
            {list.map((m) => (
              <MilestoneCard key={m.id} m={m} busy={claiming === m.id} onClaim={() => claim(m)} />
            ))}
          </div>
        )}

        <ReferralCard code={summary?.code ?? ''} />

        <p className="px-2 text-center text-[11px] leading-relaxed text-muted">
          Invites count level-1 members only. Extra rewards are credited once per milestone to your
          available balance.
        </p>
      </div>
    </>
  );
}

function MilestoneCard({ m, busy, onClaim }: { m: Milestone; busy: boolean; onClaim: () => void }) {
  const progress = Math.min(100, (m.invites / m.invite_required) * 100);

  return (
    <Card className={`overflow-hidden p-0 ${m.unlocked && !m.claimed ? 'ring-1 ring-accent/40' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className="relative grid size-14 shrink-0 place-items-center rounded-2xl border border-line bg-surface-2">
          <span className="tnum text-lg font-extrabold text-accent-2">{m.invite_required}</span>
          <span className="text-[9px] uppercase tracking-wider text-muted">friends</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Invite {m.invite_required} friends to join</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold">
              Unlock {fmtUGX(m.unlock_amount)} UGX
            </span>
            <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-2">
              Extra {fmtUGX(m.extra_reward)} UGX
            </span>
          </div>
        </div>

        <span className={`grid size-7 shrink-0 place-items-center rounded-full border ${
          m.claimed
            ? 'border-pos/40 bg-pos/10 text-pos'
            : m.unlocked
              ? 'border-accent/40 bg-accent-soft text-accent-2'
              : 'border-line bg-surface-2 text-muted'
        }`}>
          {m.claimed ? <Check className="size-4" /> : m.unlocked ? <Gift className="size-4" /> : <Lock className="size-3.5" />}
        </span>
      </div>

      <div className="space-y-2 px-4 pb-3.5">
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" />
            {Math.min(m.invites, m.invite_required)}/{m.invite_required} invited
          </span>
          <span className="tnum font-semibold">
            {m.claimed ? 'Reward claimed' : m.unlocked ? 'Ready to claim' : `${Math.max(0, m.invite_required - m.invites)} to go`}
          </span>
        </div>
        <ProgressBar value={progress} />

        <Button
          size="sm"
          block
          variant={m.claimed ? 'ghost' : m.unlocked ? 'primary' : 'secondary'}
          disabled={!m.unlocked || m.claimed}
          loading={busy}
          onClick={onClaim}
        >
          {m.claimed ? 'Claimed' : m.unlocked ? `Claim ${fmtUGX(m.extra_reward)} UGX` : 'Locked'}
        </Button>
      </div>
    </Card>
  );
}
