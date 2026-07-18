import { db } from "./db";
import { getAccountById, recalculateAccountBalance } from "./accounts";
import type { Transaction } from "@/types";

const ANOMALY_LOOKBACK_DAYS = 180;
const ANOMALY_RECENT_WINDOW_DAYS = 21;
const ANOMALY_MIN_SAMPLES = 3;
const ANOMALY_MIN_AMOUNT = 50000;

export interface SpendingAnomaly {
  transactionId: number;
  categoryId: number;
  amount: number;
  date: string;
  note: string;
  accountId: number;
  baselineAverage: number;
  baselineMedian: number;
  ratioToAverage: number;
  deviationAmount: number;
  sampleSize: number;
  severity: "warning" | "danger";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function toDateKey(date: Date) {
  return date.toISOString().split("T")[0];
}

function calculateMedian(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function buildNetCategoryExpenseMap(transactions: Transaction[]) {
  const rawMap: Record<number, number> = {};

  for (const tx of transactions) {
    if (!tx.categoryId) continue;
    if (tx.type !== "expense" && tx.type !== "income") continue;

    const delta = tx.type === "expense" ? tx.amount : -tx.amount;
    rawMap[tx.categoryId] = (rawMap[tx.categoryId] ?? 0) + delta;
  }

  return Object.fromEntries(
    Object.entries(rawMap)
      .map(([categoryId, amount]) => [Number(categoryId), Math.max(amount, 0)])
      .filter(([, amount]) => amount > 0),
  ) as Record<number, number>;
}

export interface TransactionFilter {
  accountIds?: number[];
  categoryId?: number;
  type?: Transaction["type"];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export async function getTransactions(filter: TransactionFilter = {}) {
  let query = db.transactions.orderBy("date").reverse();
  let results = await query.toArray();

  if (filter.accountIds && filter.accountIds.length > 0) {
    results = results.filter((t) => filter.accountIds!.includes(t.accountId) || (t.toAccountId && filter.accountIds!.includes(t.toAccountId)));
  }
  if (filter.categoryId !== undefined) {
    results = results.filter((t) => t.categoryId === filter.categoryId);
  }
  if (filter.type) {
    results = results.filter((t) => t.type === filter.type);
  }
  if (filter.dateFrom) {
    results = results.filter((t) => t.date >= filter.dateFrom!);
  }
  if (filter.dateTo) {
    results = results.filter((t) => t.date <= filter.dateTo!);
  }
  if (filter.search) {
    const search = filter.search.toLowerCase();
    results = results.filter((t) => t.note.toLowerCase().includes(search));
  }

  return results;
}

export interface AccountLedgerRow {
  transaction: Transaction;
  debit: number;
  credit: number;
  signedAmount: number;
  balanceAfter: number;
}

export interface AccountLedgerResult {
  account: NonNullable<Awaited<ReturnType<typeof getAccountById>>>;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  rows: AccountLedgerRow[];
}

function getLedgerEffect(tx: Transaction, accountId: number) {
  if (tx.type === "income" && tx.accountId === accountId) return tx.amount;
  if (tx.type === "expense" && tx.accountId === accountId) return -tx.amount;
  if (tx.type === "transfer") {
    if (tx.accountId === accountId) return -tx.amount;
    if (tx.toAccountId === accountId) return tx.amount;
  }
  return 0;
}

export async function getAccountLedger(accountId: number, dateFrom?: string, dateTo?: string): Promise<AccountLedgerResult | null> {
  const account = await getAccountById(accountId);
  if (!account) return null;

  const transactions = await db.transactions
    .where("accountId")
    .equals(accountId)
    .or("toAccountId")
    .equals(accountId)
    .toArray();

  transactions.sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) return dateDiff;
    const createdDiff = a.createdAt.localeCompare(b.createdAt);
    if (createdDiff !== 0) return createdDiff;
    return (a.id ?? 0) - (b.id ?? 0);
  });

  let openingBalance = account.initialBalance;
  for (const tx of transactions) {
    if (dateFrom && tx.date >= dateFrom) continue;
    openingBalance += getLedgerEffect(tx, accountId);
  }

  let runningBalance = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: AccountLedgerRow[] = [];

  for (const tx of transactions) {
    if (dateFrom && tx.date < dateFrom) continue;
    if (dateTo && tx.date > dateTo) continue;

    const signedAmount = getLedgerEffect(tx, accountId);
    if (signedAmount === 0) continue;

    runningBalance += signedAmount;
    const credit = signedAmount > 0 ? signedAmount : 0;
    const debit = signedAmount < 0 ? Math.abs(signedAmount) : 0;
    totalCredit += credit;
    totalDebit += debit;

    rows.push({
      transaction: tx,
      debit,
      credit,
      signedAmount,
      balanceAfter: runningBalance,
    });
  }

