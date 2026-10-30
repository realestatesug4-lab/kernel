import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PublicShell } from '@/components/layout/PublicShell';
import { Logo } from '@/components/layout/Logo';
import { Badge, Button, Card } from '@/components/ui';
import { brand, copy, milestones, products, rules } from '@/lib/brand';
import { fmtUGX } from '@/lib/format';

export const metadata: Metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <PublicShell>
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <Logo size={80} withWordmark={true} />
          <h1 className="text-xl font-extrabold tracking-tight">
            About <span className="brand-text">{brand.name}</span>
          </h1>
          <p className="text-xs text-muted">{brand.tagline}</p>
        </div>

        <Card className="p-4">
          <p className="text-sm leading-relaxed text-muted">
            {brand.name} is a daily-earning mining programme. You buy a mining pack once and receive a
            fixed payout at midnight East Africa Time, every night, for the length of that pack. Returns,
            progress and referrals are tracked live in your account.
          </p>
          <ul className="mt-3 space-y-1.5 text-xs text-muted">
            {copy.about.highlights.map((h) => (
              <li key={h}>· {h}</li>
            ))}
          </ul>
        </Card>

        <section>
          <h2 className="mb-2 text-sm font-bold">How does Kernel work?</h2>
          <Card className="divide-y divide-[var(--line)] p-0">
            {copy.about.how.map((step, i) => (
              <div key={step.title} className="flex items-start gap-3 px-4 py-3">
                <span className="tnum grid size-7 shrink-0 place-items-center rounded-full brand-gradient text-xs font-extrabold text-black">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{step.body}</p>
                </div>
              </div>
            ))}
          </Card>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold">Mining packs</h2>
          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-4 gap-2 border-b border-line bg-surface-2/60 px-3 py-2 text-[10px] uppercase tracking-wider text-muted">
              <span>Price</span>
              <span>Daily</span>
              <span>Days</span>
              <span className="text-right">Total</span>
            </div>
            {products.map((p) => (
              <div key={p.no} className="grid grid-cols-4 gap-2 border-b border-line px-3 py-2.5 text-xs last:border-0">
                <span className="tnum font-semibold">{fmtUGX(p.price)}</span>
                <span className="tnum text-accent-2">{fmtUGX(p.daily)}</span>
                <span className="tnum text-muted">{p.duration}</span>
                <span className="tnum text-right font-semibold">{fmtUGX(p.total)}</span>
              </div>
            ))}
          </Card>
          <p className="mt-1.5 px-1 text-[10px] text-muted">All amounts in {rules.currency.code}.</p>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold">Programme rules</h2>
          <div className="grid grid-cols-2 gap-2">
            {copy.about.facts.map((f) => (
              <div key={f} className="rounded-xl border border-line bg-surface px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                {f}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold">Invite rewards</h2>
          <Card className="divide-y divide-[var(--line)] p-0">
            {milestones.map((m) => (
              <div key={m.invite} className="flex items-center justify-between px-3 py-2.5 text-xs">
                <span>
                  Invite <span className="font-bold">{m.invite}</span> friends
                </span>
                <span className="tnum text-right text-[11px]">
                  <Badge tone="neutral">Unlock {fmtUGX(m.unlock)}</Badge>{' '}
                  <Badge tone="accent">+{fmtUGX(m.extra)}</Badge>
                </span>
              </div>
            ))}
          </Card>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Link href="/register">
            <Button block icon={<ArrowRight className="size-4" />}>Create account</Button>
          </Link>
          <Link href="/login">
            <Button block variant="secondary">Sign in</Button>
          </Link>
        </div>
      </div> 
    </PublicShell>
  );
}
