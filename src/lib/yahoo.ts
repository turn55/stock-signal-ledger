/**
 * Stock price & profile data — single-provider approach (Finnhub free tier):
 *   - fetchDailyBars   → Finnhub /stock/candle  (60 req/min free; historical OHLCV)
 *   - fetchLatestPrice → Finnhub /quote          (60 req/min free; real-time quote)
 *   - fetchStockProfile→ Finnhub /profile2 + /metric (60 req/min free)
 *
 * Finnhub free tier limit: 60 API calls/minute. We throttle to 1 call/sec
 * to stay well under it. 74 stocks × 1s = ~74 seconds for a full K-line sync.
 */

const FINNHUB_BASE = "https://finnhub.io/api/v1";

function getFinnhubToken(): string {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error("FINNHUB_API_KEY not set");
  return token;
}

// Throttle: 1 call/sec to stay under Finnhub's 60/min free limit
let lastFinnhubCallAt = 0;

async function throttleFinnhub(): Promise<void> {
  const wait = 1100 - (Date.now() - lastFinnhubCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFinnhubCallAt = Date.now();
}

export interface DailyBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch daily OHLCV bars from Finnhub /stock/candle.
 * Free tier: up to 1 year of daily data, 60 calls/min.
 * Falls back gracefully if symbol not found.
 */
export async function fetchDailyBars(
  ticker: string,
  from: Date,
  to: Date
): Promise<DailyBar[]> {
  const token = getFinnhubToken();
  const fromSec = Math.floor(from.getTime() / 1000);
  const toSec = Math.floor(to.getTime() / 1000);

  const url =
    `${FINNHUB_BASE}/stock/candle?symbol=${ticker}&resolution=D` +
    `&from=${fromSec}&to=${toSec}&token=${token}`;

  await throttleFinnhub();
  const res = await fetch(url);

  if (res.status === 429) {
    console.warn(`Finnhub rate limit hit for ${ticker}, skipping`);
    return [];
  }

  if (!res.ok) {
    // 404 / no data = ticker not available on free tier → skip gracefully
    return [];
  }

  const data = (await res.json()) as {
    s?: string;  // status: "ok" | "no_data"
    t?: number[]; // timestamps
    o?: number[]; // open
    h?: number[]; // high
    l?: number[]; // low
    c?: number[]; // close
    v?: number[]; // volume
  };

  if (data.s !== "ok" || !data.t) return [];

  const bars: DailyBar[] = [];
  for (let i = 0; i < data.t.length; i++) {
    bars.push({
      date: new Date(data.t[i] * 1000),
      open: data.o?.[i] ?? 0,
      high: data.h?.[i] ?? 0,
      low: data.l?.[i] ?? 0,
      close: data.c?.[i] ?? 0,
      volume: data.v?.[i] ?? 0,
    });
  }

  return bars;
}

export async function fetchLatestPrice(ticker: string): Promise<number | null> {
  try {
    const token = getFinnhubToken();
    await throttleFinnhub();
    const res = await fetch(`${FINNHUB_BASE}/quote?symbol=${ticker}&token=${token}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { c: number };
    return data.c || null;
  } catch {
    return null;
  }
}

export interface StockProfile {
  shortName: string;
  longName: string;
  sector: string;
  industry: string;
  marketCap: number | null;
  pe: number | null;
  forwardPe: number | null;
  eps: number | null;
  dividendYield: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  avgVolume: number | null;
  description: string;
}

export async function fetchStockProfile(ticker: string): Promise<StockProfile | null> {
  try {
    const token = getFinnhubToken();

    const [profileRes, metricRes] = await Promise.all([
      fetch(`${FINNHUB_BASE}/stock/profile2?symbol=${ticker}&token=${token}`),
      fetch(`${FINNHUB_BASE}/stock/metric?symbol=${ticker}&metric=all&token=${token}`),
    ]);

    if (!profileRes.ok || !metricRes.ok) return null;

    const profile = (await profileRes.json()) as Record<string, unknown>;
    const metricData = (await metricRes.json()) as { metric: Record<string, unknown> };
    const metric = metricData.metric ?? {};

    if (!profile.name) return null;

    const marketCapMillions = profile.marketCapitalization as number | undefined;

    return {
      shortName: (profile.name as string) ?? "",
      longName: (profile.name as string) ?? "",
      sector: (profile.finnhubIndustry as string) ?? "",
      industry: (profile.finnhubIndustry as string) ?? "",
      marketCap: marketCapMillions != null ? marketCapMillions * 1_000_000 : null,
      pe: (metric.peTTM as number) ?? null,
      forwardPe: null,
      eps: (metric.epsBasicExclExtraAnnual as number) ?? null,
      dividendYield: (metric.dividendYieldIndicatedAnnual as number) ?? null,
      fiftyTwoWeekHigh: (metric["52WeekHigh"] as number) ?? null,
      fiftyTwoWeekLow: (metric["52WeekLow"] as number) ?? null,
      avgVolume: (metric.averageVolume10D as number) ?? null,
      description: "",
    };
  } catch {
    return null;
  }
}
