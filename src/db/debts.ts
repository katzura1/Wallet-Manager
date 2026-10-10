import { recalculateAccountBalance } from "./accounts";
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
  return db.transaction("rw", db.debts, db.transactions, db.accounts, async () => {
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error("Jumlah harus lebih dari 0.");
    if (data.accountId && !await db.accounts.get(data.accountId)) throw new Error("Akun tidak ditemukan.");
    const now = new Date().toISOString();
    const debtId = await db.debts.add({ ...data, remaining: data.amount, createdAt: now, updatedAt: now });

    // Auto-create a transaction to reflect the account balance immediately
    if (data.accountId) {
      // owe = kita terima pinjaman = income (akun bertambah)
      // owed = kita pinjamkan ke orang = expense (akun berkurang)
      const txType = data.type === "owe" ? "income" : "expense";
      const defaultNote = data.type === "owe"
        ? `Pinjaman dari: ${data.name}`
        : `Dipinjamkan ke: ${data.name}`;
      await addTransaction({
        type: txType,
        debtId,
        amount: data.amount,
        accountId: data.accountId,
        date: todayISO(),
        note: data.note || defaultNote,
      });
    }

    return debtId;
  });
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
 * Update a payment record and recalculate the parent debt's remaining balance.
 */
export async function updateDebtPayment(
  paymentId: number,
  data: Pick<DebtPayment, "amount" | "date" | "note">,
): Promise<void> {
  await db.transaction("rw", db.debtPayments, db.debts, db.transactions, db.accounts, async () => {
    const payment = await db.debtPayments.get(paymentId);
    if (!payment) throw new Error("Pembayaran tidak ditemukan.");
    const debt = await db.debts.get(payment.debtId);
    if (!debt) throw new Error("Utang tidak ditemukan.");
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error("Jumlah harus lebih dari 0.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0, 10) !== data.date) {
      throw new Error("Tanggal pembayaran tidak valid.");
    }
    const payments = await db.debtPayments.where("debtId").equals(payment.debtId).toArray();
    const totalPaid = payments.reduce((sum, row) => sum + (row.id === paymentId ? data.amount : row.amount), 0);
    if (totalPaid > debt.amount) throw new Error("Total pembayaran melebihi jumlah utang.");
    if (payment.transactionId) {
      const tx = await db.transactions.get(payment.transactionId);
      if (!tx || tx.type === "transfer") throw new Error("Transaksi pembayaran tidak ditemukan atau tidak valid. Perubahan dibatalkan.");
      if (!await db.accounts.get(tx.accountId)) throw new Error("Akun pembayaran tidak ditemukan.");
      await db.transactions.update(payment.transactionId, { ...data, debtId: payment.debtId, updatedAt: new Date().toISOString() });
      await recalculateAccountBalance(tx.accountId);
    }
    await db.debtPayments.update(paymentId, data);
    const remaining = debt.amount - totalPaid;
    await db.debts.update(debt.id!, { remaining, isSettled: remaining === 0, updatedAt: new Date().toISOString() });
  });
}

/**
 * Delete a payment record and recalculate the parent debt's remaining balance.
 * Also deletes any associated transaction if it exists.
 */
export async function deleteDebtPayment(paymentId: number): Promise<void> {
  await db.transaction("rw", [db.debtPayments, db.debts, db.transactions, db.transactionSplits, db.accounts], async () => {
    const payment = await db.debtPayments.get(paymentId);
    if (!payment) return;
    if (payment.transactionId) {
      const tx = await db.transactions.get(payment.transactionId);
      if (!tx) throw new Error("Transaksi pembayaran tidak ditemukan. Penghapusan dibatalkan.");
      await db.transactions.delete(payment.transactionId);
      await db.transactionSplits.where("transactionId").equals(payment.transactionId).delete();
      await recalculateAccountBalance(tx.accountId);
    }
    await db.debtPayments.delete(paymentId);
    const debt = await db.debts.get(payment.debtId);
    if (!debt) return;
    const payments = await db.debtPayments.where("debtId").equals(payment.debtId).toArray();
    const remaining = Math.max(debt.amount - payments.reduce((sum, row) => sum + row.amount, 0), 0);
    await db.debts.update(debt.id!, { remaining, isSettled: remaining === 0, updatedAt: new Date().toISOString() });
  });
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
  await db.transaction("rw", db.debtPayments, db.debts, db.transactions, db.accounts, async () => {
    const debt = await db.debts.get(debtId);
    if (!debt) throw new Error("Utang tidak ditemukan.");
    if (!Number.isFinite(amount) || amount <= 0 || amount > debt.remaining) {
      throw new Error("Jumlah pembayaran tidak valid atau melebihi sisa utang.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      throw new Error("Tanggal pembayaran tidak valid.");
    }
    if (accountId && !await db.accounts.get(accountId)) throw new Error("Akun tidak ditemukan.");
    let transactionId: number | undefined;
    if (accountId) {
      transactionId = await addTransaction({
        type: debt.type === "owe" ? "expense" : "income",
        debtId,
        amount,
        accountId,
        date,
        note,
      });
    }
    await db.debtPayments.add({ debtId, amount, date, note, accountId, transactionId, createdAt: new Date().toISOString() });
    const remaining = debt.remaining - amount;
    await db.debts.update(debtId, { remaining, isSettled: remaining === 0, updatedAt: new Date().toISOString() });
  });
}
