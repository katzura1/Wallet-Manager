import { useState, useEffect } from "react";
import { Button, Input, Select, Textarea, Modal } from "@/components/ui";
import { todayISO, formatNumberWithSeparator } from "@/lib/utils";
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

const QUICK_NOTE_PRESETS: Record<Exclude<TxType, "transfer">, string[]> = {
  expense: ["Patungan", "Talang dulu", "Bayarin dulu"],
  income: ["Reimburse", "Patungan balik", "Diganti teman"],
};

interface StoredTransactionDefaults {
  lastType?: TxType;
  expense?: {
    accountId?: string;
    categoryId?: string;
  };
  income?: {
    accountId?: string;
    categoryId?: string;
  };
  transfer?: {
    accountId?: string;
    toAccountId?: string;
  };
}

const TX_DEFAULTS_KEY = "wallet_tx_defaults";

function readTransactionDefaults(): StoredTransactionDefaults {
  try {
    const raw = localStorage.getItem(TX_DEFAULTS_KEY);
    return raw ? JSON.parse(raw) as StoredTransactionDefaults : {};
  } catch {
    return {};
  }
}

function writeTransactionDefaults(data: StoredTransactionDefaults) {
  localStorage.setItem(TX_DEFAULTS_KEY, JSON.stringify(data));
}

export function TransactionForm({ open, onClose, onSaved, accounts, categories, existing, defaultType }: TransactionFormProps) {
  const [type, setType] = useState<TxType>(existing?.type ?? defaultType ?? "expense");
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

  useEffect(() => {
    if (!open) return;

    if (existing) {
      setType(existing.type);
      setAmount(String(existing.amount));
      setAccountId(String(existing.accountId));
      setToAccountId(String(existing.toAccountId ?? ""));
      setCategoryId(String(existing.categoryId ?? ""));
      setDate(existing.date);
      setNote(existing.note ?? "");
      setSplitMode(false);
      setSplits([{ categoryId: "", amount: "" }]);
      setError("");
      return;
    }

    const stored = readTransactionDefaults();
    const nextType = defaultType ?? stored.lastType ?? "expense";
    const accountExists = (value?: string) => !!value && accounts.some((account) => String(account.id) === value);
    const categoryExists = (value?: string) => !!value && categories.some((category) => String(category.id) === value);
    const defaultAccountId = String(accounts[0]?.id ?? "");

    if (nextType === "transfer") {
      const fromAccount = accountExists(stored.transfer?.accountId) ? stored.transfer?.accountId! : defaultAccountId;
      const toAccount = accountExists(stored.transfer?.toAccountId) && stored.transfer?.toAccountId !== fromAccount
        ? stored.transfer?.toAccountId!
        : String(accounts.find((account) => String(account.id) !== fromAccount)?.id ?? "");
      setType("transfer");
      setAccountId(fromAccount);
      setToAccountId(toAccount);
      setCategoryId("");
    } else {
      const defaults = stored[nextType];
      setType(nextType);
      setAccountId(accountExists(defaults?.accountId) ? defaults?.accountId! : defaultAccountId);
      setToAccountId("");
      setCategoryId(categoryExists(defaults?.categoryId) ? defaults?.categoryId! : "");
    }

    setAmount("");
    setDate(todayISO());
    setNote("");
    setSplitMode(false);
    setSplits([{ categoryId: "", amount: "" }]);
    setError("");
  }, [open, existing, defaultType, accounts, categories]);

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
  const notePresets = type === "transfer" ? [] : QUICK_NOTE_PRESETS[type];

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

      if (!existing) {
        const stored = readTransactionDefaults();
        const nextStored: StoredTransactionDefaults = {
          ...stored,
          lastType: type,
        };

        if (type === "transfer") {
          nextStored.transfer = {
            accountId,
            toAccountId,
          };
        } else {
          nextStored[type] = {
            accountId,
            categoryId: splitMode ? undefined : categoryId,
          };
        }

        writeTransactionDefaults(nextStored);
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
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-4 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Transaction Setup</p>
            <p className="mt-1 text-sm text-[hsl(var(--foreground))]">
              Pilih tipe, akun, dan kategori. Semua perubahan tetap mengikuti flow transaksi yang sama.
            </p>
          </div>
        {/* Type Toggle */}
        <div className="flex rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/70 p-1 overflow-hidden">
          {typeButtons.map(({ t, label, cls }) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setSplitMode(false);
                setError("");
              }}
              className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors ${
                type === t ? cls : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Jumlah"
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={formatNumberWithSeparator(amount)}
            onChange={(e) => {
              const cleanValue = e.target.value.replace(/\D/g, "");
              setAmount(cleanValue);
              setError("");
            }}
            error={error}
          />

          <Input label="Tanggal" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/70 p-4 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Account Flow</p>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Tentukan akun sumber dan tujuan transaksi.</p>
          </div>

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
        </div>

        {type !== "transfer" && (
          <div className="flex items-center justify-between gap-3 rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Kategori</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Aktifkan split jika satu transaksi dibagi ke beberapa kategori.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSplitMode((v) => !v);
                setError("");
              }}
              className={`text-xs font-medium px-3 py-2 rounded-full border transition-colors ${
                splitMode
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]"
                  : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
              }`}
            >
              ✂️ Split Kategori
            </button>
          </div>
        )}

        {type !== "transfer" && !splitMode && (
          <div className="space-y-2">
            <Select label="Kategori" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">-- Pilih Kategori --</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              Untuk patungan atau reimburse, catat pemasukan pengganti dengan kategori yang sama supaya laporan menghitung pengeluaran bersih.
            </p>
          </div>
        )}

        {splitMode && type !== "transfer" && (
          <div className="space-y-3 rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[hsl(var(--foreground))]">Split Kategori</span>
              <span className={`text-xs font-medium ${Math.abs(splitsTotal - amountNum) < 0.01 ? "text-emerald-500" : "text-red-500"}`}>
                {splitsTotal.toLocaleString("id-ID")} / {amountNum.toLocaleString("id-ID")}
              </span>
            </div>
            {splits.map((row, i) => (
              <div key={i} className="flex gap-2 items-start rounded-2xl bg-[hsl(var(--surface-2))] p-3">
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
                    type="text"
                    inputMode="numeric"
                    placeholder="Jumlah"
                    value={formatNumberWithSeparator(row.amount)}
                    onChange={(e) => {
                      const cleanValue = e.target.value.replace(/\D/g, "");
                      updateSplitRow(i, "amount", cleanValue);
                    }}
                  />
                </div>
                {splits.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSplitRow(i)}
                    className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 text-red-400 hover:text-red-600 text-lg leading-none"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addSplitRow}
              className="text-xs font-medium text-[hsl(var(--primary))] hover:underline"
            >
              + Tambah Baris
            </button>
          </div>
        )}

        <div className="space-y-2">
          <Textarea label="Catatan (opsional)" placeholder="Tambah catatan..." rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          {notePresets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {notePresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setNote(preset)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${note === preset ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Menyimpan..." : existing ? "Simpan Perubahan" : "Tambah Transaksi"}
        </Button>
      </form>
    </Modal>
  );
}
