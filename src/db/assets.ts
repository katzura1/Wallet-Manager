import { db } from "./db";
import type { Asset, PortfolioHistory, SyncLogEntry } from "@/types";

export async function getAssets(): Promise<Asset[]> {
  const all = await db.assets.toArray();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addAsset(data: Omit<Asset, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const now = new Date().toISOString();
  return db.assets.add({ ...data, createdAt: now, updatedAt: now }) as Promise<number>;
}

export async function updateAsset(id: number, data: Partial<Omit<Asset, "id">>): Promise<void> {
  await db.assets.update(id, { ...data, updatedAt: new Date().toISOString() });
}

export async function deleteAsset(id: number): Promise<void> {
  await db.assets.delete(id);
  // assetPrices keyed by symbol are intentionally kept (may be re-added)
}

// ─── Portfolio History ─────────────────────────────────────────────────────────

/** Upsert today's snapshot. Called after prices are loaded. */
export async function savePortfolioSnapshot(totalValue: number): Promise<void> {
  // Use local date (YYYY-MM-DD) not UTC, to avoid timezone issues
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const date = `${year}-${month}-${day}`;
  
  const existing = await db.portfolioHistory.where("date").equals(date).first();
  if (existing?.id) {
    await db.portfolioHistory.update(existing.id, { totalValue });
  } else {
    await db.portfolioHistory.add({ date, totalValue });
  }
}

/** Return the last N days of portfolio value history, oldest first. */
export async function getPortfolioHistory(days = 30): Promise<PortfolioHistory[]> {
  const all = await db.portfolioHistory.toArray();
  all.sort((a, b) => a.date.localeCompare(b.date));
  return all.slice(-days);
}

// ─── Sync Log ─────────────────────────────────────────────────────────────────

const MAX_SYNC_LOG = 30;

/**
 * Save a sync session to history.
 * If a sync already exists for the same day, merge/update the results (per-asset upsert).
 * Auto-prunes oldest entries beyond MAX_SYNC_LOG.
 */
export async function saveSyncLog(entry: Omit<SyncLogEntry, "id">): Promise<void> {
  // Extract date from syncedAt timestamp (YYYY-MM-DD)
  const syncDate = entry.syncedAt.split("T")[0];

  // Check if an entry already exists for this date
  const existingEntry = await db.syncLog
    .filter((log) => log.syncedAt.split("T")[0] === syncDate)
    .first();

  if (existingEntry?.id) {
    // Merge results: for each asset in incoming entry, update or add to existing results
    const updatedResults = [...existingEntry.results];
    
    for (const incomingResult of entry.results) {
      const existingResultIdx = updatedResults.findIndex((r) => r.symbol === incomingResult.symbol);
      if (existingResultIdx >= 0) {
        // Replace old result for this symbol with new one (timpakan)
        updatedResults[existingResultIdx] = incomingResult;
      } else {
        // Add new result for this symbol
        updatedResults.push(incomingResult);
      }
    }

    // Update the existing entry with merged results and latest timestamp
    await db.syncLog.update(existingEntry.id, {
      syncedAt: entry.syncedAt, // update to latest sync time
      results: updatedResults,
    });
  } else {
    // No existing entry for this date, add new one
    await db.syncLog.add(entry);
  }

  // Prune oldest entries if over limit
  const all = await db.syncLog.orderBy("syncedAt").primaryKeys();
  if (all.length > MAX_SYNC_LOG) {
    const toDelete = all.slice(0, all.length - MAX_SYNC_LOG);
    await db.syncLog.bulkDelete(toDelete as number[]);
  }
}

/** Fetch the N most recent sync sessions, newest first. */
export async function getSyncHistory(limit = 10): Promise<SyncLogEntry[]> {
  const all = await db.syncLog.toArray();
  all.sort((a, b) => b.syncedAt.localeCompare(a.syncedAt));
  return all.slice(0, limit);
}

/**
 * Returns price history for a specific asset, extracted from sync logs.
 * Only includes successful syncs (status === 'synced').
 * Returned newest-first.
 */
export async function getAssetPriceHistory(
  symbol: string,
  limit = 30,
): Promise<{ syncedAt: string; price: number; changePct: number | null }[]> {
  const all = await db.syncLog.toArray();
  all.sort((a, b) => a.syncedAt.localeCompare(b.syncedAt)); // oldest first

  const records: { syncedAt: string; price: number; changePct: number | null }[] = [];
  let prevPrice: number | null = null;

  for (const session of all) {
    const entry = session.results.find((r) => r.symbol === symbol && r.status === "synced");
    if (entry?.newPrice) {
      const changePct = prevPrice !== null ? ((entry.newPrice - prevPrice) / prevPrice) * 100 : null;
      records.push({ syncedAt: session.syncedAt, price: entry.newPrice, changePct });
      prevPrice = entry.newPrice;
    }
  }

  return records.slice(-limit).reverse(); // newest first
}
