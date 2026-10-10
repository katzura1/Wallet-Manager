import type { Transaction as DBTransaction } from "dexie";
import type { Account, DebtPayment, Transaction } from "@/types";

export async function normalizeDebtPayments(scope: DBTransaction) {
  const transactions = scope.table<Transaction>("transactions");
  const accounts = scope.table<Account>("accounts");
  const payments = await scope.table<DebtPayment>("debtPayments").toArray();
  const affectedAccounts = new Set<number>();
  for (const payment of payments) {
    if (!payment.transactionId) continue;
    const tx = await transactions.get(payment.transactionId);
    // ponytail: Older unlinked debt cash flows stay unchanged; never infer links from notes.
    if (!tx || tx.type === "transfer") continue;
    await transactions.update(payment.transactionId, {
      debtId: payment.debtId,
      amount: payment.amount,
      date: payment.date,
      note: payment.note,
      updatedAt: new Date().toISOString(),
    });
    affectedAccounts.add(tx.accountId);
  }
  for (const accountId of affectedAccounts) {
    const account = await accounts.get(accountId);
    if (!account) continue;
    const rows = await transactions.where("accountId").equals(accountId).or("toAccountId").equals(accountId).toArray();
    let balance = account.initialBalance;
    for (const tx of rows) {
      if (tx.type === "income" && tx.accountId === accountId) balance += tx.amount;
      if (tx.type === "expense" && tx.accountId === accountId) balance -= tx.amount;
      if (tx.type === "transfer") {
        if (tx.accountId === accountId) balance -= tx.amount;
        if (tx.toAccountId === accountId) balance += tx.amount;
      }
    }
    await accounts.update(accountId, { currentBalance: balance, updatedAt: new Date().toISOString() });
  }
}
