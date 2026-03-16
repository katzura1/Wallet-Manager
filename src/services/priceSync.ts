import { db } from "@/db/db";
import type { Asset } from "@/types";

const CG = "https://api.coingecko.com/api/v3";
const CURRENCY_API = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
const AV = "https://www.alphavantage.co/query";
const TD = "https://api.twelvedata.com"; // Twelve Data — IDX stocks, free 800 req/day

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
  skipped?: string[]; // assets with fresh price (< STALE_MS) — skipped to save API quota
  noKey?: boolean;    // no Alpha Vantage key (US stocks)
}

export const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours — don't re-sync if fresher than this

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

// ─── Twelve Data API key (for IDX stocks) ────────────────────────────────────
// Free: 800 credits/day, 8 req/min. Register at https://twelvedata.com/
// IDX symbol format: BBCA:IDX, TLKM:IDX, GOTO:IDX

export function getTwelveDataKey(): string {
  return localStorage.getItem("twelvedataKey") ?? "";
}

export function setTwelveDataKey(key: string): void {
  localStorage.setItem("twelvedataKey", key.trim());
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

// ─── Sync IDX stock price ───────────────────────────────────────────────────────────
// Primary: Yahoo Finance v8 chart API via allorigins.win proxy (no key needed).
// IDX symbols on Yahoo Finance use .JK suffix (e.g. BBCA.JK). Price is in IDR.
// Optional fallback: Twelve Data (paid plan >= Pro). Set key in Settings.

async function syncStockIdxYahoo(asset: Asset): Promise<boolean> {
  const sym = asset.symbol.toUpperCase().replace(/\.(JK|JKT|IDX)$/, "");
  const yhSym = encodeURIComponent(`${sym}.JK`);
  const target = `https://query2.finance.yahoo.com/v8/finance/chart/${yhSym}?interval=1d&range=1d`;
  const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(target)}`;
  let resp: Response;
  try {
    resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
  } catch {
    return false;
  }
  if (!resp.ok) return false;

  // corsproxy.io returns the Yahoo Finance response directly (no wrapper)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try { data = await resp.json(); } catch { return false; }

  const result = data?.chart?.result?.[0];
  if (!result) return false;

  const price: number | undefined = result.meta?.regularMarketPrice;
  const prevClose: number | undefined = result.meta?.chartPreviousClose;
  const changePct = price && prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

  if (!price || price <= 0) return false;

  // Yahoo Finance IDX prices are already in IDR
  await db.assetPrices.put({
    symbol: asset.symbol,
    priceIdr: price,
    changePercent24h: changePct,
    lastSynced: new Date().toISOString(),
  });
  return true;
}

async function syncStockIdxTd(asset: Asset, apiKey: string): Promise<boolean> {
  const sym = asset.symbol.toUpperCase().replace(/\.(JK|JKT|IDX)$/, "");
  const url = `${TD}/quote?symbol=${encodeURIComponent(sym)}%3AIDX&apikey=${encodeURIComponent(apiKey)}`;
  let resp: Response;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
  } catch {
    return false;
  }
  if (!resp.ok) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await resp.json();
  if (data?.status === "error" || !data?.close) return false;
  const price = parseFloat(data.close);
  const changePct = parseFloat(data.percent_change ?? "0");
  if (isNaN(price) || price <= 0) return false;
  await db.assetPrices.put({
    symbol: asset.symbol,
    priceIdr: price,
    changePercent24h: changePct,
    lastSynced: new Date().toISOString(),
  });
  return true;
}

/** Try Twelve Data (if key set) first, then fall back to Yahoo Finance proxy. */
async function syncStockIdx(asset: Asset): Promise<boolean> {
  const tdKey = getTwelveDataKey();
  if (tdKey) {
    const ok = await syncStockIdxTd(asset, tdKey);
    if (ok) return true;
  }
  return syncStockIdxYahoo(asset);
}

// ─── Sync gold price (Yahoo Finance GC=F — IDR/gram) ────────────────────────
// Gold Futures (GC=F) is quoted in USD/troy oz. Converted to IDR/gram.
// Used for both gold_physical and gold_digital assets.

async function fetchGoldPriceIdr(): Promise<{ priceIdr: number; changePct: number } | null> {
  const target = "https://query2.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d";
  const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(target)}`;
  let resp: Response;
  try {
    resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
  } catch {
    return null;
  }
  if (!resp.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try { data = await resp.json(); } catch { return null; }
  const result = data?.chart?.result?.[0];
  if (!result) return null;
  const goldUsd: number | undefined = result.meta?.regularMarketPrice;
  const prevClose: number | undefined = result.meta?.chartPreviousClose;
  if (!goldUsd || goldUsd <= 0) return null;
  const changePct = prevClose ? ((goldUsd - prevClose) / prevClose) * 100 : 0;
  const usdIdr = await getUsdIdr();
  // 1 troy oz = 31.1035 grams → convert to IDR per gram
  const priceIdr = (goldUsd / 31.1035) * usdIdr;
  return { priceIdr, changePct };
}

// ─── Freshness check ─────────────────────────────────────────────────────────

async function isFresh(symbol: string): Promise<boolean> {
  const row = await db.assetPrices.get(symbol);
  if (!row) return false;
  return Date.now() - new Date(row.lastSynced).getTime() < STALE_MS;
}

// ─── Main sync entry point ────────────────────────────────────────────────────
// IDX stocks use Twelve Data (free 800 req/day). US stocks use Alpha Vantage.
// Assets fresher than STALE_MS (6h) are skipped to conserve API quota.

export async function syncAllPrices(assets: Asset[]): Promise<SyncResult> {
  const synced: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];

  // All asset types are now syncable
  const syncable = assets;

  // Separate fresh (< 6h) vs stale assets
  const stale: Asset[] = [];
  for (const a of syncable) {
    if (await isFresh(a.symbol)) skipped.push(a.symbol);
    else stale.push(a);
  }

  // Crypto via CoinGecko (bulk, no key required)
  const staleCrypto = stale.filter((a) => a.type === "crypto");
  if (staleCrypto.length > 0) {
    try {
      const res = await syncCrypto(staleCrypto);
      synced.push(...res.synced);
      failed.push(...res.failed);
    } catch {
      for (const a of staleCrypto) failed.push(a.symbol);
    }
  }

  // US Stocks via Alpha Vantage — treat legacy "stock" as "stock_us"
  const staleUs = stale.filter((a) => a.type === "stock_us" || a.type === "stock");
  let noKey = false;
  if (staleUs.length > 0) {
    const keys = getAvKeys();
    if (keys.length === 0) {
      noKey = true;
      for (const a of staleUs) failed.push(a.symbol);
    } else {
      for (let i = 0; i < staleUs.length; i++) {
        if (i > 0) await delay(AV_DELAY_MS); // respect rate limit
        const apiKey = keys[i % keys.length]; // round-robin
        try {
          const ok = await syncStock(staleUs[i], apiKey);
          if (ok) synced.push(staleUs[i].symbol);
          else failed.push(staleUs[i].symbol);
        } catch {
          failed.push(staleUs[i].symbol);
        }
      }
    }
  }

  // IDX Stocks: try Twelve Data (paid) first, then Yahoo Finance proxy (free, keyless)
  const staleIdx = stale.filter((a) => a.type === "stock_idx");
  if (staleIdx.length > 0) {
    for (let i = 0; i < staleIdx.length; i++) {
      if (i > 0) await delay(AV_DELAY_MS);
      try {
        const ok = await syncStockIdx(staleIdx[i]);
        if (ok) synced.push(staleIdx[i].symbol);
        else failed.push(staleIdx[i].symbol);
      } catch {
        failed.push(staleIdx[i].symbol);
      }
    }
  }

  // Gold (physical & digital) — Yahoo Finance GC=F, price in IDR/gram
  const staleGold = stale.filter((a) => a.type === "gold_physical" || a.type === "gold_digital");
  if (staleGold.length > 0) {
    const goldPx = await fetchGoldPriceIdr();
    const now = new Date().toISOString();
    for (const a of staleGold) {
      if (goldPx) {
        await db.assetPrices.put({
          symbol: a.symbol,
          priceIdr: goldPx.priceIdr,
          changePercent24h: goldPx.changePct,
          lastSynced: now,
        });
        synced.push(a.symbol);
      } else {
        failed.push(a.symbol);
      }
    }
  }

  // Reksa dana: manual only — skip auto-sync

  return { synced, failed, skipped, noKey: noKey || undefined };
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
