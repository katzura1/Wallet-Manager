import type { Account, Category, Transaction } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface Options {
  accounts: Account[];
  categories: Category[];
  currency: string;
  hidden?: boolean;
}

/** Confirmation copy for deleting a transaction: names it and states the balance effect. */
export function describeTransactionDelete(tx: Transaction, { accounts, categories, currency, hidden = false }: Options): string {
  const accountName = (id?: number) => accounts.find((a) => a.id === id)?.name ?? "akun";
  const name = tx.note || categories.find((c) => c.id === tx.categoryId)?.name || (tx.type === "transfer" ? "Transfer" : "Transaksi");
  const amount = hidden ? "•••" : formatCurrency(tx.amount, currency);
  if (tx.type === "transfer") {
    return `“${name}” ${amount} akan dihapus; saldo ${accountName(tx.accountId)} naik kembali ${amount} dan saldo ${accountName(tx.toAccountId)} turun ${amount}.`;
  }
  const direction = tx.type === "expense" ? "naik" : "turun";
  return `“${name}” ${amount} akan dihapus dan saldo ${accountName(tx.accountId)} ${direction} kembali ${amount}.`;
}
