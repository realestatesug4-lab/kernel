'use client';

import { useEffect } from 'react';
import { ArrowDownRight, ArrowUpRight, Radio } from 'lucide-react';
import { useAsync } from '@/lib/useAsync';
import { fmtCompact, fmtUsd } from '@/lib/format';

type Tick = {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  spark: number[];
};

type Source = 'coingecko' | 'binance' | 'offline';

type Payload = { updated_at: string; source: Source; coins: Tick[] };

const SOURCE_LABEL: Record<Source, string> = {
  coingecko: 'Live',
  binance: 'Live',
  offline: 'Indicative',
};

async function load(): Promise<Payload | null> {
  try {
    const res = await fetch('/api/markets', { cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: Payload } | null;
    return json?.ok && json.data ? json.data : null;
  } catch {
    return null;
  }
}

/**
 * The sliding crypto tape above the packs.
 *
 * The track holds two identical rows and slides by exactly half its width, so
 * the loop is seamless. Prices come from `/api/markets` (60s server cache) and
 * the tape re-reads on the same beat.
 */
export function MarketsTicker() {
  const { data, reload } = useAsync(load, []);

  useEffect(() => {
    const timer = window.setInterval(reload, 60_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const coins = data?.coins ?? [];
  const live = data?.source !== 'offline';

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold">
          <Radio className={`size-3.5 ${live ? 'text-pos' : 'text-muted'}`} />
          Live markets
        </h2>
        <span className="flex items-center gap-1 text-[10px] font-medium text-muted">
          {data ? (
            <>
              <span className={`size-1.5 rounded-full ${live ? 'bg-pos' : 'bg-warn'}`} />
              {SOURCE_LABEL[data.source]}
            </>
          ) : (
            'Connecting…'
          )}
        </span>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow)]">
        <div className="ticker-mask no-scrollbar overflow-x-auto p-2.5">
          {coins.length === 0 ? (
            <div className="flex gap-2">
              {[0, 1, 2].map((key) => (
                <div key={key} className="h-[74px] w-[128px] shrink-0 animate-pulse rounded-xl bg-surface-2" />
              ))}
            </div>
          ) : (
            <div className="ticker-track flex w-max">
              <TickerRow coins={coins} />
              <TickerRow coins={coins} clone />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * One copy of the list. The trailing `pr-2` doubles as the gap at the seam, so
 * two rows sit exactly 8px apart like every other card.
 */
function TickerRow({ coins, clone = false }: { coins: Tick[]; clone?: boolean }) {
  return (
    <div
      className="flex shrink-0 gap-2 pr-2"
      data-clone={clone ? '' : undefined}
      aria-hidden={clone || undefined}
    >
      {coins.map((coin) => (
        <TickCard key={coin.symbol} coin={coin} />
      ))}
    </div>
  );
}

function TickCard({ coin }: { coin: Tick }) {
  const up = coin.change24h >= 0;

  return (
    <div className="w-[128px] shrink-0 rounded-xl border border-line bg-surface-2/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[11px] font-extrabold tracking-wide text-fg">{coin.symbol}</span>
        <span
          className={`tnum inline-flex shrink-0 items-center rounded-md px-1 py-0.5 text-[9px] font-bold ${
            up ? 'bg-pos/10 text-pos' : 'bg-neg/10 text-neg'
          }`}
        >
          {up ? <ArrowUpRight className="size-2.5" /> : <ArrowDownRight className="size-2.5" />}
          {Math.abs(coin.change24h).toFixed(2)}%
        </span>
      </div>

      <p className="tnum mt-1 truncate text-[13px] font-bold text-fg">
        <span className="mr-0.5 text-[9px] font-semibold text-muted">$</span>
        {fmtUsd(coin.price)}
      </p>

      <div className="mt-1 flex items-end justify-between gap-1">
        <span className="tnum truncate text-[9px] text-muted">{fmtCompact(coin.volume24h)}</span>
        <Spark points={coin.spark} up={up} />
      </div>
    </div>
  );
}

/** 24h sparkline; renders nothing when the provider has no series. */
function Spark({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 44;
      const y = 15 - ((point - min) / span) * 13;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 44 16" className={`h-4 w-11 shrink-0 ${up ? 'text-pos' : 'text-neg'}`} aria-hidden="true">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
