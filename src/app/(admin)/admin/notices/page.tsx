'use client';

import { useState } from 'react';
import { Megaphone, Pencil, RefreshCw, Save, Trash2 } from 'lucide-react';
import { AdminHeader } from '@/components/admin/AdminShell';
import { Empty, Loading, Notice, Panel } from '@/components/admin/kit';
import { Badge, Button } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { useAsync } from '@/lib/useAsync';
import { adminApi, type AdminNotice } from '@/lib/admin';
import { fmtDateTime } from '@/lib/format';

type Draft = { id: string | null; title: string; body: string; kind: string; published: boolean };

const EMPTY: Draft = { id: null, title: '', body: '', kind: 'system', published: true };

const KINDS = ['system', 'update', 'promotion', 'maintenance'];

export default function AdminNoticesPage() {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  const { data, loading, reload } = useAsync(() => adminApi.notices.list(), []);
  const notices = data?.ok ? data.data : [];
  const notice = data && !data.ok ? data.message : null;

  async function save() {
    if (!draft.title.trim()) return toast.push('Give the notice a title.', 'err');
    if (!draft.body.trim()) return toast.push('Give the notice some text.', 'err');

    setBusy(true);
    const res = await adminApi.notices.save(draft);
    setBusy(false);

    if (!res.ok) {
      toast.push(res.message, 'err');
      return;
    }
    toast.push(draft.id ? 'Notice updated.' : 'Notice published.', 'ok');
    setDraft(EMPTY);
    reload();
  }

  async function remove(item: AdminNotice) {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;

    setBusy(true);
    const res = await adminApi.notices.remove(item.id);
    setBusy(false);

    if (!res.ok) {
      toast.push(res.message, 'err');
      return;
    }
    toast.push('Notice deleted.', 'ok');
    if (draft.id === item.id) setDraft(EMPTY);
    reload();
  }

  function edit(item: AdminNotice) {
    setDraft({
      id: item.id,
      title: item.title,
      body: item.body,
      kind: item.kind,
      published: item.published,
    });
  }

  return (
    <>
      <AdminHeader
        title="Notices"
        description="What members read in the notice board."
        actions={
          <Button size="sm" variant="secondary" onClick={reload} icon={<RefreshCw className="size-3.5" />}>
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-5">
        {/* Editor ------------------------------------------------------------ */}
        <Panel
          className="lg:col-span-2"
          title={draft.id ? 'Edit notice' : 'New notice'}
          subtitle={draft.id ? 'Changes appear immediately.' : 'Published notices show up in the app at once.'}
        >
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                Title
              </span>
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Midnight payouts"
                className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-[13px] outline-none placeholder:text-muted focus:border-accent"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                Body
              </span>
              <textarea
                value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                rows={5}
                placeholder="Explain the change in plain language."
                className="w-full resize-y rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-accent"
              />
            </label>

            <div className="flex items-center gap-2">
              <label className="flex-1">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Kind
                </span>
                <select
                  value={draft.kind}
                  onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
                  className="h-9 w-full rounded-xl border border-line bg-surface-2 px-2.5 text-[12px] font-semibold text-fg outline-none focus:border-accent"
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setDraft({ ...draft, published: !draft.published })}
                className={`mt-5 inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-[11px] font-semibold transition ${
                  draft.published
                    ? 'border-pos/40 bg-pos/10 text-pos'
                    : 'border-line bg-surface-2 text-muted'
                }`}
              >
                {draft.published ? 'Published' : 'Draft'}
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" loading={busy} onClick={save} icon={<Save className="size-3.5" />}>
                {draft.id ? 'Save changes' : 'Publish notice'}
              </Button>
              {draft.id && (
                <Button size="sm" variant="ghost" onClick={() => setDraft(EMPTY)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </Panel>

        {/* Board ------------------------------------------------------------- */}
        <Panel
          className="lg:col-span-3"
          title="Notice board"
          subtitle={notices ? `${notices.length} notice${notices.length === 1 ? '' : 's'}` : undefined}
        >
          {loading && !notices ? (
            <Loading label="Loading notices" />
          ) : notice ? (
            <Notice tone="neg">{notice}</Notice>
          ) : notices.length === 0 ? (
            <Empty title="No notices yet" hint="Write one on the left and it shows up here." />
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {notices.map((item) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[13px] font-bold text-fg">{item.title}</p>
                        <Badge tone={item.published ? 'pos' : 'neutral'}>
                          {item.published ? 'live' : 'draft'}
                        </Badge>
                        <Badge tone="neutral">{item.kind}</Badge>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted">{item.body}</p>
                      <p className="mt-1 text-[10px] text-muted">{fmtDateTime(item.created_at)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => edit(item)}
                        aria-label={`Edit ${item.title}`}
                        className="grid size-7 place-items-center rounded-lg border border-line text-muted transition hover:border-accent/60 hover:text-accent-2"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(item)}
                        aria-label={`Delete ${item.title}`}
                        className="grid size-7 place-items-center rounded-lg border border-line text-muted transition hover:border-neg/60 hover:text-neg"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-[10px] text-muted">
            <Megaphone className="size-3" />
            Drafts stay hidden from members until published.
          </p>
        </Panel>
      </div>
    </>
  );
}
