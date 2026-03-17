import { db } from "./db";
import type { Asset, PortfolioHistory } from "@/types";

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
  const date = new Date().toISOString().slice(0, 10);
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
