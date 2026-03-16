import { db } from "./db";
import type { Asset } from "@/types";

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
