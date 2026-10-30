'use client';

import { useState, type ReactNode } from 'react';
import {
  ExternalLink, LifeBuoy, Megaphone, MessageCircle, Pencil, RefreshCw, Save, Send, Trash2,
} from 'lucide-react';
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

/** Support channels: the two Telegram destinations plus an optional email. */
type ChannelKey = 'chat_url' | 'chat_label' | 'group_url' | 'group_label' | 'email';

const CHANNEL_KEYS: ChannelKey[] = ['chat_url', 'chat_label', 'group_url', 'group_label', 'email'];

const FIELD =
  'h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-[12px] outline-none placeholder:text-muted focus:border-accent';

export default function AdminNoticesPage() {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  // Edits are kept as an overlay so the fetched values stay the source of truth
  // and no state has to be written from an effect after loading.
  const [channelEdits, setChannelEdits] = useState<Partial<Record<ChannelKey, string>>>({});
  const [busyChannels, setBusyChannels] = useState(false);

  const { data, loading, reload } = useAsync(() => adminApi.notices.list(), []);
  const notices = data?.ok ? data.data : [];
  const notice = data && !data.ok ? data.message : null;

  const support = useAsync(() => adminApi.support.get(), []);
  const saved = support.data?.ok ? support.data.data : null;

  const channel = (key: ChannelKey): string => channelEdits[key] ?? saved?.[key] ?? '';
  const channelsDirty = CHANNEL_KEYS.some(
    (key) => channelEdits[key] !== undefined && channelEdits[key] !== (saved?.[key] ?? ''),
  );

  async function saveChannels() {
    setBusyChannels(true);
    const res = await adminApi.support.save({
      chat_url: channel('chat_url').trim(),
      chat_label: channel('chat_label').trim(),
      group_url: channel('group_url').trim(),
      group_label: channel('group_label').trim(),
      email: channel('email').trim(),
    });
    setBusyChannels(false);

    if (!res.ok) {
      toast.push(res.message, 'err');
      return;
    }
    toast.push('Support channels saved.', 'ok');
    setChannelEdits({});
    support.reload();
  }

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
        title="Support & notices"
        description="Where members reach you, and what they read on the notice board."
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              reload();
              support.reload();
            }}
            icon={<RefreshCw className="size-3.5" />}
          >
            Refresh
          </Button>
        }
      />

      {/* Support channels ---------------------------------------------------- */}
      <Panel
        className="mb-3"
        title={
          <span className="flex items-center gap-1.5">
            <LifeBuoy className="size-3.5 text-accent-2" />
            Support channels
          </span>
        }
        subtitle="These buttons show at the top of Support & notices and in the help centre. Leave a link empty to hide that button."
        action={
          <Button
            size="sm"
            loading={busyChannels}
            disabled={!channelsDirty}
            onClick={saveChannels}
            icon={<Save className="size-3.5" />}
          >
            Save channels
          </Button>
        }
      >
        {support.loading && !saved ? (
          <Loading label="Loading channels" />
        ) : support.data && !support.data.ok ? (
          <Notice tone="neg">{support.data.message}</Notice>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <SupportField
              icon={<MessageCircle className="size-4" />}
              title="Direct chat"
              hint="A private Telegram chat with a support agent."
              openHref={saved?.chat_url ?? null}
              url={
                {
                  value: channel('chat_url'),
                  placeholder: 'https://t.me/kernelminers_support',
                  onChange: (value) => setChannelEdits({ ...channelEdits, chat_url: value }),
                }
              }
              label={
                {
                  value: channel('chat_label'),
                  placeholder: 'Chat with support',
                  onChange: (value) => setChannelEdits({ ...channelEdits, chat_label: value }),
                }
              }
            />

            <SupportField
              icon={<Send className="size-4" />}
              title="Telegram group"
              hint="The community group or channel invite link."
              openHref={saved?.group_url ?? null}
              url={
                {
                  value: channel('group_url'),
                  placeholder: 'https://t.me/+AbCdEf123456',
                  onChange: (value) => setChannelEdits({ ...channelEdits, group_url: value }),
                }
              }
              label={
                {
                  value: channel('group_label'),
                  placeholder: 'Join the Telegram group',
                  onChange: (value) => setChannelEdits({ ...channelEdits, group_label: value }),
                }
              }
            />

            <label className="block lg:col-span-2">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                Support email (optional)
              </span>
              <input
                value={channel('email')}
                onChange={(event) => setChannelEdits({ ...channelEdits, email: event.target.value })}
                placeholder="support@kernelminers.com"
                className={FIELD}
              />
            </label>
          </div>
        )}

        <p className="mt-3 border-t border-line pt-3 text-[10px] leading-relaxed text-muted">
          Links must start with <code className="text-fg">https://</code>. Saving replaces both channels at once;
          {' '}the change is live for members immediately.
          {saved?.updated_at && (
            <span className="ml-1 text-muted">Last saved {fmtDateTime(saved.updated_at)}.</span>
          )}
        </p>
      </Panel>

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

/** One support destination: the link plus the button caption members see. */
function SupportField({
  icon,
  title,
  hint,
  openHref,
  url,
  label,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  openHref: string | null;
  url: { value: string; placeholder: string; onChange: (value: string) => void };
  label: { value: string; placeholder: string; onChange: (value: string) => void };
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="flex items-center gap-2">
        <span className="text-accent-2">{icon}</span>
        <p className="text-[12px] font-bold text-fg">{title}</p>
        {openHref && (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-accent-2"
          >
            <ExternalLink className="size-3" />
            Open
          </a>
        )}
      </div>
      <p className="mt-0.5 text-[10px] text-muted">{hint}</p>

      <div className="mt-2 space-y-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
            Link
          </span>
          <input
            value={url.value}
            onChange={(event) => url.onChange(event.target.value)}
            placeholder={url.placeholder}
            inputMode="url"
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
            Button text
          </span>
          <input
            value={label.value}
            onChange={(event) => label.onChange(event.target.value)}
            placeholder={label.placeholder}
            className={FIELD}
          />
        </label>
      </div>
    </div>
  );
}
