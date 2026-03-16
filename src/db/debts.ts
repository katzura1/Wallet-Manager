import { db } from "./db";
import { addTransaction } from "./transactions";
import { todayISO } from "@/lib/utils";
import type { Debt, DebtPayment } from "@/types";

export async function getDebts(includeSettled = false): Promise<Debt[]> {
  let results = await db.debts.toArray();
  if (!includeSettled) results = results.filter((d) => !d.isSettled);
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addDebt(data: Omit<Debt, "id" | "createdAt" | "updatedAt">): Promise<number | undefined> {
  const now = new Date().toISOString();
  return db.debts.add({ ...data, remaining: data.amount, createdAt: now, updatedAt: now });
}

export async function updateDebt(id: number, data: Partial<Omit<Debt, "id">>): Promise<void> {
  await db.debts.update(id, { ...data, updatedAt: new Date().toISOString() });
}

export async function deleteDebt(id: number): Promise<void> {
  await db.debtPayments.where("debtId").equals(id).delete();
  await db.debts.delete(id);
}

export async function getDebtPayments(debtId: number): Promise<DebtPayment[]> {
  return db.debtPayments.where("debtId").equals(debtId).sortBy("date");
}

/**
 * Record a partial or full payment on a debt.
 * - If accountId provided, automatically creates a matching income/expense transaction.
 * - Updates `remaining` on the debt; marks `isSettled` when remaining <= 0.
 */
export async function payDebt(
  debtId: number,
  amount: number,
  date: string = todayISO(),
  note = "",
  accountId?: number,
): Promise<void> {
  const debt = await db.debts.get(debtId);
  if (!debt) return;

  const actualAmount = Math.min(amount, debt.remaining);
  const newRemaining = Math.max(debt.remaining - actualAmount, 0);

  await db.debtPayments.add({ debtId, amount: actualAmount, date, note, createdAt: new Date().toISOString() });
  await db.debts.update(debtId, {
    remaining: newRemaining,
    isSettled: newRemaining <= 0,
    updatedAt: new Date().toISOString(),
  });

  // Optionally reflect in account balance
  if (accountId) {
    // owe = kita bayar hutang = pengeluaran; owed = kita terima pembayaran = pemasukan
    const txType = debt.type === "owe" ? "expense" : "income";
    await addTransaction({
      type: txType,
      amount: actualAmount,
      accountId,
      date,
      note: note || `Pembayaran: ${debt.name}`,
    });
  }
}