  return {
    account,
    openingBalance,
    closingBalance: runningBalance,
    totalDebit,
    totalCredit,
    rows,
  };
}

export async function addTransaction(data: Omit<Transaction, "id" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const id = await db.transactions.add({ ...data, createdAt: now, updatedAt: now });
  await recalculateAccountBalance(data.accountId);
  if (data.toAccountId) await recalculateAccountBalance(data.toAccountId);
  return id;
}

export async function addTransfer(fromAccountId: number, toAccountId: number, amount: number, date: string, note: string) {
  const now = new Date().toISOString();
  // Create first transaction to get id
  const tx1Id = await db.transactions.add({
    type: "transfer",
    amount,
    accountId: fromAccountId,
    toAccountId,
    date,
    note,
    createdAt: now,
    updatedAt: now,
  });
  // Update it with its own id as transferPairId (self-linked, single record approach)
  await db.transactions.update(tx1Id, { transferPairId: tx1Id });

  await recalculateAccountBalance(fromAccountId);
  await recalculateAccountBalance(toAccountId);
  return tx1Id;
}

export async function updateTransaction(id: number, data: Partial<Omit<Transaction, "id">>) {
  const existing = await db.transactions.get(id);
  if (!existing) return;
  await db.transactions.update(id, { ...data, updatedAt: new Date().toISOString() });
  await recalculateAccountBalance(existing.accountId);
  if (existing.toAccountId) await recalculateAccountBalance(existing.toAccountId);
  if (data.accountId && data.accountId !== existing.accountId) {
    await recalculateAccountBalance(data.accountId);
  }
  if (data.toAccountId && data.toAccountId !== existing.toAccountId) {
    await recalculateAccountBalance(data.toAccountId);
  }
}

export async function deleteTransaction(id: number) {
  const tx = await db.transactions.get(id);
  if (!tx) return;
  await db.transactions.delete(id);
  await recalculateAccountBalance(tx.accountId);
  if (tx.toAccountId) await recalculateAccountBalance(tx.toAccountId);
}

export async function getMonthlySummary(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const prefix = `${year}-${pad(month)}`;
  const transactions = await db.transactions.where("date").startsWith(prefix).toArray();

  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (tx.type === "income") income += tx.amount;
    if (tx.type === "expense") expense += tx.amount;
  }
  return { income, expense, net: income - expense };
}

export async function getSummaryBetween(from: string, to: string) {
  const transactions = await db.transactions
    .where("date").between(from, to, true, true)
    .toArray();
  let income = 0, expense = 0;
  for (const tx of transactions) {
    if (tx.type === "income") income += tx.amount;
    if (tx.type === "expense") expense += tx.amount;
  }
  return { income, expense, net: income - expense };
}

export async function getCategoryExpenseBetween(from: string, to: string) {
  const transactions = await db.transactions
    .where("date").between(from, to, true, true)
    .filter((t) => !!t.categoryId && (t.type === "expense" || t.type === "income"))
    .toArray();
  return buildNetCategoryExpenseMap(transactions);
}

export async function getMonthlyChartData(months = 6) {
  const result = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const summary = await getMonthlySummary(d.getFullYear(), d.getMonth() + 1);
    result.push({
      month: d.toLocaleString("id-ID", { month: "short", year: "2-digit" }),
      income: summary.income,
      expense: summary.expense,
    });
  }
  return result;
}

export async function getCategoryExpenseData(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const prefix = `${year}-${pad(month)}`;
  const transactions = await db.transactions
    .where("date")
    .startsWith(prefix)
    .filter((t) => !!t.categoryId && (t.type === "expense" || t.type === "income"))
    .toArray();

  return buildNetCategoryExpenseMap(transactions);
}

