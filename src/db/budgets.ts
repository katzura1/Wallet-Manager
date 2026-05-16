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

/**
 * Get budgets for multiple categories, enriched with inherited budgets
 * Returns explicit budgets for the month, plus inherited budgets for categories without explicit ones
 * @param month - Target month in YYYY-MM format
 * @param categoryIds - Array of category IDs to fetch budgets for
 * @returns Array of budgets (explicit + inherited)
 */
export async function getBudgetsForCategoriesWithInheritance(
  month: string,
  categoryIds: number[]
): Promise<Budget[]> {
  const result: Budget[] = [];
  for (const categoryId of categoryIds) {
    const budget = await getOrInheritBudget(categoryId, month);
    if (budget) {
      result.push(budget);
    }
  }
  return result;
}

/**
 * Get budget for a category in a given month, or inherit from most recent recurring budget
 * @param categoryId - The expense category ID
 * @param month - Target month in YYYY-MM format
 * @returns Budget amount for that category/month, or null if none exists
 */
export async function getOrInheritBudget(categoryId: number, month: string): Promise<Budget | null> {
  // First, check if an explicit budget exists for this month
  const explicit = await db.budgets
    .filter((b) => b.categoryId === categoryId && b.month === month)
    .first();
  
  if (explicit) {
    return explicit;
  }
  
  // No explicit budget; search backward for most recent recurring budget
  const [year, monthNum] = month.split("-").map(Number);
  let searchYear = year;
  let searchMonth = monthNum;
  
  // Search back up to 12 months
  for (let i = 0; i < 12; i++) {
    searchMonth--;
    if (searchMonth < 1) {
      searchMonth = 12;
      searchYear--;
    }
    
    const searchMonthStr = `${searchYear}-${String(searchMonth).padStart(2, "0")}`;
    const recurring = await db.budgets
      .filter((b) => b.categoryId === categoryId && b.month === searchMonthStr && b.recurring === true)
      .first();
    
    if (recurring) {
      return recurring;
    }
  }
  
  return null;
}

export async function setBudget(
  categoryId: number,
  month: string,
  amount: number,
  recurring?: boolean
): Promise<void> {
  const existing = await db.budgets
    .filter((b) => b.categoryId === categoryId && b.month === month)
    .first();
  if (existing) {
    if (amount <= 0) {
      await db.budgets.delete(existing.id!);
    } else {
      await db.budgets.update(existing.id!, { amount, recurring: recurring ?? false });
    }
  } else if (amount > 0) {
    await db.budgets.add({
      categoryId,
      month,
      amount,
      recurring: recurring ?? false,
      createdAt: new Date().toISOString(),
    });
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
