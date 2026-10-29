'use client';

import { useState, useSyncExternalStore } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { Logo } from '@/components/layout/Logo';
import { brand, rules } from '@/lib/brand';

/** Static origin read: no subscription needed, but SSR-safe via a fallback snapshot. */
const subscribeToOrigin = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => '';

/**
 * Invite panel: code + deep link (`/register?ref=CODE`) with copy & share.
 * The link pre-fills the invite code on the referee's registration form.
 */
export function ReferralCard({ code }: { code: string }) {
  const toast = useToast();
  const origin = useSyncExternalStore(subscribeToOrigin, getOrigin, getServerOrigin);
  const [copied, setCopied] = useState(false);

  const link = `${origin || 'https://kernelminers.app'}/register?ref=${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.push('Invite link copied.', 'ok');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.push(link, 'info');
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: brand.name,
          text: `Join me on ${brand.name} and start earning daily. Use my code ${code}.`,
          url: link,
        });
        return;
      } catch {
        /* user dismissed the sheet */
      }
    }
    copy();
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="relative flex items-center gap-3 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,106,0,0.22),transparent_60%)] px-4 py-3.5">
        <Logo size={36} withWordmark={false} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Your invite code</p>
          <p className="tnum truncate text-lg font-extrabold tracking-[0.18em] text-accent-2">{code || '—'}</p>
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4">
        <p className="break-all rounded-xl border border-line bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted">
          {link}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={copy} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button size="sm" onClick={share} icon={<Share2 className="size-4" />}>
            Share
          </Button>
        </div>
        <p className="text-center text-[11px] text-muted">
          Earn {rules.referral.level1}% of every pack your friends buy — and{' '}
          {rules.referral.level2}% from their friends.
        </p>
      </div>
    </Card>
  );
}
