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
  hasSplits = false,
  isExpanded = false,
  onExpandSplits,
  onEdit,
  onDelete,
}: TransactionCardProps) {
  const displayLabel = tx.note || (hasSplits ? "Split Kategori" : categoryLabel) || accountName;
  const detailLabel = tx.note
    ? hasSplits ? `Split · ${categoryLabel?.split(" · ").pop() ?? "Kategori"}` : categoryLabel ?? "Transaksi"
    : tx.type === "income" ? "Pemasukan" : tx.type === "expense" ? "Pengeluaran" : "Transfer";
  const displayIcon = hasSplits ? "✂️" : categoryIcon || (tx.type === "income" ? "💰" : tx.type === "expense" ? "💸" : "↔️");
  const amountColor = hidden ? "text-[hsl(var(--muted-foreground))]" :
    tx.type === "income"
      ? "text-emerald-500"
      : tx.type === "expense"
        ? "text-red-500"
        : "text-amber-500";

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5">
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
      <div className="flex flex-none flex-col items-end gap-1.5">
        <p className={`whitespace-nowrap text-sm font-bold tabular-nums ${amountColor}`}>
          {hidden ? "•••" : `${tx.type === "expense" ? "−" : tx.type === "income" ? "+" : ""}${formatCurrency(tx.amount, currency)}`}
        </p>
        <div className="flex items-center gap-1">
          {hasSplits && onExpandSplits && (
            <button onClick={onExpandSplits} aria-label={isExpanded ? "Tutup detail split" : "Lihat detail split"} className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
              {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
          <button onClick={onEdit} aria-label={`Edit ${displayLabel}`} title="Edit" className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
            <Pencil size={15} />
          </button>
          <button onClick={onDelete} aria-label={`Hapus ${displayLabel}`} title="Hapus" className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