export async function getRecentSpendingAnomalies(limit = 3, referenceDate = new Date()): Promise<SpendingAnomaly[]> {
  const windowEnd = startOfDay(referenceDate);
  const recentFrom = toDateKey(addDays(windowEnd, -ANOMALY_RECENT_WINDOW_DAYS));
  const lookbackFrom = toDateKey(addDays(windowEnd, -(ANOMALY_LOOKBACK_DAYS + ANOMALY_RECENT_WINDOW_DAYS)));
  const windowEndKey = toDateKey(windowEnd);

  const expenses = await db.transactions
    .where("date")
    .between(lookbackFrom, windowEndKey, true, true)
    .filter((tx) => tx.type === "expense" && !!tx.categoryId)
    .toArray();

  const byCategory = new Map<number, Transaction[]>();
  for (const expense of expenses) {
    if (!expense.categoryId) continue;
    const items = byCategory.get(expense.categoryId) ?? [];
    items.push(expense);
    byCategory.set(expense.categoryId, items);
  }

  const anomalies: SpendingAnomaly[] = [];

  for (const expense of expenses) {
    if (!expense.id || !expense.categoryId || expense.date < recentFrom || expense.amount < ANOMALY_MIN_AMOUNT) {
      continue;
    }

    const categoryHistory = byCategory.get(expense.categoryId) ?? [];
    const history = categoryHistory.filter((item) => {
      if (item.id === expense.id) return false;
      if (item.date >= expense.date) return false;
      return item.date >= toDateKey(addDays(new Date(`${expense.date}T00:00:00`), -ANOMALY_LOOKBACK_DAYS));
    });

    if (history.length < ANOMALY_MIN_SAMPLES) {
      continue;
    }

    const amounts = history.map((item) => item.amount);
    const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const median = calculateMedian(amounts);
    const ratioToAverage = average > 0 ? expense.amount / average : 0;
    const ratioToMedian = median > 0 ? expense.amount / median : ratioToAverage;
    const deviationAmount = expense.amount - average;
    const thresholdAmount = Math.max(ANOMALY_MIN_AMOUNT, average * 0.75);

    if (ratioToAverage < 1.8 || ratioToMedian < 1.6 || deviationAmount < thresholdAmount) {
      continue;
    }

    anomalies.push({
      transactionId: expense.id,
      categoryId: expense.categoryId,
      amount: expense.amount,
      date: expense.date,
      note: expense.note,
      accountId: expense.accountId,
      baselineAverage: average,
      baselineMedian: median,
      ratioToAverage,
      deviationAmount,
      sampleSize: history.length,
      severity: ratioToAverage >= 2.5 || deviationAmount >= Math.max(250000, average)
        ? "danger"
        : "warning",
    });
  }

  return anomalies
    .sort((a, b) => {
      if (b.severity !== a.severity) {
        return b.severity === "danger" ? 1 : -1;
      }
      if (b.ratioToAverage !== a.ratioToAverage) {
        return b.ratioToAverage - a.ratioToAverage;
      }
      return b.date.localeCompare(a.date);
    })
    .slice(0, limit);
}

/** Computes total balance across all non-archived accounts for the last N months. */
export async function getTotalBalanceHistory(months = 6) {
  const accounts = await db.accounts.filter((a) => !a.isArchived).toArray();
  if (accounts.length === 0) return [];
  const allTxs = await db.transactions.orderBy("date").toArray();
  const now = new Date();
  const result = [];

  for (let i = months - 1; i >= 0; i--) {
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const endDateStr = endOfMonth.toISOString().split("T")[0];
    let balance = accounts.reduce((sum, a) => sum + a.initialBalance, 0);
    for (const tx of allTxs) {
      if (tx.date > endDateStr) continue;
      if (tx.type === "income") balance += tx.amount;
      else if (tx.type === "expense") balance -= tx.amount;
      // transfers don't change total balance
    }
    const label = new Date(now.getFullYear(), now.getMonth() - i, 1).toLocaleString("id-ID", {
      month: "short",
      year: "2-digit",
    });
    result.push({ month: label, balance });
  }
  return result;
}

/** Year-to-Date summary - accumulates from January 1st to the specified month */
export interface YearToDateSummary {
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  savingsRate: number;
  monthsIncluded: number;
  averageMonthlyIncome: number;
  averageMonthlyExpense: number;
}

export async function getYearToDateSummary(year: number, upToMonth: number) {
  const pad = (n: number) => String(n).padStart(2, "0");

  const transactions = await db.transactions
    .where("date")
    .between(`${year}-01-01`, `${year}-${pad(upToMonth)}-${new Date(year, upToMonth, 0).getDate()}`, true, true)
    .toArray();

  let totalIncome = 0;
  let totalExpense = 0;
  for (const tx of transactions) {
    if (tx.type === "income") totalIncome += tx.amount;
    if (tx.type === "expense") totalExpense += tx.amount;
  }

  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;
  const monthsIncluded = upToMonth;

  return {
    totalIncome,
    totalExpense,
    netSavings,
    savingsRate,
    monthsIncluded,
    averageMonthlyIncome: monthsIncluded > 0 ? Math.round(totalIncome / monthsIncluded) : 0,
    averageMonthlyExpense: monthsIncluded > 0 ? Math.round(totalExpense / monthsIncluded) : 0,
  };
}

/** Monthly breakdown for YTD chart */
export interface MonthlyBreakdown {
  month: string;
  monthShort: string;
  income: number;
  expense: number;
  net: number;
}

