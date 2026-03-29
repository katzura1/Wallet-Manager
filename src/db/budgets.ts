import { db } from "./db";
import type { Budget } from "@/types";

interface BudgetPredictionInput {
  budgetAmount: number;
  spent: number;
  dayOfMonth: number;
  daysInMonth: number;
}

export interface BudgetPrediction {
  percentage: number;
  remaining: number;
  avgDailySpent: number;
  predictedExhaustInDays: number | null;
  projectedMonthEndSpent: number;
  projectedOverrun: number;
}

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

export function predictBudgetStatus({ budgetAmount, spent, dayOfMonth, daysInMonth }: BudgetPredictionInput): BudgetPrediction {
  const safeBudget = Math.max(0, budgetAmount);
  const safeSpent = Math.max(0, spent);
  const safeElapsedDays = Math.max(1, dayOfMonth);
  const safeMonthDays = Math.max(safeElapsedDays, daysInMonth);
  const remaining = Math.max(0, safeBudget - safeSpent);
  const percentage = safeBudget > 0 ? Math.round((safeSpent / safeBudget) * 100) : 0;
  const avgDailySpent = safeSpent / safeElapsedDays;
  const projectedMonthEndSpent = avgDailySpent * safeMonthDays;
  const projectedOverrun = Math.max(0, projectedMonthEndSpent - safeBudget);

  if (avgDailySpent <= 0 || remaining <= 0) {
    return {
      percentage,
      remaining,
      avgDailySpent,
      predictedExhaustInDays: remaining <= 0 ? 0 : null,
      projectedMonthEndSpent,
      projectedOverrun,
    };
  }

  return {
    percentage,
    remaining,
    avgDailySpent,
    predictedExhaustInDays: Math.ceil(remaining / avgDailySpent),
    projectedMonthEndSpent,
    projectedOverrun,
  };
}
