import type { Transaction } from "@/types";
import { formatCurrency, formatDate, TRANSACTION_TYPE_BG } from "@/lib/utils";
import { Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";

type TransactionType = Transaction["type"];

interface TransactionCardProps {
  transaction: Transaction;
  accountName: string;
  toAccountName?: string;
  categoryLabel?: string;
  categoryIcon?: string;
  currency: string;
  hidden?: boolean;
  desktop?: boolean;
  hasSplits?: boolean;
  isExpanded?: boolean;
  onExpandSplits?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function TransactionCard({
  transaction: tx,
  accountName,
  toAccountName,
  categoryLabel,
  categoryIcon,
  currency,
  hidden = false,
  desktop = false,
  hasSplits = false,
  isExpanded = false,
  onExpandSplits,
  onEdit,
  onDelete,
}: TransactionCardProps) {
  const displayLabel = tx.note || (hasSplits ? "Split Kategori" : categoryLabel) || accountName;
  const detailLabel = tx.debtId ? "Utang/Piutang" : tx.note
    ? hasSplits ? `Split · ${categoryLabel?.split(" · ").pop() ?? "Kategori"}` : categoryLabel ?? "Transaksi"
    : tx.type === "income" ? "Pemasukan" : tx.type === "expense" ? "Pengeluaran" : "Transfer";
  const displayIcon = hasSplits ? "✂️" : categoryIcon || (tx.type === "income" ? "💰" : tx.type === "expense" ? "💸" : "↔️");
  const amountColor = hidden ? "text-[hsl(var(--muted-foreground))]" :
    tx.type === "income"
      ? "text-emerald-500"
      : tx.type === "expense"
        ? "text-red-500"
        : "text-amber-500";

  const actions = (
    <div className="flex items-center gap-1">
      {hasSplits && onExpandSplits && (
        <button onClick={onExpandSplits} aria-expanded={isExpanded} aria-label={isExpanded ? "Tutup detail split" : "Lihat detail split"} className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      )}
      <button onClick={onEdit} aria-label={`Edit ${displayLabel}`} title={tx.debtId ? "Kelola di Utang/Piutang" : "Edit"} className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
        <Pencil size={15} />
      </button>
      <button onClick={onDelete} aria-label={`Hapus ${displayLabel}`} title={tx.debtId ? "Kelola di Utang/Piutang" : "Hapus"} className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
        <Trash2 size={15} />
      </button>
    </div>
  );
  const amount = hidden ? "•••" : `${tx.type === "expense" ? "−" : tx.type === "income" ? "+" : ""}${formatCurrency(tx.amount, currency)}`;

  if (desktop) {
    return (
      <tr className="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-2))]">
        <td className="px-3 py-2.5 max-w-72 break-words">
          <span className="mr-2" aria-hidden="true">{displayIcon}</span>
          <span className="font-medium">{displayLabel}</span>
        </td>
        <td className="px-3 py-2.5 text-[hsl(var(--muted-foreground))]">{tx.debtId ? "Utang/Piutang" : tx.type === "income" ? "Pemasukan" : tx.type === "expense" ? "Pengeluaran" : "Transfer"}</td>
        <td className="px-3 py-2.5 max-w-52 break-words">{categoryLabel ?? "—"}</td>
        <td className="px-3 py-2.5 max-w-60 break-words">{accountName}{toAccountName ? ` → ${toAccountName}` : ""}</td>
        <td className={`px-3 py-2.5 text-right whitespace-nowrap font-semibold tabular-nums ${amountColor}`}>{amount}</td>
        <td className="px-3 py-2.5">{actions}</td>
      </tr>
    );
  }

  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:flex sm:gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5">
      <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl text-base ${TRANSACTION_TYPE_BG[tx.type as TransactionType]}`}>
        {displayIcon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-[hsl(var(--foreground))]">{displayLabel}</p>
        <p className="mt-1 truncate text-[11px] text-[hsl(var(--muted-foreground))]">
          {detailLabel}
          {` · ${accountName}${toAccountName ? ` → ${toAccountName}` : ""} · ${formatDate(tx.date, "dd MMM")}`}
        </p>
      </div>
      <div className="col-start-2 flex min-w-0 items-center justify-between gap-1.5 sm:flex-none sm:flex-col sm:items-end">
        <p className={`min-w-0 break-words text-sm font-bold tabular-nums sm:whitespace-nowrap ${amountColor}`}>
          {amount}
        </p>
        {actions}
      </div>
    </div>
  );
}
