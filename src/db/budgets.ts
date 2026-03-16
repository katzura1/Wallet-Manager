import { db } from "./db";
import type { Budget } from "@/types";

export async function getBudgetsForMonth(month: string): Promise<Budget[]> {
  return db.budgets.where("month").equals(month).toArray();
}

export async function setBudget(categoryId: number, month: string, amount: number): Promise<void> {
  const existing = await db.budgets.filter((b) => b.categoryId === categoryId && b.month === month).first();
  if (existing) {
    if (amount <= 0) {
      await db.budgets.delete(existing.id!);
    } else {
      await db.budgets.update(existing.id!, { amount });
    }
  } else if (amount > 0) {
    await db.budgets.add({ categoryId, month, amount, createdAt: new Date().toISOString() });
  }
}
