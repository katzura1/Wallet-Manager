import { db } from "@/db/db";
import type { Asset } from "@/types";

const CG = "https://api.coingecko.com/api/v3";
const CURRENCY_API = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
const AV = "https://www.alphavantage.co/query";

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
  noKey?: boolean;
}

export const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Alpha Vantage API keys (stored in localStorage, up to 2 keys) ─────────────
// Two keys = 50 free requests/day. Keys are used round-robin per stock.

export function getAlphaVantageKey(): string {
  return localStorage.getItem("alphavantageKey") ?? "";
}

export function setAlphaVantageKey(key: string): void {
  localStorage.setItem("alphavantageKey", key.trim());
}

export function getAlphaVantageKey2(): string {
  return localStorage.getItem("alphavantageKey2") ?? "";
}

export function setAlphaVantageKey2(key: string): void {
  localStorage.setItem("alphavantageKey2", key.trim());
}

/** Returns all configured (non-empty) Alpha Vantage keys. */
function getAvKeys(): string[] {
  return [getAlphaVantageKey(), getAlphaVantageKey2()].filter(Boolean);
}

/** Wait ms milliseconds — used to respect Alpha Vantage rate limits. */
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const AV_DELAY_MS = 2000; // 2-second gap between stock requests

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

// ─── Sync crypto prices (CoinGecko – free, CORS-friendly) ────────────────────

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

// ─── Sync stock price (Alpha Vantage – free, CORS-friendly) ──────────────────
// Free key: https://www.alphavantage.co/support/#api-key (no credit card needed)
// Free tier: 25 requests / day. IDX stocks: use symbol like BBCA.JKT
// By convention: if symbol ends with .JK or .JKT → price is in IDR, else USD.

async function syncStock(asset: Asset, apiKey: string): Promise<boolean> {
  const url = `${AV}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(asset.symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  let resp: Response;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
  } catch {
    return false;
  }
  if (!resp.ok) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await resp.json();

  // Alpha Vantage returns { "Note": "..." } when rate-limited, or { "Information": "..." } for invalid key
  if (data["Note"] || data["Information"]) return false;

  const quote = data?.["Global Quote"];
  const priceStr: string | undefined = quote?.["05. price"];
  const changePctStr: string | undefined = quote?.["10. change percent"];

  if (!priceStr) return false;

  const price = parseFloat(priceStr);
  const changePct = parseFloat((changePctStr ?? "0%").replace("%", ""));
  if (isNaN(price) || price <= 0) return false;

  // Detect currency by symbol suffix: .JK / .JKT → IDR, otherwise assume USD
  const sym = asset.symbol.toUpperCase();
  const isIdr = sym.endsWith(".JK") || sym.endsWith(".JKT");
  const priceIdr = isIdr ? price : price * (await getUsdIdr());

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

  // Crypto via CoinGecko (bulk, no key required)
  try {
    const res = await syncCrypto(assets);
    synced.push(...res.synced);
    failed.push(...res.failed);
  } catch {
    for (const a of assets.filter((x) => x.type === "crypto")) failed.push(a.symbol);
  }

  // Stocks via Alpha Vantage (round-robin across up to 2 keys, 2s delay each)
  const stocks = assets.filter((a) => a.type === "stock");
  if (stocks.length > 0) {
    const keys = getAvKeys();
    if (keys.length === 0) {
      // No key — skip stocks, caller will show a prompt
      return { synced, failed, noKey: true };
    }
    for (let i = 0; i < stocks.length; i++) {
      if (i > 0) await delay(AV_DELAY_MS); // respect rate limit
      const apiKey = keys[i % keys.length]; // round-robin
      try {
        const ok = await syncStock(stocks[i], apiKey);
        if (ok) synced.push(stocks[i].symbol);
        else failed.push(stocks[i].symbol);
      } catch {
        failed.push(stocks[i].symbol);
      }
    }
  }

  return { synced, failed };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function getPriceAge(symbol: string): Promise<number | null> {
  const row = await db.assetPrices.get(symbol);
  if (!row) return null;
  return Date.now() - new Date(row.lastSynced).getTime();
}

export async function anyPriceStale(assets: Asset[]): Promise<boolean> {
  for (const a of assets) {
    const age = await getPriceAge(a.symbol);
    if (age === null || age > STALE_MS) return true;
  }
  return false;
}
