'use client';

import { useState } from 'react';
import { RefreshCw, Save, ShieldCheck, UserPlus } from 'lucide-react';
import { AdminHeader } from '@/components/admin/AdminShell';
import { Empty, Loading, Notice, Panel, TableScroll, Td, Th } from '@/components/admin/kit';
import { Badge, Button } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { useAsync } from '@/lib/useAsync';
import { adminApi } from '@/lib/admin';
import { fmtDate, ledgerLabel } from '@/lib/format';

const RULE_META: Record<string, { label: string; unit: string }> = {
  welcome_bonus: { label: 'Welcome bonus', unit: 'UGX' },
  min_deposit: { label: 'Minimum deposit', unit: 'UGX' },
  max_deposit: { label: 'Maximum deposit', unit: 'UGX' },
  min_withdrawal: { label: 'Minimum withdrawal', unit: 'UGX' },
  withdrawal_fee_pct: { label: 'Withdrawal charge', unit: '%' },
  referral_l1_pct: { label: 'Level 1 commission', unit: '%' },
  referral_l2_pct: { label: 'Level 2 commission', unit: '%' },
  task_commission_cap: { label: 'Task commission cap', unit: 'UGX' },
};

export default function AdminSettingsPage() {
  const toast = useToast();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busyRule, setBusyRule] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [busyAdmin, setBusyAdmin] = useState(false);

  const rules = useAsync(() => adminApi.rules.list(), []);
  const admins = useAsync(() => adminApi.admins.list(), []);

  const ruleRows = rules.data?.ok ? rules.data.data : [];
  const adminRows = admins.data?.ok ? admins.data.data : [];

  async function saveRule(key: string, fallback: number) {
    const raw = edits[key];
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isFinite(value) || value < 0) return toast.push('Enter a value of zero or more.', 'err');

    setBusyRule(key);
    const res = await adminApi.rules.set(key, Math.round(value));
    setBusyRule(null);

    if (!res.ok) {
      toast.push(res.message, 'err');
      return;
    }
    toast.push('Programme rule updated.', 'ok');
    setEdits((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    rules.reload();
  }

  async function setRole(target: string, enabled: boolean) {
    const confirmed = window.confirm(
      enabled
        ? `Give @${target} access to the operations console?`
        : `Remove console access from @${target}?`,
    );
    if (!confirmed) return;

    setBusyAdmin(true);
    const res = await adminApi.admins.setRole(target, enabled);
    setBusyAdmin(false);

    if (!res.ok) {
      toast.push(res.message, 'err');
      return;
    }
    toast.push(enabled ? `@${target} is now an admin.` : `@${target} is no longer an admin.`, 'ok');
    setUsername('');
    admins.reload();
  }

  return (
    <>
      <AdminHeader
        title="Settings"
        description="Programme rules and who can open this console."
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              rules.reload();
              admins.reload();
            }}
            icon={<RefreshCw className="size-3.5" />}
          >
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Rule book ------------------------------------------------------- */}
        <Panel
          title="Programme rules"
          subtitle="These numbers drive deposits, payouts and commissions. Past transactions are never recalculated."
        >
          {rules.loading && ruleRows.length === 0 ? (
            <Loading label="Loading rules" />
          ) : rules.data && !rules.data.ok ? (
            <Notice tone="neg">{rules.data.message}</Notice>
          ) : ruleRows.length === 0 ? (
            <Empty title="No rules found" hint="Run migration 0006 to seed km_config." />
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {ruleRows.map((rule) => {
                const meta = RULE_META[rule.key] ?? { label: ledgerLabel(rule.key), unit: '' };
                const value = edits[rule.key] ?? String(rule.value);
                const dirty = edits[rule.key] !== undefined && Number(edits[rule.key]) !== rule.value;

                return (
                  <li key={rule.key} className="flex items-end gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-fg">{meta.label}</p>
                      <p className="truncate text-[10px] text-muted">
                        {rule.note ?? rule.key} · saved {fmtDate(rule.updated_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <input
                        type="number"
                        value={value}
                        onChange={(event) => setEdits({ ...edits, [rule.key]: event.target.value })}
                        className="tnum h-8 w-24 rounded-lg border border-line bg-surface-2 px-2 text-right text-[12px] outline-none focus:border-accent"
                      />
                      <span className="w-8 text-[10px] font-semibold text-muted">{meta.unit}</span>
                      <Button
                        size="sm"
                        variant={dirty ? 'primary' : 'secondary'}
                        className="!h-8 !px-2"
                        disabled={!dirty}
                        loading={busyRule === rule.key}
                        onClick={() => saveRule(rule.key, rule.value)}
                        icon={<Save className="size-3.5" />}
                      >
                        Save
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Admins ---------------------------------------------------------- */}
        <Panel
          title="Administrators"
          subtitle="Admins can open the console and release payouts. The last admin cannot be demoted."
        >
          <div className="mb-3 flex items-end gap-2">
            <label className="block flex-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                Promote by username
              </span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="joel.k"
                className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-[13px] outline-none placeholder:text-muted focus:border-accent"
              />
            </label>
            <Button
              size="sm"
              loading={busyAdmin}
              onClick={() => {
                if (!username.trim()) return toast.push('Enter a username first.', 'err');
                setRole(username.trim().replace(/^@/, '').toLowerCase(), true);
              }}
              icon={<UserPlus className="size-3.5" />}
            >
              Promote
            </Button>
          </div>

          {admins.loading && adminRows.length === 0 ? (
            <Loading label="Loading admins" />
          ) : admins.data && !admins.data.ok ? (
            <Notice tone="neg">{admins.data.message}</Notice>
          ) : adminRows.length === 0 ? (
            <Empty
              title="No flagged admins"
              hint="Accounts in ADMIN_EMAILS still have access; promote somebody here to store it in the database."
            />
          ) : (
            <TableScroll>
              <thead>
                <tr>
                  <Th>Admin</Th>
                  <Th>Since</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {adminRows.map((admin) => (
                  <tr key={admin.id}>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold text-fg">
                          {admin.display_name ?? `@${admin.username}`}
                        </span>
                        <Badge tone="accent">
                          <ShieldCheck className="mr-1 size-3" />
                          admin
                        </Badge>
                      </span>
                      <span className="block truncate text-[10px] text-muted">@{admin.username}</span>
                    </Td>
                    <Td className="whitespace-nowrap text-[10px] text-muted">{fmtDate(admin.created_at)}</Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        disabled={busyAdmin}
                        onClick={() => setRole(admin.username, false)}
                        className="rounded-lg border border-line px-2 py-1 text-[10px] font-semibold text-muted transition hover:border-neg/60 hover:text-neg disabled:opacity-50"
                      >
                        Demote
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}

          <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-[10px] leading-relaxed text-muted">
            <p>
              <code className="text-fg">ADMIN_EMAILS</code> in the environment stays as the break-glass list. A
              member is treated as an admin when either source grants it.
            </p>
            <p>
              Service role key detected — privileged reads and the payout release are enabled.
            </p>
          </div>
        </Panel>
      </div>

      <Panel className="mt-3" title="Data window" subtitle="What this console reads and how fresh it is.">
        <div className="grid gap-2 text-[11px] text-muted sm:grid-cols-3">
          <p>
            <span className="block font-semibold text-fg">Overview</span>
            Aggregated in Postgres on every load. 14-day series, 30-day ledger mix.
          </p>
          <p>
            <span className="block font-semibold text-fg">Lists</span>
            Server-paginated with search. Amounts are whole UGX.
          </p>
          <p>
            <span className="block font-semibold text-fg">Payouts</span>
            Released through SHASHURA. A refused payout refunds automatically.
          </p>
        </div>
      </Panel>
    </>
  );
}
