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
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
      {/* Row 1: Icon + Category/Date | Amount */}
      <div className="flex gap-2 p-3 border-b border-[hsl(var(--border))]">
        {/* Icon + Category/Date */}
        <div className="flex gap-2 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-none ${TRANSACTION_TYPE_BG[tx.type as TransactionType]}`}>
            {displayIcon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[hsl(var(--foreground))] truncate leading-tight">
              {hasSplits ? `Split · ${categoryLabel?.split(" · ").pop() ?? ""}` : categoryLabel || accountName}
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
              {formatDate(tx.date, "dd MMM")}
            </p>
          </div>
        </div>
        <div className={`font-bold text-sm flex-none ${amountColor}`}>
          {tx.type === "expense" ? "-" : tx.type === "income" ? "+" : ""}
          {formatCurrency(tx.amount, currency)}
        </div>
      </div>

      {/* Row 2: Note/Account | Buttons */}
      <div className="flex items-center gap-2 p-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[hsl(var(--foreground))] truncate">
            {displayLabel}
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
            {accountName}{toAccountName ? ` → ${toAccountName}` : ""}
          </p>
        </div>
        
        <div className="flex items-center gap-1 flex-none">
          {hasSplits && onExpandSplits && (
            <button onClick={onExpandSplits} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-indigo-500 rounded transition-colors" title="Detail">
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <button onClick={onEdit} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-indigo-500 rounded transition-colors" title="Edit">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-red-500 rounded transition-colors" title="Hapus">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
