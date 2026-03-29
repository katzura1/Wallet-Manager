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
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      {/* Main card content - horizontal layout for both mobile and desktop */}
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-none ${TRANSACTION_TYPE_BG[tx.type as TransactionType]}`}>
          {displayIcon}
        </div>

        {/* Center section: Category/Note and Account/Date info */}
        <div className="flex-1 min-w-0">
          {/* Category/Note - main label */}
          <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate leading-tight">
            {displayLabel}
          </p>

          {/* Account and Date info - secondary line */}
          <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">
            {categoryLabel ? `${categoryLabel} · ` : ""}
            {accountName}
            {toAccountName ? ` → ${toAccountName}` : ""} · {formatDate(tx.date, "dd MMM")}
          </p>
        </div>

        {/* Right section: Amount */}
        <div className={`font-bold text-sm flex-none ${amountColor}`}>
          {tx.type === "expense" ? "-" : tx.type === "income" ? "+" : ""}
          {formatCurrency(tx.amount, currency)}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-none">
          {/* Expand button for splits */}
          {hasSplits && onExpandSplits && (
            <button
              onClick={onExpandSplits}
              className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
              aria-label="Toggle split details"
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}

          {/* Edit button */}
          <button
            onClick={onEdit}
            className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
            aria-label="Edit transaction"
          >
            <Pencil size={14} />
          </button>

          {/* Delete button */}
          <button
            onClick={onDelete}
            className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
            aria-label="Delete transaction"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
