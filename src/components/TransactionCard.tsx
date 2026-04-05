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
  hasSplits = false,
  isExpanded = false,
  onExpandSplits,
  onEdit,
  onDelete,
}: TransactionCardProps) {
  const displayLabel = tx.note || (hasSplits ? "Split Kategori" : categoryLabel) || accountName;
  const displayIcon = hasSplits ? "✂️" : categoryIcon || (tx.type === "income" ? "💰" : tx.type === "expense" ? "💸" : "↔️");
  const amountColor =
    tx.type === "income"
      ? "text-emerald-500"
      : tx.type === "expense"
        ? "text-red-500"
        : "text-amber-500";

  return (
    <div className="overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/96 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.55)] backdrop-blur-sm">
      <div className="flex gap-3 border-b border-[hsl(var(--border))] px-4 py-3">
        <div className="flex gap-2 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-base flex-none ${TRANSACTION_TYPE_BG[tx.type as TransactionType]}`}>
            {displayIcon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate leading-tight">
              {hasSplits ? `Split · ${categoryLabel?.split(" · ").pop() ?? ""}` : categoryLabel || accountName}
            </p>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] truncate mt-1">
              {formatDate(tx.date, "dd MMM")} {tx.type === "transfer" ? "· Transfer" : ""}
            </p>
          </div>
        </div>
        <div className={`font-bold text-sm flex-none self-center pl-2 ${amountColor}`}>
          {tx.type === "expense" ? "-" : tx.type === "income" ? "+" : ""}
          {formatCurrency(tx.amount, currency)}
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
            {displayLabel}
          </p>
          <p className="text-[11px] text-[hsl(var(--muted-foreground))] truncate mt-1">
            {accountName}{toAccountName ? ` → ${toAccountName}` : ""}
          </p>
        </div>
        
        <div className="flex items-center gap-1 flex-none">
          {hasSplits && onExpandSplits && (
            <button onClick={onExpandSplits} className="flex h-7 w-7 items-center justify-center rounded-xl bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors" title="Detail">
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <button onClick={onEdit} className="flex h-7 w-7 items-center justify-center rounded-xl bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors" title="Edit">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="flex h-7 w-7 items-center justify-center rounded-xl bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-red-500 transition-colors" title="Hapus">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
