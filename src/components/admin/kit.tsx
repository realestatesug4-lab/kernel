'use client';

import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Search } from 'lucide-react';
import { Spinner } from '@/components/ui';

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClassName = 'p-4',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow)] ${className}`}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-bold text-fg">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

export function Stat({
  label,
  value,
  hint,
  delta,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Percentage change: positive renders green, negative red. */
  delta?: number | null;
  icon?: ReactNode;
  tone?: 'default' | 'accent' | 'warn' | 'neg';
}) {
  const ring: Record<string, string> = {
    default: 'text-fg',
    accent: 'text-accent-2',
    warn: 'text-warn',
    neg: 'text-neg',
  };
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-[var(--shadow)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <p className={`tnum mt-2 truncate text-[22px] font-extrabold leading-tight ${ring[tone]}`}>
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {typeof delta === 'number' && Number.isFinite(delta) && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${
              delta >= 0 ? 'text-pos' : 'text-neg'
            }`}
          >
            {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        {hint && <span className="truncate text-[11px] text-muted">{hint}</span>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Charts (hand-rolled: no chart dependency in this project)                   */
/* -------------------------------------------------------------------------- */

export type SeriesPoint = { day: string; signups: number; deposits: number; rewards: number; payouts: number; invested: number };

function niceMax(values: number[]): number {
  const max = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

function dayLabel(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Grouped daily bars; two measures read against one shared scale. */
export function TrendBars({
  data,
  primary,
  secondary,
  primaryLabel,
  secondaryLabel,
  format = (n: number) => String(n),
}: {
  data: SeriesPoint[];
  primary: keyof SeriesPoint;
  secondary?: keyof SeriesPoint;
  primaryLabel: string;
  secondaryLabel?: string;
  format?: (n: number) => string;
}) {
  const values = data.flatMap((d) => [
    Number(d[primary]) || 0,
    secondary ? Number(d[secondary]) || 0 : 0,
  ]);
  const max = niceMax(values);

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-accent" />
          {primaryLabel}
        </span>
        {secondary && secondaryLabel && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-accent-2/60" />
            {secondaryLabel}
          </span>
        )}
        <span className="ml-auto tnum">peak {format(max)}</span>
      </div>

      <div className="flex h-40 items-end gap-1">
        {data.map((point) => {
          const a = Number(point[primary]) || 0;
          const b = secondary ? Number(point[secondary]) || 0 : 0;
          return (
            <div key={point.day} className="group flex h-full flex-1 flex-col justify-end gap-1">
              <div className="relative flex h-full items-end justify-center gap-[2px]">
                <div
                  className="w-1/2 rounded-t-[3px] bg-accent transition-all group-hover:brightness-125"
                  style={{ height: `${Math.max(1.5, (a / max) * 100)}%` }}
                  title={`${dayLabel(point.day)} · ${primaryLabel} ${format(a)}`}
                />
                {secondary && (
                  <div
                    className="w-1/2 rounded-t-[3px] bg-accent-2/60 transition-all group-hover:brightness-125"
                    style={{ height: `${Math.max(0, (b / max) * 100)}%` }}
                    title={`${dayLabel(point.day)} · ${secondaryLabel} ${format(b)}`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-muted">
        <span>{dayLabel(data[0]?.day ?? '')}</span>
        <span>{dayLabel(data[data.length - 1]?.day ?? '')}</span>
      </div>
    </div>
  );
}

/** Horizontal share bars, used for the ledger mix and pack revenue. */
export function MixBars({
  rows,
  format = (n: number) => String(n),
}: {
  rows: { label: string; value: number; meta?: string }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-[11px]">
            <span className="truncate font-medium text-fg">{row.label}</span>
            <span className="tnum shrink-0 text-muted">{format(row.value)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
              style={{ width: `${Math.max(2, (Math.abs(row.value) / max) * 100)}%` }}
            />
          </div>
          {row.meta && <p className="mt-0.5 text-[10px] text-muted">{row.meta}</p>}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-surface-2/60 p-1">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={`h-8 shrink-0 whitespace-nowrap rounded-xl px-3 text-[11px] font-semibold transition ${
            value === option.key ? 'bg-surface text-fg shadow-[var(--shadow)]' : 'text-muted hover:text-fg'
          }`}
        >
          {option.label}
          {typeof option.count === 'number' && (
            <span className="tnum ml-1.5 text-muted">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = 'Search',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-3 text-[13px] outline-none transition placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-[var(--ring)]"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tables                                                                     */
/* -------------------------------------------------------------------------- */

export function TableScroll({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[680px] border-collapse text-left text-[12px]">{children}</table>
    </div>
  );
}

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-line px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`border-b border-line/60 px-2 py-2.5 align-middle ${className}`}>{children}</td>;
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="grid min-h-[28vh] place-items-center gap-2 text-center">
      <div>
        <Spinner className="size-6" />
        <p className="mt-2 text-[11px] text-muted">{label}…</p>
      </div>
    </div>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'neg' | 'pos';
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    info: 'border-line bg-surface-2/60 text-muted',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    neg: 'border-neg/30 bg-neg/10 text-neg',
    pos: 'border-pos/30 bg-pos/10 text-pos',
  };
  return (
    <p className={`rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${tones[tone]}`}>{children}</p>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-2/40 px-4 py-10 text-center">
      <p className="text-[13px] font-medium text-fg">{title}</p>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function Pager({
  total,
  limit,
  offset,
  onChange,
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (next: number) => void;
}) {
  if (total <= limit) return null;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-1 pt-3 text-[11px] text-muted">
      <span className="tnum">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
          className="h-7 rounded-lg border border-line px-2.5 font-semibold text-fg transition hover:border-accent/60 disabled:opacity-40"
        >
          Newer
        </button>
        <button
          type="button"
          disabled={to >= total}
          onClick={() => onChange(offset + limit)}
          className="h-7 rounded-lg border border-line px-2.5 font-semibold text-fg transition hover:border-accent/60 disabled:opacity-40"
        >
          Older
        </button>
      </div>
    </div>
  );
}

export function statusTone(status: string): 'neutral' | 'pos' | 'warn' | 'neg' | 'accent' {
  switch (status) {
    case 'confirmed':
    case 'paid':
    case 'completed':
    case 'active':
      return 'pos';
    case 'pending':
      return 'warn';
    case 'approved':
      return 'accent';
    case 'failed':
    case 'rejected':
      return 'neg';
    default:
      return 'neutral';
  }
}
