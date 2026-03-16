import { db } from "@/db/db";
import type { Asset } from "@/types";

const CG = "https://api.coingecko.com/api/v3";
const CURRENCY_API = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoinSearchResult {
  id: string;
  symbol: string;
  name: string;
  thumb: string;
}

export interface SyncResult {
  synced: string[];
  failed: string[];
}

export const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── CoinGecko coin search ────────────────────────────────────────────────────

export async function searchCoins(query: string): Promise<CoinSearchResult[]> {
  if (!query.trim()) return [];
  const resp = await fetch(`${CG}/search?query=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error("CoinGecko search gagal");
  const data = await resp.json();
  return (data.coins ?? []).slice(0, 8).map((c: CoinSearchResult) => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    thumb: c.thumb,
  }));
}

// ─── USD → IDR exchange rate ──────────────────────────────────────────────────

let _cachedUsdIdr = 0;
let _cachedAt = 0;

export async function getUsdIdr(): Promise<number> {
  if (_cachedUsdIdr && Date.now() - _cachedAt < 3_600_000) return _cachedUsdIdr;
  try {
    const resp = await fetch(CURRENCY_API, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json();
    const rate: number = data?.usd?.idr;
    if (rate) {
      _cachedUsdIdr = rate;
      _cachedAt = Date.now();
      return rate;
    }
  } catch { /* fall through */ }
  return 16200; // approximate fallback
}

// ─── Sync crypto prices (CoinGecko) ──────────────────────────────────────────

async function syncCrypto(assets: Asset[]): Promise<SyncResult> {
  const cryptos = assets.filter((a) => a.type === "crypto" && a.coinGeckoId);
  if (!cryptos.length) return { synced: [], failed: [] };

  const ids = [...new Set(cryptos.map((a) => a.coinGeckoId!))].join(",");
  const resp = await fetch(
    `${CG}/simple/price?ids=${ids}&vs_currencies=idr&include_24hr_change=true`,
    { signal: AbortSignal.timeout(12000) },
  );
  if (!resp.ok) throw new Error("CoinGecko API error");
  const data: Record<string, { idr?: number; idr_24h_change?: number }> = await resp.json();

  const synced: string[] = [];
  const failed: string[] = [];
  const now = new Date().toISOString();

  for (const asset of cryptos) {
    const row = data[asset.coinGeckoId!];
    if (row?.idr) {
      await db.assetPrices.put({
        symbol: asset.symbol,
        priceIdr: row.idr,
        changePercent24h: row.idr_24h_change ?? 0,
        lastSynced: now,
      });
      synced.push(asset.symbol);
    } else {
      failed.push(asset.symbol);
    }
  }
  return { synced, failed };
}

// ─── Sync stock price (Yahoo Finance) ────────────────────────────────────────
// Note: Yahoo Finance may block browser requests (CORS). If it fails,
// the user can enter a manual price override in the asset settings.

async function syncStock(asset: Asset): Promise<boolean> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.symbol)}?range=1d&interval=1d`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) return false;

  const data = await resp.json();
  const result = data?.chart?.result?.[0];
  const price: number | undefined = result?.meta?.regularMarketPrice;
  const currency: string | undefined = result?.meta?.currency;
  const changePct: number = result?.meta?.regularMarketChangePercent ?? 0;

  if (!price) return false;

  let priceIdr = price;
  if (currency && currency !== "IDR") {
    priceIdr = price * (await getUsdIdr());
  }

  await db.assetPrices.put({
    symbol: asset.symbol,
    priceIdr,
    changePercent24h: changePct,
    lastSynced: new Date().toISOString(),
  });
  return true;
}

// ─── Main sync entry point ────────────────────────────────────────────────────

export async function syncAllPrices(assets: Asset[]): Promise<SyncResult> {
  const synced: string[] = [];
  const failed: string[] = [];

  // Crypto via CoinGecko (bulk, reliable)
  try {
    const res = await syncCrypto(assets);
    synced.push(...res.synced);
    failed.push(...res.failed);
  } catch {
    for (const a of assets.filter((x) => x.type === "crypto")) failed.push(a.symbol);
  }

  // Stocks via Yahoo Finance (sequential; may fail on CORS)
  for (const asset of assets.filter((a) => a.type === "stock")) {
    try {
      const ok = await syncStock(asset);
      if (ok) synced.push(asset.symbol);
      else failed.push(asset.symbol);
    } catch {
      failed.push(asset.symbol);
    }
  }

  return { synced, failed };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns age of stored price in ms, or null if never synced. */
export async function getPriceAge(symbol: string): Promise<number | null> {
  const row = await db.assetPrices.get(symbol);
  if (!row) return null;
  return Date.now() - new Date(row.lastSynced).getTime();
}

/** True if at least one asset has no price or a stale price. */
export async function anyPriceStale(assets: Asset[]): Promise<boolean> {
  for (const a of assets) {
    const age = await getPriceAge(a.symbol);
    if (age === null || age > STALE_MS) return true;
  }
  return false;
}
