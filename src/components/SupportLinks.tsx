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
