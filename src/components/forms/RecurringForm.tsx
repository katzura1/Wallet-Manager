import { useState } from "react";
import { Button, Input, Select, Modal } from "@/components/ui";
import { todayISO, formatNumberWithSeparator } from "@/lib/utils";
import { addRecurring, updateRecurring } from "@/db/recurring";
import type { Account, Category, RecurringTransaction, RecurringInterval } from "@/types";

interface RecurringFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  accounts: Account[];
  categories: Category[];
  existing?: RecurringTransaction;
}

const INTERVAL_OPTIONS: { value: RecurringInterval; label: string }[] = [
  { value: "daily",   label: "Harian" },
  { value: "weekly",  label: "Mingguan" },
  { value: "monthly", label: "Bulanan" },
  { value: "yearly",  label: "Tahunan" },
];

export function RecurringForm({ open, onClose, onSaved, accounts, categories, existing }: RecurringFormProps) {
  const [type, setType] = useState<"income" | "expense">(existing?.type ?? "expense");
  const [amount, setAmount] = useState(String(existing?.amount ?? ""));
  const [accountId, setAccountId] = useState(String(existing?.accountId ?? accounts[0]?.id ?? ""));
  const [categoryId, setCategoryId] = useState(String(existing?.categoryId ?? ""));
  const [interval, setIntervalVal] = useState<RecurringInterval>(existing?.interval ?? "monthly");
  const [nextDate, setNextDate] = useState(existing?.nextDate ?? todayISO());
  const [note, setNote] = useState(existing?.note ?? "");
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredCategories = categories.filter((c) => c.type === type || c.type === "both");

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
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type toggle */}
        <div className="flex rounded-xl border border-[hsl(var(--border))] overflow-hidden">
          {typeButtons.map(({ t, label, cls }) => (
            <button
              key={t}
              type="button"
              onClick={() => { setType(t); setError(""); }}
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

        <Input
          label={existing ? "Tanggal Berikutnya" : "Mulai Tanggal"}
          type="date"
          value={nextDate}
          onChange={(e) => setNextDate(e.target.value)}
        />

        <div className="space-y-1">
          <label className="text-sm font-medium">Catatan</label>
          <input
            className="w-full rounded-xl border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-base placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="mis. Gaji bulanan, Netflix, Arisan..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {existing && (
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              className={`relative w-10 h-6 rounded-full transition-colors ${isActive ? "bg-indigo-500" : "bg-[hsl(var(--border))]"}`}
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
