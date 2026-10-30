import { NextResponse } from 'next/server';

/**
 * Live spot prices for the tape on the home screen.
 *
 * One shared, short-lived snapshot: CoinGecko covers all ten assets in a single
 * request, Binance is the fallback (it has no USDT/USDT market), and a small
 * static set keeps the tape rendering when the server has no outbound network.
 * The payload is labelled so the UI can be honest about which one it got.
 */

export const dynamic = 'force-dynamic';

type Source = 'coingecko' | 'binance' | 'offline';

type Coin = { symbol: string; name: string; geckoId: string; binancePair: string | null };

const COINS: Coin[] = [
  { symbol: 'BNB', name: 'BNB', geckoId: 'binancecoin', binancePair: 'BNBUSDT' },
  { symbol: 'BTC', name: 'Bitcoin', geckoId: 'bitcoin', binancePair: 'BTCUSDT' },
  { symbol: 'ETH', name: 'Ethereum', geckoId: 'ethereum', binancePair: 'ETHUSDT' },
  { symbol: 'SOL', name: 'Solana', geckoId: 'solana', binancePair: 'SOLUSDT' },
  { symbol: 'XRP', name: 'XRP', geckoId: 'ripple', binancePair: 'XRPUSDT' },
  { symbol: 'NEAR', name: 'NEAR', geckoId: 'near', binancePair: 'NEARUSDT' },
  { symbol: 'USDT', name: 'Tether', geckoId: 'tether', binancePair: null },
  { symbol: 'TRX', name: 'TRON', geckoId: 'tron', binancePair: 'TRXUSDT' },
  { symbol: 'SUI', name: 'Sui', geckoId: 'sui', binancePair: 'SUIUSDT' },
  { symbol: 'WLD', name: 'Worldcoin', geckoId: 'worldcoin-wld', binancePair: 'WLDUSDT' },
];

/** Last-resort values so a blocked network never blanks the tape. */
const SNAPSHOT: Record<string, { price: number; change24h: number }> = {
  BNB: { price: 612, change24h: 0 },
  BTC: { price: 96_400, change24h: 0 },
  ETH: { price: 3_410, change24h: 0 },
  SOL: { price: 188, change24h: 0 },
  XRP: { price: 2.31, change24h: 0 },
  NEAR: { price: 5.42, change24h: 0 },
  USDT: { price: 1, change24h: 0 },
  TRX: { price: 0.258, change24h: 0 },
  SUI: { price: 3.44, change24h: 0 },
  WLD: { price: 2.11, change24h: 0 },
};

// Route handlers may only export HTTP methods and route config, so these stay local.
type MarketTick = {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  /** Hourly closes for the last 24h. Empty when the provider has no series. */
  spark: number[];
};

type MarketsPayload = { updated_at: string; source: Source; coins: MarketTick[] };

const TTL_MS = 15_000;
const OFFLINE_TTL_MS = 20_000;

let cache: { at: number; payload: MarketsPayload } | null = null;

async function readJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4_500),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type GeckoRow = {
  id: string;
  current_price: number | null;
  price_change_percentage_24h: number | null;
  total_volume: number | null;
  sparkline_in_7d?: { price?: number[] } | null;
};

async function fromGecko(): Promise<MarketTick[] | null> {
  const ids = COINS.map((coin) => coin.geckoId).join(',');
  const url =
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd' +
    `&ids=${ids}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`;

  const rows = await readJson<GeckoRow[]>(url);
  if (!rows?.length) return null;

  const byId = new Map(rows.map((row) => [row.id, row]));

  const ticks = COINS.flatMap((coin): MarketTick[] => {
    const row = byId.get(coin.geckoId);
    if (!row || typeof row.current_price !== 'number' || row.current_price <= 0) return [];
    return [
      {
        symbol: coin.symbol,
        name: coin.name,
        price: row.current_price,
        change24h: row.price_change_percentage_24h ?? 0,
        volume24h: row.total_volume ?? 0,
        // 168 hourly points in; the last day is enough for a card-sized spark.
        spark: (row.sparkline_in_7d?.price ?? []).slice(-24).filter((p) => Number.isFinite(p)),
      },
    ];
  });

  return ticks.length >= COINS.length - 2 ? ticks : null;
}

type BinanceRow = { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string };

async function fromBinance(): Promise<MarketTick[] | null> {
  const pairs = COINS.flatMap((coin) => (coin.binancePair ? [coin.binancePair] : []));
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`;

  const rows = await readJson<BinanceRow[]>(url);
  if (!rows?.length) return null;

  const byPair = new Map(rows.map((row) => [row.symbol, row]));

  const ticks = COINS.flatMap((coin): MarketTick[] => {
    if (!coin.binancePair) {
      // Tether is a 1:1 dollar token and Binance quotes no USDT/USDT market.
      return coin.symbol === 'USDT'
        ? [{ symbol: 'USDT', name: coin.name, price: 1, change24h: 0, volume24h: 0, spark: [] }]
        : [];
    }
    const row = byPair.get(coin.binancePair);
    const price = Number(row?.lastPrice);
    if (!row || !Number.isFinite(price) || price <= 0) return [];
    return [
      {
        symbol: coin.symbol,
        name: coin.name,
        price,
        change24h: Number(row.priceChangePercent) || 0,
        volume24h: Number(row.quoteVolume) || 0,
        spark: [],
      },
    ];
  });

  return ticks.length >= COINS.length - 2 ? ticks : null;
}

/**
 * Binance has no sparkline in the ticker payload, so ask for 24 hourly closes
 * per symbol. A failed call just leaves that card without a line.
 */
async function withSparks(ticks: MarketTick[]): Promise<MarketTick[]> {
  const pairs = new Map(COINS.map((coin) => [coin.symbol, coin.binancePair]));

  await Promise.all(
    ticks.map(async (tick) => {
      const pair = pairs.get(tick.symbol);
      if (!pair) return;
      const rows = await readJson<Kline[]>(
        `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1h&limit=24`,
      );
      if (!rows?.length) return;
      tick.spark = rows
        .map((row) => Number(row[4])) // index 4 = close
        .filter((price) => Number.isFinite(price) && price > 0);
    }),
  );

  return ticks;
}

/** [open time, open, high, low, close, ...] */
type Kline = [number, string, string, string, string];

function offline(): MarketTick[] {
  return COINS.map((coin) => {
    const seed = SNAPSHOT[coin.symbol] ?? { price: 1, change24h: 0 };
    return {
      symbol: coin.symbol,
      name: coin.name,
      price: seed.price,
      change24h: seed.change24h,
      volume24h: 0,
      spark: [],
    };
  });
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < (cache.payload.source === 'offline' ? OFFLINE_TTL_MS : TTL_MS)) {
    return NextResponse.json(
      { ok: true, data: cache.payload },
      { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } },
    );
  }

  let coins = await fromGecko();
  let source: Source = 'coingecko';

  if (!coins) {
    const alt = await fromBinance();
    if (alt) {
      coins = await withSparks(alt);
      source = 'binance';
    }
  }

  if (!coins) {
    coins = offline();
    source = 'offline';
  }

  const payload: MarketsPayload = { updated_at: new Date().toISOString(), source, coins };
  cache = { at: now, payload };

  return NextResponse.json(
    { ok: true, data: payload },
    { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } },
  );
}
