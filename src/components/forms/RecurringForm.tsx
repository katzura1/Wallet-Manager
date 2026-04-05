import { useEffect, useState } from "react";
import { Button, Input, Select, Modal, Badge } from "@/components/ui";
import { todayISO, formatNumberWithSeparator } from "@/lib/utils";
import { addRecurring, updateRecurring, getNextRecurringDates } from "@/db/recurring";
import type { Account, Category, RecurringTransaction, RecurringInterval } from "@/types";

interface RecurringFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  accounts: Account[];
  categories: Category[];
  existing?: RecurringTransaction;
  initialValues?: RecurringDraftInput;
}

export interface RecurringDraftInput {
  type: "income" | "expense";
  amount: number;
  accountId: number;
  categoryId?: number;
  interval: RecurringInterval;
  nextDate: string;
  note: string;
  isActive?: boolean;
}

const INTERVAL_OPTIONS: { value: RecurringInterval; label: string }[] = [
  { value: "daily",   label: "Harian" },
  { value: "weekly",  label: "Mingguan" },
  { value: "monthly", label: "Bulanan" },
  { value: "yearly",  label: "Tahunan" },
];

function getInitialRecurringValues(accounts: Account[], existing?: RecurringTransaction, initialValues?: RecurringDraftInput) {
  if (existing) {
    return {
      type: existing.type,
      amount: String(existing.amount),
      accountId: String(existing.accountId),
      categoryId: String(existing.categoryId ?? ""),
      interval: existing.interval,
      nextDate: existing.nextDate,
      note: existing.note,
      isActive: existing.isActive,
    };
  }

  return {
    type: initialValues?.type ?? "expense",
    amount: initialValues?.amount ? String(initialValues.amount) : "",
    accountId: String(initialValues?.accountId ?? accounts[0]?.id ?? ""),
    categoryId: String(initialValues?.categoryId ?? ""),
    interval: initialValues?.interval ?? "monthly",
    nextDate: initialValues?.nextDate ?? todayISO(),
    note: initialValues?.note ?? "",
    isActive: initialValues?.isActive ?? true,
  };
}

export function RecurringForm({ open, onClose, onSaved, accounts, categories, existing, initialValues }: RecurringFormProps) {
  const initialState = getInitialRecurringValues(accounts, existing, initialValues);
  const [type, setType] = useState<"income" | "expense">(initialState.type);
  const [amount, setAmount] = useState(initialState.amount);
  const [accountId, setAccountId] = useState(initialState.accountId);
  const [categoryId, setCategoryId] = useState(initialState.categoryId);
  const [interval, setIntervalVal] = useState<RecurringInterval>(initialState.interval);
  const [nextDate, setNextDate] = useState(initialState.nextDate);
  const [note, setNote] = useState(initialState.note);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredCategories = categories.filter((c) => c.type === type || c.type === "both");
  const upcomingDates = getNextRecurringDates(nextDate, interval, 3);

  useEffect(() => {
    if (!open) return;
    const nextState = getInitialRecurringValues(accounts, existing, initialValues);
    setType(nextState.type);
    setAmount(nextState.amount);
    setAccountId(nextState.accountId);
    setCategoryId(nextState.categoryId);
    setIntervalVal(nextState.interval);
    setNextDate(nextState.nextDate);
    setNote(nextState.note);
    setIsActive(nextState.isActive);
    setLoading(false);
    setError("");
  }, [open, accounts, existing, initialValues]);

  useEffect(() => {
    if (!categoryId) return;
    const stillValid = filteredCategories.some((c) => String(c.id) === categoryId);
    if (!stillValid) {
      setCategoryId("");
    }
  }, [type]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) { setError("Jumlah harus lebih dari 0"); return; }
    if (!accountId) { setError("Pilih akun"); return; }

    setLoading(true);
    try {
      if (existing?.id) {
        await updateRecurring(existing.id, {
          type,
          amount: amountNum,
          accountId: Number(accountId),
          categoryId: categoryId ? Number(categoryId) : undefined,
          interval,
          nextDate,
          note,
          isActive,
        });
      } else {
        await addRecurring({
          type,
          amount: amountNum,
          accountId: Number(accountId),
          categoryId: categoryId ? Number(categoryId) : undefined,
          interval,
          startDate: nextDate,
          nextDate,
          note,
          isActive: true,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan transaksi terjadwal");
    } finally {
      setLoading(false);
    }
  }

  const typeButtons: { t: "income" | "expense"; label: string; cls: string }[] = [
    { t: "expense", label: "Pengeluaran", cls: "bg-red-500 text-white" },
    { t: "income",  label: "Pemasukan",   cls: "bg-emerald-500 text-white" },
  ];

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit Transaksi Terjadwal" : "Tambah Transaksi Terjadwal"}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">{existing ? "Mode Edit" : "Mode Baru"}</Badge>
          {existing && (
            <Badge className={isActive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}>
              {isActive ? "Aktif" : "Pause"}
            </Badge>
          )}
        </div>

        {/* Type toggle */}
        <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-4 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Recurring Setup</p>
            <p className="mt-1 text-sm text-[hsl(var(--foreground))]">Buat pola transaksi rutin dengan preview tanggal berikutnya.</p>
          </div>
        <div className="flex rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/70 p-1 overflow-hidden">
          {typeButtons.map(({ t, label, cls }) => (
            <button
              key={t}
              type="button"
              onClick={() => { setType(t); setError(""); }}
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

          <Input
            label={existing ? "Tanggal Berikutnya" : "Mulai Tanggal"}
            type="date"
            value={nextDate}
            onChange={(e) => {
              setNextDate(e.target.value);
              setError("");
            }}
          />
        </div>

        <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/70 p-4 space-y-4">
          <Select label="Akun" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">-- Pilih Akun --</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
            ))}
          </Select>

          <Select label="Kategori" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">-- Tanpa Kategori --</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </Select>

          <Select label="Frekuensi" value={interval} onChange={(e) => setIntervalVal(e.target.value as RecurringInterval)}>
            {INTERVAL_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </div>

        <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-4">
          <p className="text-xs font-semibold text-[hsl(var(--foreground))]">Preview Jadwal Berikutnya</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {upcomingDates.map((date) => (
              <Badge key={date} className="bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] text-[11px]">
                {date}
              </Badge>
            ))}
          </div>
        </div>

        <Input
          label="Catatan"
          placeholder="mis. Gaji bulanan, Netflix, Arisan..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {existing && (
          <label className="flex items-center gap-3 cursor-pointer rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/70 px-4 py-3">
            <div
              role="switch"
              aria-checked={isActive}
              className={`relative w-10 h-6 rounded-full transition-colors ${isActive ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--border))]"}`}
              onClick={() => setIsActive(!isActive)}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${isActive ? "translate-x-5" : "translate-x-1"}`} />
            </div>
            <span className="text-sm font-medium">{isActive ? "Aktif" : "Nonaktif"}</span>
          </label>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Batal</Button>
          <Button type="submit" className="flex-1" disabled={loading}>
            {loading ? "Menyimpan..." : existing ? "Simpan" : "Tambah"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
