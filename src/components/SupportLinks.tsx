'use client';

import type { ComponentType } from 'react';
import { ArrowUpRight, LifeBuoy, Mail, MessageCircle, Send } from 'lucide-react';
import { Card } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { api } from '@/lib/api';

type Channel = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  primary?: boolean;
};

/**
 * Telegram support + chat, as compact icon buttons for a top bar's right slot.
 *
 * Reads the same admin-managed destinations as `SupportLinks`, so nothing shows
 * until an operator has set the links. Renders only the channels that exist.
 */
export function SupportHeaderIcons() {
  const { data } = useAsync(() => api.support(), []);
  const support = data?.ok ? data.data : null;
  if (!support) return null;

  const icons: { href: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [];
  if (support.chat_url) {
    icons.push({ href: support.chat_url, label: support.chat_label || 'Chat with support', Icon: MessageCircle });
  }
  if (support.group_url) {
    icons.push({ href: support.group_url, label: support.group_label || 'Telegram group', Icon: Send });
  }
  if (icons.length === 0) return null;

  return (
    <>
      {icons.map(({ href, label, Icon }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className="grid size-9 place-items-center rounded-full text-accent-2 transition hover:bg-surface-2"
        >
          <Icon className="size-5" />
        </a>
      ))}
    </>
  );
}

/**
 * Telegram support + chat, as prominent full-width buttons for a page body.
 *
 * Sits under the home quick actions so a member can join the group or open the
 * support chat in one tap. Reads the same admin-managed destinations and renders
 * nothing until at least one channel is set.
 */
export function SupportButtons({ className = '' }: { className?: string }) {
  const { data } = useAsync(() => api.support(), []);
  const support = data?.ok ? data.data : null;
  if (!support) return null;

  const actions: { href: string; label: string; short: string; Icon: ComponentType<{ className?: string }> }[] = [];
  if (support.group_url) {
    actions.push({
      href: support.group_url,
      label: support.group_label || 'Join the Telegram group',
      short: 'Join group',
      Icon: Send,
    });
  }
  if (support.chat_url) {
    actions.push({
      href: support.chat_url,
      label: support.chat_label || 'Chat with support',
      short: 'Support chat',
      Icon: MessageCircle,
    });
  }
  if (actions.length === 0) return null;

  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      {actions.map(({ href, label, short, Icon }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="flex items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2.5 text-xs font-bold text-accent-2 transition hover:border-accent/60 active:scale-[.98]"
        >
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{short}</span>
        </a>
      ))}
    </div>
  );
}

/**
 * The Telegram destinations an admin sets in `/admin/notices`.
 *
 * Renders nothing at all while loading or when every channel is switched off,
 * so pages can drop it in without guarding the layout.
 */
export function SupportLinks({ className = '' }: { className?: string }) {
  const { data } = useAsync(() => api.support(), []);
  const support = data?.ok ? data.data : null;

  if (!support) return null;

  const channels: Channel[] = [];
  if (support.chat_url) {
    channels.push({
      href: support.chat_url,
      label: support.chat_label || 'Chat with support',
      icon: MessageCircle,
      primary: true,
    });
  }
  if (support.group_url) {
    channels.push({
      href: support.group_url,
      label: support.group_label || 'Join the Telegram group',
      icon: Send,
    });
  }

  if (channels.length === 0 && !support.email) return null;

  return (
    <Card className={`p-3.5 ${className}`}>
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-2">
          <LifeBuoy className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Talk to us</p>
          <p className="text-[11px] text-muted">Support and the community, on Telegram.</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        {channels.map((channel) => (
          <a
            key={channel.href}
            href={channel.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${
              channel.primary
                ? 'brand-gradient text-black hover:brightness-105'
                : 'border border-line bg-surface-2 text-fg hover:border-accent/60'
            }`}
          >
            <channel.icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{channel.label}</span>
            <ArrowUpRight className="size-3.5 shrink-0 opacity-70" />
          </a>
        ))}

        {support.email && (
          <a
            href={`mailto:${support.email}`}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[11px] font-medium text-muted transition hover:text-fg"
          >
            <Mail className="size-3.5 shrink-0" />
            <span className="truncate">{support.email}</span>
          </a>
        )}
      </div>
    </Card>
  );
}
