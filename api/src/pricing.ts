// Live SOL/USD price with a short in-memory cache so we don't hammer the
// upstream API on every balance poll. Returns null if the upstream is down
// and we have no stale value to fall back on.

type PriceSnapshot = {
  price: number;
  fetchedAt: number;
};

let cache: PriceSnapshot | null = null;
const TTL_MS = 60_000;
const TIMEOUT_MS = 3_000;
const BINANCE_URL = 'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT';

export async function getSolUsdPrice(): Promise<number | null> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.price;
  }
  try {
    const response = await fetch(BINANCE_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = (await response.json()) as { price?: string };
    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid price payload');
    }
    cache = { price, fetchedAt: now };
    return price;
  } catch {
    // Prefer a stale price over null — the UI handles either, but a value is
    // more useful than a blank.
    return cache?.price ?? null;
  }
}
