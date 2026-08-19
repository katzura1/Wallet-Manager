import { useState } from "react";
import type { ParsedTransaction } from "@/lib/geminiParser";
import type { Account, Category } from "@/types";
import { formatCurrency, TRANSACTION_TYPE_BG } from "@/lib/utils";
import { Check, Pencil, Trash2, X } from "lucide-react";

interface ChatTransactionCardProps {
  transaction: ParsedTransaction;
  accounts: Account[];
  categories: Category[];
  currency: string;
  onConfirm: (tx: ParsedTransaction) => void;
  onDelete: () => void;
}

export function ChatTransactionCard({
  transaction: initialTx,
  accounts,
  categories,
  currency,
  onConfirm,
  onDelete,
}: ChatTransactionCardProps) {
  const [tx, setTx] = useState(initialTx);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const account = accounts.find((a) => a.id === tx.accountId);
  const toAccount = tx.toAccountId ? accounts.find((a) => a.id === tx.toAccountId) : undefined;
  const category = tx.categoryId ? categories.find((c) => c.id === tx.categoryId) : undefined;

  const displayIcon = category?.icon || (tx.type === "income" ? "💰" : tx.type === "expense" ? "💸" : "↔️");
  const typeLabel = tx.type === "income" ? "Pemasukan" : tx.type === "expense" ? "Pengeluaran" : "Transfer";

  function handleSaveEdit() {
    setIsEditing(false);
    setIsSaved(true);
    onConfirm(tx);
  }

  function handleCancelEdit() {
    setTx(initialTx);
    setIsEditing(false);
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/96 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.55)] backdrop-blur-sm">
      <div className="flex gap-3 border-b border-[hsl(var(--border))] px-4 py-3">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-base flex-none ${TRANSACTION_TYPE_BG[tx.type]}`}>
          {displayIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${TRANSACTION_TYPE_BG[tx.type]}`}>
              {typeLabel}
            </span>
          </div>
          <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate leading-tight mt-1">
            {tx.note || category?.name || account?.name || "Transaksi"}
          </p>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] truncate mt-1">
            {tx.date}
          </p>
        </div>
        <div className={`font-bold text-sm flex-none self-center pl-2 ${tx.type === "income" ? "text-emerald-500" : tx.type === "expense" ? "text-red-500" : "text-amber-500"}`}>
          {tx.type === "expense" ? "-" : tx.type === "income" ? "+" : ""}
          {formatCurrency(tx.amount, currency)}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {isEditing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[hsl(var(--muted-foreground))] w-16">Tipe</label>
              <select
                value={tx.type}
                onChange={(e) => setTx({ ...tx, type: e.target.value as ParsedTransaction["type"] })}
                className="flex-1 text-sm rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5"
              >
                <option value="expense">Pengeluaran</option>
                <option value="income">Pemasukan</option>
                <option value="transfer">Transfer</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[hsl(var(--muted-foreground))] w-16">Jumlah</label>
              <input
                type="number"
                value={tx.amount}
                onChange={(e) => setTx({ ...tx, amount: Number(e.target.value) })}
                className="flex-1 text-sm rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[hsl(var(--muted-foreground))] w-16">Akun</label>
              <select
                value={tx.accountId}
                onChange={(e) => setTx({ ...tx, accountId: Number(e.target.value) })}
                className="flex-1 text-sm rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5"
              >
                {accounts.filter((a) => !a.isArchived).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[hsl(var(--muted-foreground))] w-16">Kategori</label>
              <select
                value={tx.categoryId || ""}
                onChange={(e) => setTx({ ...tx, categoryId: e.target.value ? Number(e.target.value) : undefined })}
                className="flex-1 text-sm rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5"
              >
                <option value="">Tanpa kategori</option>
                {categories.filter((c) => c.type === tx.type || c.type === "both").map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[hsl(var(--muted-foreground))] w-16">Catatan</label>
              <input
                type="text"
                value={tx.note}
                onChange={(e) => setTx({ ...tx, note: e.target.value })}
                className="flex-1 text-sm rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[hsl(var(--muted-foreground))] w-16">Tanggal</label>
              <input
                type="date"
                value={tx.date}
                onChange={(e) => setTx({ ...tx, date: e.target.value })}
                className="flex-1 text-sm rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5"
              />
            </div>
          </div>
        ) : (
          <div className="text-sm text-[hsl(var(--foreground))]">
            <p className="flex items-center gap-2">
              <span className="text-[hsl(var(--muted-foreground))]">Akun:</span>
              <span className="font-medium">{account?.name || "-"}</span>
            </p>
            {toAccount && (
              <p className="flex items-center gap-2">
                <span className="text-[hsl(var(--muted-foreground))]">Ke:</span>
                <span className="font-medium">{toAccount.name}</span>
              </p>
            )}
            {category && (
              <p className="flex items-center gap-2">
                <span className="text-[hsl(var(--muted-foreground))]">Kategori:</span>
                <span className="font-medium">{category.icon} {category.name}</span>
              </p>
            )}
            {tx.note && (
              <p className="flex items-center gap-2">
                <span className="text-[hsl(var(--muted-foreground))]">Catatan:</span>
                <span className="font-medium">{tx.note}</span>
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          {isEditing ? (
            <>
              <button
                onClick={handleCancelEdit}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 text-[hsl(var(--foreground))] px-4 py-2.5 text-sm font-medium hover:bg-[hsl(var(--surface-2))]"
              >
                <X size={16} />
                Batal
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-4 py-2.5 text-sm font-medium shadow-[0_12px_24px_-16px_hsl(var(--primary))] hover:brightness-[1.06]"
              >
                <Check size={16} />
                Simpan Edit
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                disabled={isSaved}
                className="flex items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 text-[hsl(var(--foreground))] px-4 py-2.5 text-sm font-medium hover:bg-[hsl(var(--surface-2))] disabled:opacity-50 disabled:pointer-events-none"
              >
                <Pencil size={16} />
                Edit
              </button>
              <button
                onClick={onDelete}
                disabled={isSaved}
                className="flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 text-red-600 px-4 py-2.5 text-sm font-medium hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900 disabled:opacity-50 disabled:pointer-events-none"
              >
                <Trash2 size={16} />
                Hapus
              </button>
              <button
                onClick={() => {
                  setIsSaved(true);
                  onConfirm(tx);
                }}
                disabled={isSaved}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-4 py-2.5 text-sm font-medium shadow-[0_12px_24px_-16px_hsl(var(--primary))] hover:brightness-[1.06] disabled:opacity-50 disabled:pointer-events-none"
              >
                <Check size={16} />
                {isSaved ? "Tersimpan" : "Simpan"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
