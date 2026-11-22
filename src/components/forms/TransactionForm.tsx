import { useState, useEffect, useRef } from "react";
import { Button, Input, Select, Textarea, Modal, SegmentedControl } from "@/components/ui";
import { todayISO, formatNumberWithSeparator, formatCurrency } from "@/lib/utils";
import { addTransaction, addTransfer, updateTransaction } from "@/db/transactions";
import { db } from "@/db/db";
import { useSettingsStore } from "@/stores/walletStore";
import type { Account, Category, Transaction } from "@/types";

interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  accounts: Account[];
  categories: Category[];
  existing?: Transaction;
  defaultType?: Transaction["type"];
  hideBalances?: boolean;
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

function resolveDefaultAccounts(stored: StoredTransactionDefaults, type: TxType, accounts: Account[]) {
  const exists = (value?: string) => !!value && accounts.some((account) => String(account.id) === value);
  const first = String(accounts[0]?.id ?? "");
  if (type === "transfer") {
    const from = exists(stored.transfer?.accountId) ? (stored.transfer?.accountId ?? first) : first;
    const to = exists(stored.transfer?.toAccountId) && stored.transfer?.toAccountId !== from
      ? (stored.transfer?.toAccountId ?? "")
      : String(accounts.find((account) => String(account.id) !== from)?.id ?? "");
    return { from, to };
  }
  const saved = stored[type]?.accountId;
  return { from: exists(saved) ? (saved ?? first) : first, to: "" };
}

function writeTransactionDefaults(data: StoredTransactionDefaults) {
  localStorage.setItem(TX_DEFAULTS_KEY, JSON.stringify(data));
}

