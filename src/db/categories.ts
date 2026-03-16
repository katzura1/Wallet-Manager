import { db } from "./db";
import type { Category } from "@/types";

export async function getCategories(type?: "income" | "expense") {
  let results: Category[];
  if (type) {
    results = await db.categories.filter((c) => c.type === type || c.type === "both").toArray();
  } else {
    results = await db.categories.toArray();
  }
  return results.sort((a, b) => a.name.localeCompare(b.name, "id"));
}

export async function addCategory(data: Omit<Category, "id" | "createdAt">) {
  return db.categories.add({ ...data, createdAt: new Date().toISOString() });
}

export async function updateCategory(id: number, data: Partial<Omit<Category, "id">>) {
  return db.categories.update(id, data);
}

export async function deleteCategory(id: number) {
  // Unlink transactions using this category
  const txs = await db.transactions.where("categoryId").equals(id).toArray();
  for (const tx of txs) {
    await db.transactions.update(tx.id!, { categoryId: undefined });
  }
  return db.categories.delete(id);
}

export async function getSetting(key: string) {
  const setting = await db.settings.where("key").equals(key).first();
  return setting?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const existing = await db.settings.where("key").equals(key).first();
  if (existing) {
    return db.settings.update(existing.id!, { value });
  }
  return db.settings.add({ key, value });
}
