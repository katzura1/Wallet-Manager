import { db } from "./db";
import { todayISO } from "@/lib/utils";
import type { Account } from "@/types";

export async function getAccounts(includeArchived = false) {
  const q = db.accounts.orderBy("createdAt");
  if (!includeArchived) {
    return q.filter((a) => !a.isArchived).toArray();
  }
  return q.toArray();
}

export async function getAccountById(id: number) {
  return db.accounts.get(id);
}

export async function addAccount(data: Omit<Account, "id" | "createdAt" | "updatedAt" | "currentBalance">) {
  const now = new Date().toISOString();
  return db.accounts.add({
    ...data,
    currentBalance: data.initialBalance,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateAccount(id: number, data: Partial<Omit<Account, "id">>) {
  return db.accounts.update(id, { ...data, updatedAt: new Date().toISOString() });
}

export async function archiveAccount(id: number) {
  return db.accounts.update(id, { isArchived: true, updatedAt: new Date().toISOString() });
}

export async function deleteAccount(id: number) {
  // Delete all transactions related to this account
  await db.transactions.where("accountId").equals(id).delete();
  await db.transactions.where("toAccountId").equals(id).delete();
  return db.accounts.delete(id);
}

export async function recalculateAccountBalance(accountId: number) {
  const account = await db.accounts.get(accountId);
  if (!account) return;

  const transactions = await db.transactions.where("accountId").equals(accountId).or("toAccountId").equals(accountId).toArray();

  let balance = account.initialBalance;
  for (const tx of transactions) {
    if (tx.type === "income" && tx.accountId === accountId) {
      balance += tx.amount;
    } else if (tx.type === "expense" && tx.accountId === accountId) {
      balance -= tx.amount;
    } else if (tx.type === "transfer") {
      if (tx.accountId === accountId) balance -= tx.amount;
      if (tx.toAccountId === accountId) balance += tx.amount;
    }
  }

  await db.accounts.update(accountId, { currentBalance: balance, updatedAt: new Date().toISOString() });
  return balance;
}

export async function reconcileAccount(accountId: number, actualBalance: number, expectedBalance: number, note: string) {
  if (!Number.isFinite(actualBalance) || Math.abs(actualBalance) > Number.MAX_SAFE_INTEGER) {
    throw new Error("Saldo aktual tidak valid.");
  }
  return db.transaction("rw", db.accounts, db.transactions, async () => {
    const account = await db.accounts.get(accountId);
    if (!account || account.isArchived) throw new Error("Akun tidak ditemukan atau sudah diarsipkan.");
    const balance = await recalculateAccountBalance(accountId);
    if (balance !== expectedBalance) {
      throw new Error("Saldo berubah. Periksa saldo terbaru, lalu cocokkan kembali.");
    }
    const difference = actualBalance - balance;
    if (!Number.isFinite(difference) || Math.abs(difference) > Number.MAX_SAFE_INTEGER) {
      throw new Error("Selisih saldo terlalu besar.");
    }
    if (difference === 0) return 0;
    const now = new Date().toISOString();
    await db.transactions.add({
      type: difference > 0 ? "income" : "expense",
      isAdjustment: true,
      amount: Math.abs(difference),
      accountId,
      date: todayISO(),
      note: note.trim() || "Penyesuaian saldo",
      createdAt: now,
      updatedAt: now,
    });
    await recalculateAccountBalance(accountId);
    return difference;
  });
}
