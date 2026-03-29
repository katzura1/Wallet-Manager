import { db } from "./db";
import { recalculateAccountBalance } from "./accounts";
import type { Transaction } from "@/types";

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