export function TransactionForm({ open, onClose, onSaved, accounts, categories, existing, defaultType, hideBalances }: TransactionFormProps) {
  const { currency } = useSettingsStore();
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

  const typeRef = useRef(type);
  useEffect(() => { typeRef.current = type; }, [type]);
  const categoryTouched = useRef(false);
  const prevRef = useRef<{ open: boolean; existing?: Transaction; defaultType?: Transaction["type"] }>({ open: false });

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { open, existing, defaultType };
    if (!open) return;
    // Full reset only when the form opens or its target changes; later account/category
    // loads must not wipe what the user already typed.
    const fullReset = !prev.open || prev.existing !== existing || prev.defaultType !== defaultType;

    if (!fullReset) {
      if (existing) return;
      const storedNow = readTransactionDefaults();
      const resolved = resolveDefaultAccounts(storedNow, typeRef.current, accounts);
      const hasAccount = (value: string) => accounts.some((account) => String(account.id) === value);
      setAccountId((cur) => (hasAccount(cur) ? cur : resolved.from));
      if (typeRef.current === "transfer") {
        setToAccountId((cur) => (hasAccount(cur) ? cur : resolved.to));
      } else if (!categoryTouched.current) {
        const storedCategory = storedNow[typeRef.current]?.categoryId;
        setCategoryId((cur) => (cur || !storedCategory || !categories.some((category) => String(category.id) === storedCategory) ? cur : storedCategory));
      }
      return;
    }

    categoryTouched.current = false;

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
    const categoryExists = (value?: string) => !!value && categories.some((category) => String(category.id) === value);
    const resolved = resolveDefaultAccounts(stored, nextType, accounts);

    if (nextType === "transfer") {
      setType("transfer");
      setAccountId(resolved.from);
      setToAccountId(resolved.to);
      setCategoryId("");
    } else {
      const defaults = stored[nextType];
      setType(nextType);
      setAccountId(resolved.from);
      setToAccountId("");
      setCategoryId(categoryExists(defaults?.categoryId) ? (defaults?.categoryId ?? "") : "");
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
  const fromAccount = accounts.find((a) => String(a.id) === accountId);
  const toAccount = accounts.find((a) => String(a.id) === toAccountId);
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
      await db.transaction("rw", db.transactions, db.transactionSplits, db.accounts, async () => {
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
      });

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

  const showTransferPreview = type === "transfer" && !existing && amountNum > 0 && !!fromAccount && !!toAccount;

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit Transaksi" : "Tambah Transaksi"}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <SegmentedControl
          label="Jenis transaksi"
          value={type}
          options={[{ value: "expense", label: "Keluar" }, { value: "income", label: "Masuk" }, { value: "transfer", label: "Transfer" }]}
          onChange={(t) => {
            setType(t);
            setSplitMode(false);
            if (t === "transfer" || !categories.some((c) => String(c.id) === categoryId && (c.type === t || c.type === "both"))) { categoryTouched.current = true; setCategoryId(""); }
            setError("");
          }}
        />

        <div className="space-y-1 text-center">
          <input
            type="text"
            inputMode="numeric"
            aria-label="Jumlah"
            placeholder="0"
            value={formatNumberWithSeparator(amount)}
            onChange={(e) => {
              setAmount(e.target.value.replace(/\D/g, ""));
              setError("");
            }}
            className="w-full bg-transparent text-center text-4xl font-semibold tabular-nums tracking-tight placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none"
          />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>

        {type !== "transfer" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p id="tx-category-label" className="text-sm font-semibold">Kategori</p>
              <button
                type="button"
                aria-pressed={splitMode}
                onClick={() => {
                  setSplitMode((v) => !v);
                  setError("");
                }}
                className={`min-h-11 rounded-full border px-3.5 text-xs font-medium transition-colors ${
                  splitMode
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                    : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]"
                }`}
              >
                ✂️ Split Kategori
              </button>
            </div>
            {!splitMode && (
              <>
                <div role="radiogroup" aria-labelledby="tx-category-label" className="grid grid-cols-3 gap-2">
                  {filteredCategories.map((c) => {
                    const checked = categoryId === String(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => { categoryTouched.current = true; setCategoryId(checked ? "" : String(c.id)); }}
                        className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${checked ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/8" : "border-[hsl(var(--border))] bg-[hsl(var(--card))]"}`}
                      >
                        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full text-lg" style={{ background: `${c.color}22` }}>{c.icon}</span>
                        <span className="line-clamp-1 text-xs font-medium">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                  Untuk patungan atau reimburse, catat pemasukan pengganti dengan kategori yang sama supaya laporan menghitung pengeluaran bersih.
                </p>
              </>
            )}
          </div>
        )}

        {splitMode && type !== "transfer" && (
          <div className="space-y-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[hsl(var(--foreground))]">Split Kategori</span>
              <span className={`text-xs font-medium tabular-nums ${Math.abs(splitsTotal - amountNum) < 0.01 ? "text-success" : "text-danger"}`}>
                {splitsTotal.toLocaleString("id-ID")} / {amountNum.toLocaleString("id-ID")}
              </span>
            </div>
            {splits.map((row, i) => (
              <div key={i} className="flex items-start gap-2 rounded-2xl bg-[hsl(var(--surface-2))] p-3">
                <div className="flex-1">
                  <Select aria-label={`Kategori split ${i + 1}`} value={row.categoryId} onChange={(e) => updateSplitRow(i, "categoryId", e.target.value)}>
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
                    aria-label={`Jumlah split ${i + 1}`}
                    type="text"
                    inputMode="numeric"
                    placeholder="Jumlah"
                    value={formatNumberWithSeparator(row.amount)}
                    onChange={(e) => updateSplitRow(i, "amount", e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                {splits.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Hapus baris split ${i + 1}`}
                    onClick={() => removeSplitRow(i)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-lg leading-none text-danger hover:bg-danger/10"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addSplitRow}
              className="min-h-11 text-xs font-medium text-[hsl(var(--primary))] hover:underline"
            >
              + Tambah Baris
            </button>
          </div>
        )}

        <div className="space-y-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
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

          {showTransferPreview && fromAccount && toAccount && (
            <dl aria-label="Pratinjau saldo" className="space-y-2 rounded-xl bg-[hsl(var(--surface-2))] p-3 text-sm">
              {[{ acc: fromAccount, after: fromAccount.currentBalance - amountNum }, { acc: toAccount, after: toAccount.currentBalance + amountNum }].map(({ acc, after }) => (
                <div key={acc.id} className="flex items-center justify-between gap-3">
                  <dt className="min-w-0 truncate text-[hsl(var(--muted-foreground))]">{acc.name}</dt>
                  <dd className="shrink-0 tabular-nums">{hideBalances ? "•••" : formatCurrency(acc.currentBalance, currency)} → <span className="font-semibold">{hideBalances ? "•••" : formatCurrency(after, currency)}</span></dd>
                </div>
              ))}
            </dl>
          )}

          <Input label="Tanggal" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

          <div className="space-y-2">
            <Textarea label="Catatan (opsional)" placeholder="Tambah catatan..." rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            {notePresets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {notePresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNote(preset)}
                    className={`min-h-11 rounded-full border px-3.5 text-xs transition-colors ${note === preset ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Menyimpan..." : "Simpan"}
        </Button>
      </form>
    </Modal>
  );
}
