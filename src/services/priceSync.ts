import { db } from "@/db/db";
import type { Asset } from "@/types";

const CG = "https://api.coingecko.com/api/v3";
const CURRENCY_API = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";

// ─── CORS proxy helper (with fallback) ───────────────────────────────────────
// corsproxy.io is blocked in some regions (incl. Indonesia). Use allorigins.win
// as primary; fall back to corsproxy.io (for users with VPN or unblocked ISP).

// const CORS_PROXIES = [
//   (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
//   (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
// ];

// async function fetchViaProxy(targetUrl: string, timeoutMs = 15000): Promise<Response> {
//   let lastErr: unknown;
//   for (const makeProxy of CORS_PROXIES) {
//     try {
//       const resp = await fetch(makeProxy(targetUrl), { signal: AbortSignal.timeout(timeoutMs) });
//       if (resp.ok) return resp;
//     } catch (e) {
//       lastErr = e;
//     }
//   }
//   throw lastErr ?? new Error("All CORS proxies failed");
// }

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
}

export const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours — don't re-sync if fresher than this

/** Wait ms milliseconds — used to respect fetch rate limits. */
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

// ─── Sync crypto prices (Yahoo Finance – via Cloudflare Worker) ──────────────

type ProgressCallback = (symbol: string, status: "syncing" | "done" | "failed" | "skipped", errorMsg?: string) => void;

async function syncCrypto(assets: Asset[], onProgress?: ProgressCallback): Promise<SyncResult> {
  const cryptos = assets.filter((a) => a.type === "crypto");
  if (!cryptos.length) return { synced: [], failed: [] };

  const synced: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < cryptos.length; i++) {
    if (i > 0) await delay(AV_DELAY_MS);
    const asset = cryptos[i];
    onProgress?.(asset.symbol, "syncing");
    const yahooSymbol = `${asset.symbol.toUpperCase()}-USD`;
    const result = await syncViaYahoo(asset, yahooSymbol, true);
    if (result.ok) {
      synced.push(asset.symbol);
      onProgress?.(asset.symbol, "done");
    } else {
      failed.push(asset.symbol);
      onProgress?.(asset.symbol, "failed", result.error);
    }
  }
  return { synced, failed };
}

// ─── Unified sync via Yahoo Finance Cloudflare Worker ───────────────────────
// yahooSymbol: symbol as used on Yahoo Finance (e.g. "AAPL", "BBCA.JK", "BTC-USD", "GC=F")
// isUsd: true → price reported in USD, convert to IDR; false → price already in IDR

async function syncViaYahoo(asset: Asset, yahooSymbol: string, isUsd: boolean): Promise<{ ok: boolean; error?: string }> {
  const target = `https://empty-wind-fcef.denny-az45.workers.dev/?symbol=${encodeURIComponent(yahooSymbol)}&interval=1d&range=1d`;
  let resp: Response;
  try {
    resp = await fetch(target, { signal: AbortSignal.timeout(12000) });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Koneksi gagal" };
  }
  if (!resp.ok) return { ok: false, error: `Yahoo Finance error ${resp.status}` };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try { data = await resp.json(); } catch { return { ok: false, error: "Response tidak valid (bukan JSON)" }; }

  const result = data?.chart?.result?.[0];
  if (!result) return { ok: false, error: "Data tidak tersedia dari Yahoo Finance" };

  const price: number | undefined = result.meta?.regularMarketPrice;
  const prevClose: number | undefined = result.meta?.chartPreviousClose;
  const changePct = price && prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

  if (!price || price <= 0) return { ok: false, error: "Harga tidak tersedia (market tutup / delisting?)" };

  const priceIdr = isUsd ? price * (await getUsdIdr()) : price;
  await db.assetPrices.put({
    symbol: asset.symbol,
    priceIdr,
    changePercent24h: changePct,
    lastSynced: new Date().toISOString(),
  });
  return { ok: true };
}

async function syncStockIdx(asset: Asset): Promise<{ ok: boolean; error?: string }> {
  const sym = asset.symbol.toUpperCase().replace(/\.(JK|JKT|IDX)$/, "");
  return syncViaYahoo(asset, `${sym}.JK`, false);
}

