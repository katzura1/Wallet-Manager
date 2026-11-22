import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, Check, ChevronLeft, ChevronRight, MessageSquare, X } from "lucide-react";
import { IconTile, Modal, Sheet, SegmentedControl } from "@/components/ui";
import { cn, todayISO, formatNumberWithSeparator, formatCurrency, readBalanceHidden } from "@/lib/utils";
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
  /** Opens the AI entry form; the link is hidden when omitted. */
  onUseAI?: () => void;
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

export function TransactionForm({ open, onClose, onSaved, accounts, categories, existing, defaultType, hideBalances, onUseAI }: TransactionFormProps) {
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
  const [splitView, setSplitView] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([{ categoryId: "", amount: "" }]);
  const [picker, setPicker] = useState<null | "from" | "to">(null);

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
      setSplitView(false);
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
    setSplitView(false);
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
  const hidden = hideBalances ?? readBalanceHidden();
  const money = (value: number) => (hidden ? "•••" : formatCurrency(value, currency));
  const categoryById = (id: string) => categories.find((c) => String(c.id) === id);
  const remainder = amountNum - splitsTotal;
  const isTransfer = type === "transfer";
  const canSplit = !isTransfer;
  const amountText = formatNumberWithSeparator(amount);

  const largestSplit = splits.reduce<number>((best, row, i) => (row.categoryId && (best < 0 || Number(row.amount) > Number(splits[best].amount)) ? i : best), -1);
  const fillTarget = largestSplit >= 0 ? categoryById(splits[largestSplit].categoryId) : undefined;

  function pickAccount(target: "from" | "to", id: string) {
    if (target === "from") {
      if (id === toAccountId) setToAccountId(accountId);
      setAccountId(id);
    } else {
      setToAccountId(id);
    }
    setPicker(null);
  }

  function swapAccounts() {
    setAccountId(toAccountId);
    setToAccountId(accountId);
  }

  const rowCls = "flex min-h-[52px] items-center gap-3 px-4 text-left";
  const labelCls = "w-[72px] shrink-0 text-sm text-[hsl(var(--muted-foreground))]";

  const inSplitView = splitView && splitMode && canSplit;
  const footer = inSplitView ? (
    <div className="flex flex-col gap-2">
      {remainder > 0.01 && amountNum > 0 && fillTarget && (
        <button
          type="button"
          onClick={() => updateSplitRow(largestSplit, "amount", String(Number(splits[largestSplit].amount || 0) + remainder))}
          className="min-h-11 rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        >
          Masukkan sisa {formatCurrency(remainder, currency)} ke {fillTarget.name}
        </button>
      )}
      <button type="submit" form="tx-form" disabled={loading} className="h-[54px] rounded-2xl bg-[hsl(var(--primary))] text-base font-bold text-[hsl(var(--primary-foreground))] shadow-sm hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50">
        {loading ? "Menyimpan..." : "Simpan split"}
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      {onUseAI && !existing && (
        <button type="button" onClick={onUseAI} className="hidden h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] lg:flex">
          <MessageSquare size={16} aria-hidden="true" />Pakai AI
        </button>
      )}
      <span className="hidden flex-1 lg:block" />
      {canSplit && !splitMode && (
        <button
          type="button"
          onClick={() => { setSplitMode(true); setSplitView(true); setError(""); }}
          className="h-[52px] rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-sm font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] lg:h-11 lg:rounded-xl"
        >
          Split
        </button>
      )}
      <button type="submit" form="tx-form" disabled={loading} className={cn("h-[52px] flex-1 rounded-2xl bg-[hsl(var(--primary))] text-[15px] font-bold text-[hsl(var(--primary-foreground))] shadow-sm hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50 lg:h-11 lg:flex-none lg:rounded-xl lg:px-6 lg:text-sm", isTransfer && "lg:px-8")}>
        {loading ? "Menyimpan..." : isTransfer ? "Simpan transfer" : "Simpan"}
      </button>
    </div>
  );

  const accountCard = (target: "from" | "to") => {
    const acc = target === "from" ? fromAccount : toAccount;
    const after = acc ? (target === "from" ? acc.currentBalance - amountNum : acc.currentBalance + amountNum) : 0;
    return (
      <button
        type="button"
        onClick={() => setPicker(target)}
        aria-label={`${target === "from" ? "Dari akun" : "Ke akun"}: ${acc?.name ?? "belum dipilih"}`}
        className="flex w-full items-center gap-3 rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      >
        {acc ? <IconTile label={acc.name} color={acc.color} /> : <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-xl border border-dashed border-[hsl(var(--border))]" />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{target === "from" ? "Dari" : "Ke"}</span>
          <span className="truncate text-[15px] font-bold">{acc?.name ?? "Pilih akun"}</span>
        </span>
        {acc && (
          <span className="flex shrink-0 flex-col items-end text-[13px] tabular-nums text-[hsl(var(--muted-foreground))]">
            <span>{money(acc.currentBalance)}</span>
            {showTransferPreview && <span className="font-semibold text-[hsl(var(--foreground))]">→ {money(after)}</span>}
          </span>
        )}
      </button>
    );
  };

  const pickerAccounts = picker === "to" ? accounts.filter((a) => String(a.id) !== accountId) : accounts;
  const pickerValue = picker === "to" ? toAccountId : accountId;
  const pickerTitle = isTransfer ? (picker === "to" ? "Ke akun" : "Dari akun") : "Pilih akun";

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={inSplitView ? "Bagi ke beberapa kategori" : existing ? "Edit transaksi" : "Catat transaksi"}
        closePosition="left"
        wide
        footer={footer}
        headerAction={onUseAI && !existing && !inSplitView ? (
          <button type="button" onClick={onUseAI} className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-[hsl(var(--primary))]/10 px-3 text-[13px] font-bold text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] lg:hidden">
            <MessageSquare size={16} aria-hidden="true" />Pakai AI
          </button>
        ) : undefined}
      >
        <form id="tx-form" onSubmit={handleSubmit} className="space-y-4">
          {inSplitView ? (
            <>
              <button type="button" onClick={() => { setSplitView(false); setError(""); }} className="-ml-1 flex min-h-11 items-center gap-1 rounded-xl pr-3 text-sm font-semibold text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
                <ChevronLeft size={18} aria-hidden="true" />Kembali ke form
              </button>

              <section aria-label="Total" className="flex flex-col gap-2.5 rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-[hsl(var(--muted-foreground))]">{type === "income" ? "Total pemasukan" : "Total pengeluaran"}</span>
                  <span className="min-w-0 truncate text-[22px] font-extrabold tabular-nums">{formatCurrency(amountNum, currency)}</span>
                </div>
                <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-[hsl(var(--surface-2))]" aria-hidden="true">
                  {amountNum > 0 && splits.map((row, i) => {
                    const value = Number(row.amount) || 0;
                    if (value <= 0) return null;
                    return <div key={i} style={{ width: `${Math.min(100, (value / amountNum) * 100)}%`, background: categoryById(row.categoryId)?.color ?? "hsl(var(--muted-foreground))" }} />;
                  })}
                </div>
                {amountNum <= 0 ? (
                  <span className="text-[13px] font-semibold text-warning">Isi jumlah di form dulu sebelum membagi</span>
                ) : Math.abs(remainder) < 0.01 ? (
                  <span className="text-[13px] font-semibold text-success">Semua sudah dibagi</span>
                ) : remainder > 0 ? (
                  <span className="text-[13px] font-semibold text-warning">Belum dibagi: {formatCurrency(remainder, currency)}</span>
                ) : (
                  <span className="text-[13px] font-semibold text-danger">Kelebihan: {formatCurrency(-remainder, currency)}</span>
                )}
                <span className="text-[13px] tabular-nums text-[hsl(var(--muted-foreground))]">{splitsTotal.toLocaleString("id-ID")} / {amountNum.toLocaleString("id-ID")}</span>
              </section>

              {error && <p role="alert" className="text-sm text-danger">{error}</p>}

              <div className="flex flex-col gap-2">
                {splits.map((row, i) => {
                  const cat = categoryById(row.categoryId);
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-3">
                      <span aria-hidden="true" className="h-9 w-2.5 shrink-0 rounded-full" style={{ background: cat?.color ?? "hsl(var(--surface-3))" }} />
                      <div className="relative min-w-0 flex-1">
                        <span className="block text-xs text-[hsl(var(--muted-foreground))]">Kategori</span>
                        <span className={cn("block truncate text-[15px] font-semibold", !cat && "text-[hsl(var(--muted-foreground))]")}>{cat?.name ?? "Pilih kategori"}</span>
                        <select
                          aria-label={`Kategori split ${i + 1}`}
                          value={row.categoryId}
                          onChange={(e) => updateSplitRow(i, "categoryId", e.target.value)}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        >
                          <option value="">-- Kategori --</option>
                          {filteredCategories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <input
                        aria-label={`Jumlah split ${i + 1}`}
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatNumberWithSeparator(row.amount)}
                        onChange={(e) => updateSplitRow(i, "amount", e.target.value.replace(/\D/g, ""))}
                        className="h-11 w-[104px] shrink-0 rounded-[10px] border border-[hsl(var(--border))] bg-transparent px-2.5 text-right text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                      />
                      {splits.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Hapus baris split ${i + 1}`}
                          onClick={() => removeSplitRow(i)}
                          className="flex h-11 w-9 shrink-0 items-center justify-center rounded-[10px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <button type="button" onClick={addSplitRow} className="h-12 rounded-2xl border-[1.5px] border-dashed border-[hsl(var(--border))] text-sm font-semibold text-[hsl(var(--primary))] hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
                  + Tambah kategori
                </button>
              </div>

              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Untuk patungan atau reimburse, catat pemasukan pengganti dengan kategori yang sama supaya laporan menghitung pengeluaran bersih.
              </p>
            </>
          ) : (
            <div className={cn("grid gap-4", !isTransfer && "lg:grid-cols-2 lg:grid-rows-[auto_auto_1fr] lg:gap-x-5")}>
              <SegmentedControl
                label="Jenis transaksi"
                value={type}
                options={[{ value: "expense", label: "Keluar" }, { value: "income", label: "Masuk" }, { value: "transfer", label: "Transfer" }]}
                onChange={(t) => {
                  setType(t);
                  setSplitMode(false);
                  setSplitView(false);
                  if (t === "transfer") {
                    const stored = resolveDefaultAccounts(readTransactionDefaults(), "transfer", accounts);
                    const from = accountId || stored.from;
                    setAccountId(from);
                    if (!toAccountId || toAccountId === from) setToAccountId(stored.to !== from && stored.to ? stored.to : String(accounts.find((a) => String(a.id) !== from)?.id ?? ""));
                  }
                  if (t === "transfer" || !categories.some((c) => String(c.id) === categoryId && (c.type === t || c.type === "both"))) { categoryTouched.current = true; setCategoryId(""); }
                  setError("");
                }}
              />

              <div>
                <label className="flex cursor-text flex-col items-center gap-1 py-2 lg:items-start lg:rounded-[14px] lg:border-2 lg:border-[hsl(var(--primary))] lg:px-3.5 lg:py-3">
                  <span className="text-[13px] font-medium text-[hsl(var(--muted-foreground))] lg:text-xs lg:font-normal">{isTransfer ? "Jumlah dipindah" : "Jumlah"}</span>
                  <span className="flex max-w-full items-baseline justify-center gap-2 lg:justify-start">
                    <span aria-hidden="true" className="text-2xl font-bold text-[hsl(var(--muted-foreground))] lg:text-lg">Rp</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="Jumlah"
                      data-autofocus={!existing || undefined}
                      placeholder="0"
                      value={amountText}
                      onChange={(e) => {
                        setAmount(e.target.value.replace(/\D/g, ""));
                        setError("");
                      }}
                      style={{ width: `${Math.max(amountText.length, 1) + 0.5}ch` }}
                      className="min-w-[1.5ch] max-w-full bg-transparent p-0 text-[44px] font-extrabold leading-tight tracking-tight tabular-nums placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none lg:text-[28px]"
                    />
                  </span>
                </label>
                {error && <p role="alert" className="mt-1 text-center text-sm text-danger lg:text-left">{error}</p>}
              </div>

              {!isTransfer && (
                <section aria-labelledby="tx-category-label" className="flex flex-col gap-2 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:gap-2.5">
                  <div className="flex items-center justify-between">
                    <h2 id="tx-category-label" className="text-[13px] font-bold text-[hsl(var(--foreground))] lg:text-xs lg:uppercase lg:tracking-wider lg:text-[hsl(var(--muted-foreground))]">Kategori</h2>
                    {!amount.trim() && !note.trim() && <Link to="/categories" onClick={onClose} className="flex min-h-11 items-center text-[13px] font-semibold text-[hsl(var(--primary))] hover:underline lg:hidden">Kelola</Link>}
                  </div>
                  {splitMode ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-4 pr-2">
                      <button type="button" onClick={() => setSplitView(true)} className="flex min-h-14 min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
                        <span className="min-w-0 flex-1 truncate">Split · {splits.length} kategori</span>
                        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-[hsl(var(--muted-foreground))]" />
                      </button>
                      <button type="button" onClick={() => { setSplitMode(false); setError(""); }} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-danger hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">Hapus split</button>
                    </div>
                  ) : filteredCategories.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">Belum ada kategori. Tambah lewat Kelola kategori.</p>
                  ) : (
                    <div role="radiogroup" aria-labelledby="tx-category-label" className="grid grid-cols-4 gap-2 lg:grid-cols-3 lg:content-start">
                      {filteredCategories.map((c) => {
                        const checked = categoryId === String(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            onClick={() => { categoryTouched.current = true; setCategoryId(checked ? "" : String(c.id)); }}
                            className={cn(
                              "flex h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-[14px] bg-[hsl(var(--card))] px-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] lg:h-[60px] lg:rounded-xl",
                              checked ? "border-2 border-[hsl(var(--primary))]" : "border border-[hsl(var(--border))]",
                            )}
                          >
                            <IconTile label={c.name} color={c.color} className="h-7 w-7 rounded-[9px] text-[11px] lg:h-6 lg:w-6 lg:rounded-[7px] lg:text-[9px]" />
                            <span className="w-full truncate text-[11px] font-semibold lg:text-xs">{c.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {isTransfer && (
                <div className="relative flex flex-col gap-2">
                  {accountCard("from")}
                  <button
                    type="button"
                    onClick={swapAccounts}
                    disabled={!toAccountId}
                    aria-label="Tukar arah"
                    className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-[hsl(var(--background))] bg-[hsl(var(--foreground))] text-[hsl(var(--background))] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  >
                    <ArrowUpDown size={16} aria-hidden="true" />
                  </button>
                  {accountCard("to")}
                </div>
              )}

              <div className="flex flex-col gap-2 lg:self-start">
                <section aria-label="Detail" className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] lg:rounded-2xl">
                  {!isTransfer && (
                    <button type="button" onClick={() => setPicker("from")} className={cn(rowCls, "w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]")}>
                      <span className={labelCls}>Akun</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{fromAccount ? `${fromAccount.name} · ${money(fromAccount.currentBalance)}` : "Pilih akun"}</span>
                      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-[hsl(var(--muted-foreground))]" />
                    </button>
                  )}
                  <label className={cn(rowCls, "cursor-pointer")}>
                    <span className={labelCls}>Tanggal</span>
                    <input
                      type="date"
                      aria-label="Tanggal"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* picker needs a user gesture */ } }}
                      className="min-h-11 min-w-0 flex-1 bg-transparent text-right text-sm font-semibold focus:outline-none [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                  </label>
                  <label className={rowCls}>
                    <span className={labelCls}>Catatan</span>
                    <input
                      type="text"
                      aria-label="Catatan"
                      placeholder="Tambah catatan..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="min-h-11 min-w-0 flex-1 bg-transparent text-sm font-semibold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none"
                    />
                  </label>
                </section>
                {notePresets.length > 0 && (!note || notePresets.includes(note)) && (
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
                {isTransfer && (
                  <p className="px-1 text-xs text-[hsl(var(--muted-foreground))]">Transfer antar akun tidak dihitung sebagai pemasukan atau pengeluaran di laporan.</p>
                )}
              </div>
            </div>
          )}
        </form>
      </Modal>

      <Sheet open={open && picker !== null} onClose={() => setPicker(null)} title={pickerTitle}>
        <div className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          {pickerAccounts.length === 0 && <p className="p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">Belum ada akun lain.</p>}
          {pickerAccounts.map((a) => {
            const selected = String(a.id) === pickerValue;
            return (
              <button
                key={a.id}
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => pickAccount(picker ?? "from", String(a.id))}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]"
              >
                <IconTile label={a.name} color={a.color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{a.name}</span>
                  <span className="block text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{money(a.currentBalance)}</span>
                </span>
                {selected && <Check size={18} aria-hidden="true" className="shrink-0 text-[hsl(var(--primary))]" />}
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
