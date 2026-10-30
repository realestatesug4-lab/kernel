'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Check, ChevronRight, CircleHelp, Coins, Megaphone,
  ShieldCheck, Sparkles, Users,
} from 'lucide-react';
import { InnerPage } from '@/components/layout/InnerPage';
import { Logo } from '@/components/layout/Logo';
import { SupportLinks } from '@/components/SupportLinks';
import { Badge, Card } from '@/components/ui';
import { brand, copy, milestones, products, rules } from '@/lib/brand';
import { fmtUGX } from '@/lib/format';

export default function AboutUsPage() {
  return (
    <InnerPage title="About Us">
      <div className="space-y-5">
        {/* Identity */}
        <section className="flex flex-col items-center gap-2 pt-2 text-center">
          <Logo size={76} withWordmark={false} />
          <h1 className="text-xl font-extrabold tracking-tight">
            {brand.name} <span className="brand-text">Mining</span>
          </h1>
          <p className="max-w-[320px] text-xs text-muted">{brand.tagline}</p>
          <div className="mt-1 flex items-center gap-2">
            <Badge tone="accent">{brand.version}</Badge>
            <Badge tone="neutral">{rules.currency.code} · {rules.currency.name}</Badge>
          </div>
        </section>

        {/* What is KernelMiners */}
        <Section title="What is KernelMiners?">
          <p className="text-sm leading-relaxed text-muted">{brand.description}</p>
          <ul className="mt-3 space-y-2">
            {copy.about.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2 text-xs text-fg">
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-pos/15 text-pos">
                  <Check className="size-3" />
                </span>
                <span className="leading-relaxed">{h}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* How it works */}
        <Section title="How it works" icon={<Sparkles className="size-4" />}>
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
        </Section>

        {/* Mining packs */}
        <Section title="Mining packs" icon={<Coins className="size-4" />}>
          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-[1.2fr_1fr_1fr_0.7fr_1fr] gap-2 border-b border-line bg-surface-2/60 px-3 py-2 text-[10px] uppercase tracking-wider text-muted">
              <span>Pack</span>
              <span className="text-right">Price</span>
              <span className="text-right">Daily</span>
              <span className="text-right">Days</span>
              <span className="text-right">Total</span>
            </div>
            {products.map((p) => (
              <div key={p.no} className="grid grid-cols-[1.2fr_1fr_1fr_0.7fr_1fr] items-center gap-2 border-b border-line px-3 py-2.5 text-xs last:border-0">
                <span className="truncate font-bold">{p.name}</span>
                <span className="tnum text-right">{fmtUGX(p.price)}</span>
                <span className="tnum text-right text-accent-2">{fmtUGX(p.daily)}</span>
                <span className="tnum text-right text-muted">{p.duration}</span>
                <span className="tnum text-right font-semibold">{fmtUGX(p.total)}</span>
              </div>
            ))}
          </Card>
          <p className="mt-1.5 px-1 text-[10px] text-muted">
            Earnings release at {rules.payout.label} ({rules.payout.timezone}) · all amounts in {rules.currency.code}.
          </p>
        </Section>

        {/* Programme rules */}
        <Section title="Programme rules" icon={<ShieldCheck className="size-4" />}>
          <div className="grid grid-cols-2 gap-2">
            {copy.about.facts.map((f) => (
              <div
                key={f}
                className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5 text-[11px] leading-relaxed text-muted"
              >
                {f}
              </div>
            ))}
          </div>
        </Section>

        {/* Referral & invite rewards */}
        <Section title="Referral & invite rewards" icon={<Users className="size-4" />}>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2.5">
              <p className="text-[11px] text-muted">Level 1 commission</p>
              <p className="tnum text-lg font-extrabold text-accent-2">{rules.referral.level1}%</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5">
              <p className="text-[11px] text-muted">Level 2 commission</p>
              <p className="tnum text-lg font-extrabold">{rules.referral.level2}%</p>
            </div>
          </div>
          <p className="mb-2 px-1 text-[11px] leading-relaxed text-muted">
            Commission is credited instantly when a referral buys a pack. Task-center milestones unlock
            once that many level-1 friends have <span className="font-semibold text-fg">invested</span> in a pack.
          </p>
          <Card className="divide-y divide-[var(--line)] p-0">
            {milestones.map((m) => (
              <div key={m.invite} className="flex items-center justify-between px-3 py-2.5 text-xs">
                <span className="text-muted">
                  Get <span className="font-bold text-fg">{m.invite}</span> friends to invest
                </span>
                <span className="tnum flex items-center justify-end gap-1.5">
                  <Badge tone="neutral">Unlock {fmtUGX(m.unlock)}</Badge>
                  <Badge tone="accent">+{fmtUGX(m.extra)}</Badge>
                </span>
              </div>
            ))}
          </Card>
        </Section>

        {/* Help & support */}
        <Section title="Help & support">
          <Card className="divide-y divide-[var(--line)] p-0">
            <Row href="/notice" icon={<Megaphone className="size-4" />} label="Notices & announcements" />
            <Row href="/help" icon={<CircleHelp className="size-4" />} label="Help center" />
          </Card>
          {/* Telegram chat + group + email, set by an admin; hidden until configured. */}
          <SupportLinks className="mt-2" />
        </Section>

        <p className="px-2 pb-2 text-center text-[11px] leading-relaxed text-muted">{brand.legal.riskNotice}</p>
      </div>
    </InnerPage>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
        {icon && <span className="text-accent-2">{icon}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-2">{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="size-4 text-muted" />
    </Link>
  );
}
