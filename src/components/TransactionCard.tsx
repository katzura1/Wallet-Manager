import type { Transaction } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Pencil, Trash2 } from "lucide-react";
import { IconTile } from "@/components/ui";

interface TransactionCardProps {
  transaction: Transaction;
  accountName: string;
  toAccountName?: string;
  categoryLabel?: string;
  categoryColor?: string;
  currency: string;
  hidden?: boolean;
  desktop?: boolean;
  hasSplits?: boolean;
  selected?: boolean;
  bordered?: boolean;
  showDate?: boolean;
  onSelect?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function TransactionCard({
  transaction: tx,
  accountName,
  toAccountName,
  categoryLabel,
  categoryColor,
  currency,
  hidden = false,
  desktop = false,
  hasSplits = false,
  selected = false,
  bordered = false,
  showDate = false,
  onSelect,
  onEdit,
  onDelete,
}: TransactionCardProps) {
  const displayLabel = tx.note || (hasSplits ? "Split Kategori" : categoryLabel) || accountName;
  const metaCategory = tx.isAdjustment ? "Penyesuaian saldo" : tx.debtId ? "Utang/Piutang" : categoryLabel ?? (tx.type === "income" ? "Pemasukan" : tx.type === "expense" ? "Pengeluaran" : "Transfer");
  const accountLabel = `${accountName}${toAccountName ? ` → ${toAccountName}` : ""}`;
  const tileLabel = tx.isAdjustment ? "Penyesuaian saldo" : hasSplits ? "Split Kategori" : metaCategory;
  const tileColor = tx.isAdjustment || hasSplits ? undefined : categoryColor;
  const amountColor = hidden || tx.type === "transfer"
    ? "text-[hsl(var(--muted-foreground))]"
    : tx.type === "income" ? "text-success" : "text-[hsl(var(--foreground))]";
  const amount = hidden ? "•••" : `${tx.type === "expense" ? "−" : tx.type === "income" ? "+" : ""}${formatCurrency(tx.amount, currency)}`;
  const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

  const avatar = <IconTile label={tileLabel} color={tileColor} />;

  // Desktop-only row actions: hidden until the row is hovered or focused, but always in the DOM.
  const actions = (
    <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <button type="button" onClick={onEdit} aria-label={`Edit ${displayLabel}`} title={tx.isAdjustment ? "Cocokkan kembali di Akun" : tx.debtId ? "Kelola di Utang/Piutang" : "Edit"} className={`flex h-11 w-11 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] ${focusRing}`}>
        <Pencil size={15} />
      </button>
      <button type="button" onClick={onDelete} aria-label={`Hapus ${displayLabel}`} title={tx.debtId ? "Kelola di Utang/Piutang" : "Hapus"} className={`flex h-11 w-11 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-danger/10 hover:text-danger ${focusRing}`}>
        <Trash2 size={15} />
      </button>
    </div>
  );

  if (desktop) {
    return (
      <tr className={`group border-t border-[hsl(var(--border))] ${selected ? "bg-[hsl(var(--primary))]/8" : "hover:bg-[hsl(var(--surface-2))]"}`} aria-selected={selected}>
        <td className="px-3 py-1.5">
          <button type="button" onClick={onSelect} aria-label={`Lihat detail ${displayLabel}`} aria-pressed={selected} className={`flex min-h-11 w-full items-center gap-3 rounded-xl text-left ${focusRing}`}>
            {avatar}
            <span className="min-w-0 break-words font-medium">{displayLabel}</span>
          </button>
        </td>
        <td className="px-3 py-1.5 text-[hsl(var(--muted-foreground))]">{metaCategory}</td>
        <td className="px-3 py-1.5 text-[hsl(var(--muted-foreground))]">{accountLabel}</td>
        <td className={`px-3 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap ${amountColor}`}>{amount}</td>
        <td className="px-1 py-1.5">{actions}</td>
      </tr>
    );
  }

  const bodyCls = `flex min-h-14 w-full min-w-0 items-center gap-3 px-4 py-2 text-left focus-visible:ring-inset ${focusRing}`;
  const body = (
    <>
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[hsl(var(--foreground))]">{displayLabel}</span>
        <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{metaCategory} · {accountLabel}{showDate ? ` · ${formatDate(tx.date, "dd MMM")}` : ""}</span>
      </span>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${amountColor}`}>{amount}</span>
    </>
  );

  // Mobile rows carry no inline actions: tapping opens the detail sheet, which has Edit and Hapus.
  return (
    <div className={bordered ? "overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]" : ""}>
      {onSelect
        ? <button type="button" onClick={onSelect} aria-label={`Lihat detail ${displayLabel}`} className={bodyCls}>{body}</button>
        : <div className={bodyCls}>{body}</div>}
    </div>
  );
}