export async function getYearToDateBreakdown(year: number, upToMonth: number): Promise<MonthlyBreakdown[]> {
  const result: MonthlyBreakdown[] = [];

  for (let m = 1; m <= upToMonth; m++) {
    const summary = await getMonthlySummary(year, m);
    const date = new Date(year, m - 1, 1);
    result.push({
      month: date.toLocaleString("id-ID", { month: "long", year: "numeric" }),
      monthShort: date.toLocaleString("id-ID", { month: "short", year: "2-digit" }),
      income: summary.income,
      expense: summary.expense,
      net: summary.net,
    });
  }

  return result;
}

/** Year-over-Year comparison for a specific month */
export interface YearOverYearComparison {
  currentYear: number;
  currentMonth: number;
  current: { income: number; expense: number; net: number };
  previousYear: number;
  previousMonth: { income: number; expense: number; net: number };
  incomeChange: number; // percentage
  expenseChange: number; // percentage
  netChange: number; // percentage
  hasPreviousYearData: boolean;
}

export async function getYearOverYearComparison(year: number, month: number): Promise<YearOverYearComparison> {
  const current = await getMonthlySummary(year, month);
  const previousYearSummary = await getMonthlySummary(year - 1, month);

  const hasPreviousYearData = previousYearSummary.income > 0 || previousYearSummary.expense > 0;

  const incomeChange = previousYearSummary.income > 0
    ? Math.round(((current.income - previousYearSummary.income) / previousYearSummary.income) * 100)
    : 0;
  const expenseChange = previousYearSummary.expense > 0
    ? Math.round(((current.expense - previousYearSummary.expense) / previousYearSummary.expense) * 100)
    : 0;
  const netChange = previousYearSummary.net !== 0
    ? Math.round(((current.net - previousYearSummary.net) / Math.abs(previousYearSummary.net)) * 100)
    : 0;

  return {
    currentYear: year,
    currentMonth: month,
    current,
    previousYear: year - 1,
    previousMonth: previousYearSummary,
    incomeChange,
    expenseChange,
    netChange,
    hasPreviousYearData,
  };
}

/** Category income breakdown - returns basic data, UI enriches with category details */
export interface CategoryIncomeEntry {
  categoryId: number;
  amount: number;
}

export async function getCategoryIncomeData(year: number, month: number): Promise<CategoryIncomeEntry[]> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const prefix = `${year}-${pad(month)}`;
  const transactions = await db.transactions
    .where("date")
    .startsWith(prefix)
    .filter((t) => t.type === "income" && !!t.categoryId)
    .toArray();

  const categoryTotals = new Map<number, number>();
  for (const tx of transactions) {
    if (!tx.categoryId) continue;
    categoryTotals.set(tx.categoryId, (categoryTotals.get(tx.categoryId) ?? 0) + tx.amount);
  }

  return Array.from(categoryTotals.entries())
    .map(([categoryId, amount]) => ({
      categoryId,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** Monthly spending trends by category - for growth analysis */
export interface CategoryTrend {
  categoryId: number;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  currentMonth: number;
  previousMonthsAverage: number;
  growthRate: number; // percentage
  isSignificant: boolean; // >50% change
}

export async function getCategoryTrends(year: number, month: number, lookbackMonths = 3): Promise<CategoryTrend[]> {
  const currentData = await getCategoryExpenseData(year, month);
  const categories = await db.categories.toArray();

  const trends: CategoryTrend[] = [];

  for (const [catIdStr, currentAmount] of Object.entries(currentData)) {
    const categoryId = Number(catIdStr);
    const category = categories.find((c) => c.id === categoryId);
    if (!category) continue;

    // Calculate average from previous months
    let totalPrevious = 0;
    let validMonths = 0;
    for (let i = 1; i <= lookbackMonths; i++) {
      const prevMonth = month - i;
      const prevYear = prevMonth <= 0 ? year - 1 : year;
      const adjustedMonth = prevMonth <= 0 ? prevMonth + 12 : prevMonth;
      const prevData = await getCategoryExpenseData(prevYear, adjustedMonth);
      const amount = prevData[categoryId] ?? 0;
      if (amount > 0) {
        totalPrevious += amount;
        validMonths++;
      }
    }

    const previousMonthsAverage = validMonths > 0 ? totalPrevious / validMonths : 0;
    const growthRate = previousMonthsAverage > 0
      ? Math.round(((currentAmount - previousMonthsAverage) / previousMonthsAverage) * 100)
      : 0;

    trends.push({
      categoryId,
      categoryName: category.name,
      categoryIcon: category.icon ?? "📦",
      categoryColor: category.color ?? "#6b7280",
      currentMonth: currentAmount,
      previousMonthsAverage,
      growthRate,
      isSignificant: Math.abs(growthRate) >= 50,
    });
  }

  return trends.sort((a, b) => Math.abs(b.growthRate) - Math.abs(a.growthRate));
}
