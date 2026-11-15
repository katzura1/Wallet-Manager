import { recalculateAccountBalance } from "./accounts";
import { db } from "./db";
import { addTransaction } from "./transactions";
import { todayISO } from "@/lib/utils";
import type { Debt, DebtPayment, Transaction } from "@/types";

export async function getDebts(includeSettled = false): Promise<Debt[]> {
  let results = await db.debts.toArray();
  if (!includeSettled) results = results.filter((d) => !d.isSettled);
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Hutang CC: kita hutang pada akun bertipe kartu kredit. Belanja = expense, bayar = transfer ke akun CC. */
async function isCreditDebt(debt: Pick<Debt, "type" | "accountId">): Promise<boolean> {
  if (debt.type !== "owe" || !debt.accountId) return false;
  return (await db.accounts.get(debt.accountId))?.type === "credit";
}

function debtTx(debt: Pick<Debt, "type" | "name" | "amount" | "accountId" | "date" | "note">, isCredit: boolean) {
  // owe = kita terima pinjaman = income (CC: belanja = expense); owed = kita pinjamkan = expense
  const income = debt.type === "owe" && !isCredit;
  return {
    type: income ? "income" : "expense",
    amount: debt.amount,
    accountId: debt.accountId!,
    date: debt.date || todayISO(),
    note: debt.note || (isCredit ? `Belanja kartu kredit: ${debt.name}` : debt.type === "owe" ? `Pinjaman dari: ${debt.name}` : `Dipinjamkan ke: ${debt.name}`),
  } as const;
}

export async function addDebt(data: Omit<Debt, "id" | "createdAt" | "updatedAt">): Promise<number | undefined> {
  return db.transaction("rw", db.debts, db.transactions, db.accounts, async () => {
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error("Jumlah harus lebih dari 0.");
    if (data.accountId && !await db.accounts.get(data.accountId)) throw new Error("Akun tidak ditemukan.");
    const now = new Date().toISOString();
    const debtId = await db.debts.add({ ...data, remaining: data.amount, createdAt: now, updatedAt: now });

    if (data.accountId) {
      const transactionId = await addTransaction({ ...debtTx(data, await isCreditDebt(data)), debtId });
      await db.debts.update(debtId, { transactionId });
    }

    return debtId;
  });
}

/** Update a debt and keep its initial cash-flow transaction (type, amount, account, date) in sync. */
export async function updateDebt(id: number, data: Partial<Omit<Debt, "id">>): Promise<void> {
  await db.transaction("rw", db.debts, db.debtPayments, db.transactions, db.accounts, async () => {
    const existing = await db.debts.get(id);
    if (!existing) throw new Error("Utang tidak ditemukan.");
    const merged = { ...existing, ...data };
    if (!Number.isFinite(merged.amount) || merged.amount <= 0) throw new Error("Jumlah harus lebih dari 0.");
    if (merged.accountId && !await db.accounts.get(merged.accountId)) throw new Error("Akun tidak ditemukan.");
    const payments = await db.debtPayments.where("debtId").equals(id).toArray();
    const remaining = merged.amount - payments.reduce((sum, p) => sum + p.amount, 0);
    if (remaining < 0) throw new Error("Jumlah lebih kecil dari total yang sudah dibayar.");

    // Initial transaction: explicit link, else (legacy) the debt's transaction not owned by a payment.
    let tx = existing.transactionId ? await db.transactions.get(existing.transactionId) : undefined;
    if (!tx) {
      const paid = new Set(payments.map((p) => p.transactionId));
      tx = (await db.transactions.where("debtId").equals(id).toArray()).find((t) => !paid.has(t.id));
    }
    const isCredit = await isCreditDebt(merged);
    const touched = new Set<number>();
    let transactionId = tx?.id;
    if (tx) touched.add(tx.accountId);
    if (merged.accountId) {
      touched.add(merged.accountId);
      if (tx) await db.transactions.update(tx.id!, { ...debtTx(merged, isCredit), updatedAt: new Date().toISOString() });
      else transactionId = await addTransaction({ ...debtTx(merged, isCredit), debtId: id });
    } else if (tx) {
      await db.transactions.delete(tx.id!);
      transactionId = undefined;
    }
    // Pembayaran transfer mengikuti akun CC yang baru.
    if (isCredit && merged.accountId !== existing.accountId) {
      for (const p of payments) {
        const ptx = p.transactionId ? await db.transactions.get(p.transactionId) : undefined;
        if (ptx?.type !== "transfer") continue;
        touched.add(ptx.accountId).add(ptx.toAccountId!);
        await db.transactions.update(ptx.id!, { toAccountId: merged.accountId, updatedAt: new Date().toISOString() });
      }
    }
    for (const accountId of touched) await recalculateAccountBalance(accountId);

    await db.debts.update(id, { ...data, remaining, isSettled: remaining === 0, transactionId, updatedAt: new Date().toISOString() });
  });
}

async function removeTransactions(txs: Transaction[]): Promise<void> {
  const txIds = txs.map((t) => t.id!);
  await db.transactionSplits.where("transactionId").anyOf(txIds).delete();
  await db.transactions.bulkDelete(txIds);
  const accountIds = new Set(txs.flatMap((t) => [t.accountId, t.toAccountId]).filter((a): a is number => !!a));
  for (const accountId of accountIds) await recalculateAccountBalance(accountId);
}

/** Delete a debt with its payments and every linked transaction (initial + payments), then rebalance accounts. */
export async function deleteDebt(id: number): Promise<void> {
  await db.transaction("rw", [db.debts, db.debtPayments, db.transactions, db.transactionSplits, db.accounts], async () => {
    const txs = await db.transactions.where("debtId").equals(id).toArray();
    await db.debtPayments.where("debtId").equals(id).delete();
    await db.debts.delete(id);
    await removeTransactions(txs);
  });
}

/** Transactions pointing at a debt that no longer exists (left by deletes made before deleteDebt cleaned them up). */
export async function getOrphanDebtTransactions(): Promise<Transaction[]> {
  const debtIds = new Set((await db.debts.toArray()).map((d) => d.id));
  return db.transactions.filter((t) => !!t.debtId && !debtIds.has(t.debtId)).toArray();
}

export async function deleteOrphanDebtTransactions(): Promise<void> {
  await db.transaction("rw", [db.debts, db.transactions, db.transactionSplits, db.accounts], async () => {
    await removeTransactions(await getOrphanDebtTransactions());
  });
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
      if (!tx) throw new Error("Transaksi pembayaran tidak ditemukan atau tidak valid. Perubahan dibatalkan.");
      if (!await db.accounts.get(tx.accountId)) throw new Error("Akun pembayaran tidak ditemukan.");
      await db.transactions.update(payment.transactionId, { ...data, debtId: payment.debtId, updatedAt: new Date().toISOString() });
      await recalculateAccountBalance(tx.accountId);
      if (tx.toAccountId) await recalculateAccountBalance(tx.toAccountId);
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
      if (tx.toAccountId) await recalculateAccountBalance(tx.toAccountId);
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
 * - For a credit-card debt, accountId is the source account; without it the payment is a refund (income to the card). and a transfer to the card is created.
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
    const isCredit = await isCreditDebt(debt);
    if (isCredit && accountId === debt.accountId) throw new Error("Akun sumber tidak boleh sama dengan akun kartu kredit.");
    let transactionId: number | undefined;
    // Hutang CC tanpa akun sumber = refund: saldo CC dikembalikan (income).
    const refund = isCredit && !accountId;
    const txAccountId = refund ? debt.accountId : accountId;
    if (txAccountId) {
      transactionId = await addTransaction({
        type: refund ? "income" : isCredit ? "transfer" : debt.type === "owe" ? "expense" : "income",
        ...(isCredit && !refund && { toAccountId: debt.accountId }),
        debtId,
        amount,
        accountId: txAccountId,
        date,
        note: note || (refund ? `Refund kartu kredit: ${debt.name}` : isCredit ? `Bayar kartu kredit: ${debt.name}` : ""),
      });
    }
    await db.debtPayments.add({ debtId, amount, date, note, accountId: txAccountId, transactionId, createdAt: new Date().toISOString() });
    const remaining = debt.remaining - amount;
    await db.debts.update(debtId, { remaining, isSettled: remaining === 0, updatedAt: new Date().toISOString() });
  });
}
