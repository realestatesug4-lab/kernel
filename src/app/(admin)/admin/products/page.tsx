'use client';

import { useState } from 'react';
import { Pencil, RefreshCw, Save, X } from 'lucide-react';
import { AdminHeader } from '@/components/admin/AdminShell';
import { Empty, Loading, Notice, Panel } from '@/components/admin/kit';
import { Badge, Button } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { useAsync } from '@/lib/useAsync';
import { adminApi, type AdminProduct } from '@/lib/admin';
import { fmtUGX } from '@/lib/format';

type Draft = {
  id: string;
  name: string;
  tier: string;
  price: string;
  daily: string;
  duration_days: string;
  total: string;
};

function toDraft(product: AdminProduct): Draft {
  return {
    id: product.id,
    name: product.name,
    tier: product.tier,
    price: String(product.price),
    daily: String(product.daily),
    duration_days: String(product.duration_days),
    total: String(product.total),
  };
}

export default function AdminProductsPage() {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, reload } = useAsync(() => adminApi.products.list(), []);
  const products = data?.ok ? data.data : [];
  const notice = data && !data.ok ? data.message : null;

  async function toggle(product: AdminProduct) {
    setBusy(product.id);
    const res = await adminApi.products.update({ id: product.id, active: !product.active });
    setBusy(null);
    if (!res.ok) {
      toast.push(res.message, 'err');
      return;
    }
    toast.push(
      `${product.name} is ${product.active ? 'off sale' : 'on sale'}. Existing packs are unaffected.`,
      'ok',
    );
    reload();
  }

  async function save() {
    if (!draft) return;
    const price = Number(draft.price);
    const daily = Number(draft.daily);
    const duration = Number(draft.duration_days);
    const total = Number(draft.total);

    if (!Number.isFinite(price) || price <= 0) return toast.push('Enter a price above zero.', 'err');
    if (!Number.isFinite(daily) || daily <= 0) return toast.push('Enter a daily payout above zero.', 'err');
    if (!Number.isFinite(duration) || duration <= 0) return toast.push('Enter a duration of at least one day.', 'err');

    setBusy(draft.id);
    const res = await adminApi.products.update({
      id: draft.id,
      name: draft.name.trim(),
      tier: draft.tier.trim(),
      price: Math.round(price),
      daily: Math.round(daily),
      duration_days: Math.round(duration),
      total: Number.isFinite(total) && total > 0 ? Math.round(total) : Math.round(daily * duration),
    });
    setBusy(null);

    if (!res.ok) {
      toast.push(res.message, 'err');
      return;
    }
    toast.push('Pack terms updated. Packs already sold keep their original terms.', 'ok');
    setDraft(null);
    reload();
  }

  return (
    <>
      <AdminHeader
        title="Mining packs"
        description="Terms apply to new purchases only — running contracts are never rewritten."
        actions={
          <Button size="sm" variant="secondary" onClick={reload} icon={<RefreshCw className="size-3.5" />}>
            Refresh
          </Button>
        }
      />

      {loading && !products ? (
        <Loading label="Loading the catalogue" />
      ) : notice ? (
        <Notice tone="neg">{notice}</Notice>
      ) : products.length === 0 ? (
        <Empty title="No packs configured" hint="Run the seed migration to publish the catalogue." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {products.map((product) => {
            const editing = draft?.id === product.id;
            return (
              <Panel
                key={product.id}
                className={product.active ? '' : 'opacity-75'}
                title={
                  <span className="flex items-center gap-1.5">
                    {product.name}
                    <Badge tone={product.active ? 'pos' : 'neutral'}>
                      {product.active ? 'on sale' : 'retired'}
                    </Badge>
                  </span>
                }
                subtitle={`Pack ${product.no} · ${product.tier} · ${product.duration_days} days · ${product.yield_pct}% total`}
                action={
                  editing ? (
                    <button
                      type="button"
                      onClick={() => setDraft(null)}
                      className="grid size-7 place-items-center rounded-lg border border-line text-muted hover:text-fg"
                      aria-label="Cancel edit"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDraft(toDraft(product))}
                      className="grid size-7 place-items-center rounded-lg border border-line text-muted hover:text-fg"
                      aria-label={`Edit ${product.name}`}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )
                }
              >
                {editing && draft ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Name
                        </span>
                        <input
                          value={draft.name}
                          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                          className="h-8 w-full rounded-lg border border-line bg-surface-2 px-2 text-[12px] outline-none focus:border-accent"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Tier
                        </span>
                        <input
                          value={draft.tier}
                          onChange={(event) => setDraft({ ...draft, tier: event.target.value })}
                          className="h-8 w-full rounded-lg border border-line bg-surface-2 px-2 text-[12px] outline-none focus:border-accent"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Price
                        </span>
                        <input
                          type="number"
                          value={draft.price}
                          onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                          className="tnum h-8 w-full rounded-lg border border-line bg-surface-2 px-2 text-[12px] outline-none focus:border-accent"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Daily
                        </span>
                        <input
                          type="number"
                          value={draft.daily}
                          onChange={(event) => setDraft({ ...draft, daily: event.target.value })}
                          className="tnum h-8 w-full rounded-lg border border-line bg-surface-2 px-2 text-[12px] outline-none focus:border-accent"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Days
                        </span>
                        <input
                          type="number"
                          value={draft.duration_days}
                          onChange={(event) => setDraft({ ...draft, duration_days: event.target.value })}
                          className="tnum h-8 w-full rounded-lg border border-line bg-surface-2 px-2 text-[12px] outline-none focus:border-accent"
                        />
                      </label>
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="block flex-1">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Total payout
                        </span>
                        <input
                          type="number"
                          value={draft.total}
                          onChange={(event) => setDraft({ ...draft, total: event.target.value })}
                          className="tnum h-8 w-full rounded-lg border border-line bg-surface-2 px-2 text-[12px] outline-none focus:border-accent"
                        />
                      </label>
                      <Button size="sm" loading={busy === product.id} onClick={save} icon={<Save className="size-3.5" />}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl border border-line bg-surface-2/60 px-2 py-2">
                        <p className="text-[10px] text-muted">Price</p>
                        <p className="tnum mt-0.5 text-[12px] font-bold text-fg">{fmtUGX(product.price)}</p>
                      </div>
                      <div className="rounded-xl border border-line bg-surface-2/60 px-2 py-2">
                        <p className="text-[10px] text-muted">Daily</p>
                        <p className="tnum mt-0.5 text-[12px] font-bold text-accent-2">{fmtUGX(product.daily)}</p>
                      </div>
                      <div className="rounded-xl border border-line bg-surface-2/60 px-2 py-2">
                        <p className="text-[10px] text-muted">Total</p>
                        <p className="tnum mt-0.5 text-[12px] font-bold text-fg">{fmtUGX(product.total)}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
                      <span>
                        <span className="tnum font-semibold text-fg">{product.purchases}</span> sold ·{' '}
                        <span className="tnum font-semibold text-fg">{product.running}</span> running
                      </span>
                      <span className="tnum">
                        revenue <span className="font-semibold text-fg">{fmtUGX(product.revenue)}</span>
                      </span>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3 w-full"
                      loading={busy === product.id}
                      onClick={() => toggle(product)}
                    >
                      {product.active ? 'Take off sale' : 'Put back on sale'}
                    </Button>
                  </>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
