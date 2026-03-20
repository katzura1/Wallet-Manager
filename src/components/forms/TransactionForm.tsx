import { useState, useEffect } from "react";
import { Button, Input, Select, Textarea, Modal } from "@/components/ui";
import { todayISO } from "@/lib/utils";
import { addTransaction, addTransfer, updateTransaction } from "@/db/transactions";
import { db } from "@/db/db";
import type { Account, Category, Transaction } from "@/types";

interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  accounts: Account[];
  categories: Category[];
  existing?: Transaction;
  defaultType?: Transaction["type"];
}

type TxType = "income" | "expense" | "transfer";

interface SplitRow {
  categoryId: string;
  amount: string;
}

export function TransactionForm({ open, onClose, onSaved, accounts, categories, existing, defaultType = "expense" }: TransactionFormProps) {
  const [type, setType] = useState<TxType>(existing?.type ?? defaultType);
  const [amount, setAmount] = useState(String(existing?.amount ?? ""));
  const [accountId, setAccountId] = useState(String(existing?.accountId ?? accounts[0]?.id ?? ""));
  const [toAccountId, setToAccountId] = useState(String(existing?.toAccountId ?? ""));
  const [categoryId, setCategoryId] = useState(String(existing?.categoryId ?? ""));
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [note, setNote] = useState(existing?.note ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([{ categoryId: "", amount: "" }]);

  // Load existing splits when editing a split transaction
  useEffect(() => {
    if (!existing?.id) return;
    db.transactionSplits.where("transactionId").equals(existing.id).toArray().then((rows) => {
      if (rows.length > 0) {
        setSplitMode(true);
        setSplits(rows.map((r) => ({ categoryId: String(r.categoryId), amount: String(r.amount) })));
      }
    });
  }, [existing?.id]);

  const filteredCategories = categories.filter((c) => c.type === type || c.type === "both");
  const splitsTotal = splits.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const amountNum = Number(amount);

  function addSplitRow() {
    setSplits((prev) => [...prev, { categoryId: "", amount: "" }]);
  }
  function removeSplitRow(i: number) {
    setSplits((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateSplitRow(i: number, field: keyof SplitRow, value: string) {
    setSplits((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amountNum || amountNum <= 0) {
      setError("Jumlah harus lebih dari 0");
      return;
    }
    if (!accountId) {
      setError("Pilih akun");
      return;
    }
    if (type === "transfer" && (!toAccountId || toAccountId === accountId)) {
      setError("Pilih akun tujuan yang berbeda");
      return;
    }
    if (splitMode && type !== "transfer") {
      if (splits.some((r) => !r.categoryId || !Number(r.amount))) {
        setError("Isi semua baris split");
        return;
      }
      if (Math.abs(splitsTotal - amountNum) > 0.01) {
        setError(`Total split (${splitsTotal}) harus sama dengan jumlah (${amountNum})`);
        return;
      }
    }

    setLoading(true);
    try {
      if (existing?.id) {
        await updateTransaction(existing.id, {
          type,
          amount: amountNum,
          accountId: Number(accountId),
          toAccountId: type === "transfer" ? Number(toAccountId) : undefined,
          categoryId: splitMode ? undefined : categoryId ? Number(categoryId) : undefined,
          date,
          note,
        });
        // Update splits: delete old rows then re-insert
        await db.transactionSplits.where("transactionId").equals(existing.id).delete();
        if (splitMode && type !== "transfer") {
          await db.transactionSplits.bulkAdd(
            splits.map((r) => ({
              transactionId: existing.id!,
              categoryId: Number(r.categoryId),
              amount: Number(r.amount),
              note: "",
            })),
          );
        }
      } else if (type === "transfer") {
        await addTransfer(Number(accountId), Number(toAccountId), amountNum, date, note);
      } else if (splitMode) {
        const txId = await addTransaction({
          type,
          amount: amountNum,
          accountId: Number(accountId),
          date,
          note,
        });
        await db.transactionSplits.bulkAdd(
          splits.map((r) => ({
            transactionId: txId as number,
            categoryId: Number(r.categoryId),
            amount: Number(r.amount),
            note: "",
          })),
        );
      } else {
        await addTransaction({
          type,
          amount: amountNum,
          accountId: Number(accountId),
          categoryId: categoryId ? Number(categoryId) : undefined,
          date,
          note,
        });
      }
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const typeButtons: { t: TxType; label: string; cls: string }[] = [
    { t: "expense", label: "Pengeluaran", cls: "bg-red-500 text-white" },
    { t: "income", label: "Pemasukan", cls: "bg-emerald-500 text-white" },
    { t: "transfer", label: "Transfer", cls: "bg-amber-500 text-white" },
  ];

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit Transaksi" : "Tambah Transaksi"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type Toggle */}
        <div className="flex rounded-xl border border-[hsl(var(--border))] overflow-hidden">
          {typeButtons.map(({ t, label, cls }) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setSplitMode(false);
                setError("");
              }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                type === t ? cls : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Input
          label="Jumlah"
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError("");
          }}
          error={error}
        />

        <Select label={type === "transfer" ? "Dari Akun" : "Akun"} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">-- Pilih Akun --</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon} {a.name}
            </option>
          ))}
        </Select>

        {type === "transfer" && (
          <Select label="Ke Akun" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            <option value="">-- Pilih Akun Tujuan --</option>
            {accounts
              .filter((a) => String(a.id) !== accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                </option>
              ))}
          </Select>
        )}

        {type !== "transfer" && (
          <button
            type="button"
            onClick={() => {
              setSplitMode((v) => !v);
              setError("");
            }}
            className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
              splitMode
                ? "bg-indigo-600 text-white border-indigo-600"
                : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
            }`}
          >
            ✂️ Split Kategori
          </button>
        )}

        {type !== "transfer" && !splitMode && (
          <Select label="Kategori" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">-- Pilih Kategori --</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        )}

        {splitMode && type !== "transfer" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[hsl(var(--foreground))]">Split Kategori</span>
              <span className={`text-xs font-medium ${Math.abs(splitsTotal - amountNum) < 0.01 ? "text-emerald-500" : "text-red-500"}`}>
                {splitsTotal.toLocaleString("id-ID")} / {amountNum.toLocaleString("id-ID")}
              </span>
            </div>
            {splits.map((row, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1">
                  <Select value={row.categoryId} onChange={(e) => updateSplitRow(i, "categoryId", e.target.value)}>
                    <option value="">-- Kategori --</option>
                    {filteredCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-28">
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="Jumlah"
                    value={row.amount}
                    onChange={(e) => updateSplitRow(i, "amount", e.target.value)}
                  />
                </div>
                {splits.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSplitRow(i)}
                    className="mt-1 text-red-400 hover:text-red-600 text-lg leading-none"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addSplitRow}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              + Tambah Baris
            </button>
          </div>
        )}

        <Input label="Tanggal" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        <Textarea label="Catatan (opsional)" placeholder="Tambah catatan..." rows={2} value={note} onChange={(e) => setNote(e.target.value)} />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Menyimpan..." : existing ? "Simpan Perubahan" : "Tambah Transaksi"}
        </Button>
      </form>
    </Modal>
  );
}