// ─── Sync gold price (Yahoo Finance GC=F — IDR/gram) ────────────────────────
// Gold Futures (GC=F) is quoted in USD/troy oz. Converted to IDR/gram.
// Used for both gold_physical and gold_digital assets.

async function fetchGoldPriceIdr(): Promise<{ priceIdr: number; changePct: number } | null> {
  const target = "https://empty-wind-fcef.denny-az45.workers.dev/?symbol=GC%3DF&range=1mo&interval=1d"
  let resp: Response;
  try {
    resp = await fetch(target, { signal: AbortSignal.timeout(12000) });
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
// All asset types sync via Yahoo Finance through the Cloudflare Worker (no API keys needed).
// Assets fresher than STALE_MS (6h) are skipped to conserve quota.

export async function syncAllPrices(assets: Asset[], onProgress?: ProgressCallback): Promise<SyncResult> {
  const synced: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];

  // All asset types are now syncable
  const syncable = assets;

  // Separate fresh (< 6h) vs stale assets
  const stale: Asset[] = [];
  for (const a of syncable) {
    if (await isFresh(a.symbol)) {
      skipped.push(a.symbol);
      onProgress?.(a.symbol, "skipped");
    } else {
      stale.push(a);
    }
  }

  // Crypto via Yahoo Finance (per-asset, via Cloudflare Worker)
  const staleCrypto = stale.filter((a) => a.type === "crypto");
  if (staleCrypto.length > 0) {
    try {
      const res = await syncCrypto(staleCrypto, onProgress);
      synced.push(...res.synced);
      failed.push(...res.failed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Koneksi ke Yahoo Finance gagal";
      for (const a of staleCrypto) {
        if (!synced.includes(a.symbol) && !failed.includes(a.symbol)) {
          failed.push(a.symbol);
          onProgress?.(a.symbol, "failed", msg);
        }
      }
    }
  }

  // US Stocks via Yahoo Finance — treat legacy "stock" as "stock_us"
  const staleUs = stale.filter((a) => a.type === "stock_us" || a.type === "stock");
  if (staleUs.length > 0) {
    for (let i = 0; i < staleUs.length; i++) {
      if (i > 0) await delay(AV_DELAY_MS);
      onProgress?.(staleUs[i].symbol, "syncing");
      try {
        const result = await syncViaYahoo(staleUs[i], staleUs[i].symbol, true);
        if (result.ok) {
          synced.push(staleUs[i].symbol);
          onProgress?.(staleUs[i].symbol, "done");
        } else {
          failed.push(staleUs[i].symbol);
          onProgress?.(staleUs[i].symbol, "failed", result.error);
        }
      } catch (e) {
        failed.push(staleUs[i].symbol);
        onProgress?.(staleUs[i].symbol, "failed", e instanceof Error ? e.message : "Network error");
      }
    }
  }

  // IDX Stocks via Yahoo Finance (.JK suffix, price in IDR)
  const staleIdx = stale.filter((a) => a.type === "stock_idx");
  if (staleIdx.length > 0) {
    for (let i = 0; i < staleIdx.length; i++) {
      if (i > 0) await delay(AV_DELAY_MS);
      onProgress?.(staleIdx[i].symbol, "syncing");
      try {
        const result = await syncStockIdx(staleIdx[i]);
        if (result.ok) {
          synced.push(staleIdx[i].symbol);
          onProgress?.(staleIdx[i].symbol, "done");
        } else {
          failed.push(staleIdx[i].symbol);
          onProgress?.(staleIdx[i].symbol, "failed", result.error);
        }
      } catch (e) {
        failed.push(staleIdx[i].symbol);
        onProgress?.(staleIdx[i].symbol, "failed", e instanceof Error ? e.message : "Network error");
      }
    }
  }

  // Gold (physical & digital) — Yahoo Finance GC=F, price in IDR/gram
  const staleGold = stale.filter((a) => a.type === "gold_physical" || a.type === "gold_digital");
  if (staleGold.length > 0) {
    for (const a of staleGold) onProgress?.(a.symbol, "syncing");
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
        onProgress?.(a.symbol, "done");
      } else {
        failed.push(a.symbol);
        onProgress?.(a.symbol, "failed", "Gagal ambil harga emas dari Yahoo Finance (GC=F)");
      }
    }
  }

  // Reksa dana: manual only — skip auto-sync

  return { synced, failed, skipped };
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
