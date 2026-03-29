import { Transaction } from "@/types";
import { formatCurrency, formatDate, TRANSACTION_TYPE_BG } from "@/lib/utils";
import { Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";

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

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
      {/* Main card content */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-3 min-h-14">
        {/* Icon - larger on all screens, flex-none to prevent shrink */}
        <div className={`w-12 h-12 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-lg flex-none ${TRANSACTION_TYPE_BG[tx.type]}`}>
          {displayIcon}
        </div>

        {/* Left section: Category/Note and Account info */}
        <div className="flex-1 min-w-0">
          {/* Category/Note - larger and more prominent */}
          <p className="text-base sm:text-sm font-semibold truncate">
            {displayLabel}
          </p>

          {/* Account / Date info */}
          <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
            {categoryLabel ? `${categoryLabel} · ` : ""}
            {accountName}
            {toAccountName ? ` → ${toAccountName}` : ""}
            {hasSplits ? ` · ${categoryLabel?.split(" · ").pop() ?? ""}` : ""} · {formatDate(tx.date, "dd MMM")}
          </p>
        </div>

        {/* Right section: Amount and action buttons */}
        <div className="flex items-center gap-2 text-right sm:gap-1">
          {/* Amount - larger and bold */}
          <p
            className={`font-bold text-lg sm:text-sm flex-shrink-0 ${
              tx.type === "income"
                ? "text-emerald-500"
                : tx.type === "expense"
                  ? "text-red-500"
                  : "text-amber-500"
            }`}
          >
            {tx.type === "expense" ? "-" : tx.type === "income" ? "+" : ""}
            {formatCurrency(tx.amount, currency)}
          </p>

          {/* Expand button for splits (only on mobile or when hasSplits) */}
          {hasSplits && onExpandSplits && (
            <button
              onClick={onExpandSplits}
              className="p-2 sm:p-1 text-[hsl(var(--muted-foreground))] hover:text-indigo-500 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex-shrink-0"
            >
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}

          {/* Edit button */}
          <button
            onClick={onEdit}
            className="p-2 sm:p-1 text-[hsl(var(--muted-foreground))] hover:text-indigo-500 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex-shrink-0"
          >
            <Pencil size={16} className="sm:w-[13px] sm:h-[13px]" />
          </button>

          {/* Delete button */}
          <button
            onClick={onDelete}
            className="p-2 sm:p-1 text-[hsl(var(--muted-foreground))] hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 flex-shrink-0"
          >
            <Trash2 size={16} className="sm:w-[13px] sm:h-[13px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
