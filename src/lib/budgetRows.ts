import type { Budget, Category } from "@/types";
import { getBudgetsForCategoriesWithInheritance, getBudgetsForMonth, predictBudgetStatus, type BudgetPrediction } from "@/db/budgets";

export interface MonthBudgets {
  budgets: Budget[];
  inheritedIds: Set<number>;
}

/** Budgets for a month (explicit + inherited recurring) and which of them are inherited. */
export async function loadMonthBudgets(month: string, categories: Category[]): Promise<MonthBudgets> {
  const expenseCategoryIds = categories
    .filter((c) => c.type === "expense" || c.type === "both")
    .map((c) => c.id)
    .filter((id): id is number => id !== undefined);
  const [budgets, explicit] = await Promise.all([
    getBudgetsForCategoriesWithInheritance(month, expenseCategoryIds),
    getBudgetsForMonth(month),
  ]);
  const explicitCategoryIds = new Set(explicit.map((b) => b.categoryId));
  const inheritedIds = new Set<number>();
  for (const budget of budgets) {
    if (!explicitCategoryIds.has(budget.categoryId)) inheritedIds.add(budget.id ?? 0);
  }
  return { budgets, inheritedIds };
}

export interface BudgetRow {
  category: Category;
  actual: number;
  budget: Budget | undefined;
  isInherited: boolean;
  pct: number;
  prediction: BudgetPrediction | null;
}

/** Spent vs limit per expense category, most-used first. `actualByCategory` is keyed by category id. */
export function buildBudgetRows(
  categories: Category[],
  budgets: Budget[],
  inheritedIds: Set<number>,
  actualByCategory: Record<number, number>,
  year: number,
  month: number,
): BudgetRow[] {
  const today = new Date();
  const daysInMonth = new Date(year, month, 0).getDate();
  const isCurrent = month === today.getMonth() + 1 && year === today.getFullYear();
  return categories
    .filter((category) => category.type === "expense" || category.type === "both")
    .map((category) => {
      const actual = category.id !== undefined ? actualByCategory[category.id] ?? 0 : 0;
      const budget = budgets.find((item) => item.categoryId === category.id);
      const pct = budget?.amount ? Math.round((actual / budget.amount) * 100) : 0;
      const prediction = budget && budget.amount > 0
        ? predictBudgetStatus({ budgetAmount: budget.amount, spent: actual, dayOfMonth: isCurrent ? today.getDate() : daysInMonth, daysInMonth })
        : null;
      return { category, actual, budget, isInherited: budget ? inheritedIds.has(budget.id ?? 0) : false, pct, prediction };
    })
    .filter((row) => row.budget || row.actual > 0)
    .sort((a, b) => {
      const aScore = a.budget?.amount ? a.actual / a.budget.amount : a.actual;
      const bScore = b.budget?.amount ? b.actual / b.budget.amount : b.actual;
      return bScore - aScore;
    });
}
