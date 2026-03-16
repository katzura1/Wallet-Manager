import { db } from "./db";
import type { Account } from "@/types";

export async function getAccounts(includeArchived = false) {
  let q = db.accounts.orderBy("createdAt");
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
