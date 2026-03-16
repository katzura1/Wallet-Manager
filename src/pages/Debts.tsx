import { useEffect, useState } from "react";
import { Button, Input, Select, Textarea, Modal } from "@/components/ui";
import { getDebts, addDebt, updateDebt, deleteDebt, payDebt, getDebtPayments, updateDebtPayment, deleteDebtPayment } from "@/db/debts";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";
import type { Debt, DebtPayment } from "@/types";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";

// ─── Debt Form Modal ──────────────────────────────────────────────────────────

interface DebtFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  existing?: Debt;
}

function DebtForm({ open, onClose, onSaved, existing }: DebtFormProps) {
  const { accounts } = useWalletStore();  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<"owe" | "owed">(existing?.type ?? "owe");
  const [amount, setAmount] = useState(String(existing?.amount ?? ""));
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [accountId, setAccountId] = useState(String(existing?.accountId ?? ""));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Nama tidak boleh kosong"); return; }
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) { setError("Jumlah harus lebih dari 0"); return; }

    setLoading(true);
    try {
      const data = {
        name: name.trim(),
        type,
        amount: amountNum,
        remaining: existing ? existing.remaining : amountNum,
        dueDate: dueDate || undefined,
        note,
        accountId: accountId ? Number(accountId) : undefined,
        isSettled: existing?.isSettled ?? false,
      };
      if (existing?.id) {
        await updateDebt(existing.id, data);
      } else {
        await addDebt(data);
      }
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit Hutang/Piutang" : "Tambah Hutang/Piutang"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex rounded-xl border border-[hsl(var(--border))] overflow-hidden">
          <button
            type="button"
            onClick={() => setType("owe")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${type === "owe" ? "bg-red-500 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
          >
            💸 Kita Hutang
          </button>
          <button
            type="button"
            onClick={() => setType("owed")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${type === "owed" ? "bg-emerald-500 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
          >
            🤝 Piutang
          </button>
        </div>
        <Input
          label="Nama"
          placeholder={type === "owe" ? "Nama kreditur (siapa yang meminjamkan)" : "Nama debitur (siapa yang berhutang)"}
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          error={error}
        />
        <Input
          label="Jumlah"
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setError(""); }}
        />
        <Select label="Akun (opsional)" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">-- Tidak Ada --</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
          ))}
        </Select>
        <Input label="Jatuh Tempo (opsional)" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <Textarea label="Catatan (opsional)" placeholder="Tambah catatan..." rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Menyimpan..." : existing ? "Simpan Perubahan" : "Tambah"}
        </Button>
      </form>
    </Modal>
  );
}

// ─── Pay Debt Modal ───────────────────────────────────────────────────────────

interface PayDebtModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  debt: Debt;
}

function PayDebtModal({ open, onClose, onSaved, debt }: PayDebtModalProps) {
  const { accounts } = useWalletStore();
  const { currency } = useSettingsStore();
  const [amount, setAmount] = useState(String(debt.remaining));
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState(String(debt.accountId ?? ""));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) { setError("Jumlah harus lebih dari 0"); return; }
    if (amountNum > debt.remaining) { setError(`Maksimal ${formatCurrency(debt.remaining, currency)}`); return; }
    setLoading(true);
    try {
      await payDebt(debt.id!, amountNum, date, note, accountId ? Number(accountId) : undefined);
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Bayar: ${debt.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Sisa: <span className="font-semibold text-[hsl(var(--foreground))]">{formatCurrency(debt.remaining, currency)}</span>
        </p>
        <Input
          label="Jumlah Pembayaran"
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setError(""); }}
          error={error}
        />
        <Select label="Akun (opsional)" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">-- Tidak Ada --</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
          ))}
        </Select>
        <Input label="Tanggal" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Textarea label="Catatan (opsional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Memproses..." : "Bayar"}
        </Button>
      </form>
    </Modal>
  );
}

// ─── Payments History Modal ───────────────────────────────────────────────────

interface PaymentsHistoryProps {
  open: boolean;
  onClose: () => void;
  debt: Debt;
}

function PaymentsHistory({ open, onClose, debt }: PaymentsHistoryProps) {
  const { currency } = useSettingsStore();
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  function reload() {
    getDebtPayments(debt.id!).then(setPayments);
  }

  useEffect(() => {
    if (open) { reload(); setEditingId(null); }
  }, [open, debt.id]);

  function startEdit(p: DebtPayment) {
    setEditingId(p.id!);
    setEditAmount(String(p.amount));
    setEditDate(p.date);
    setEditNote(p.note);
  }

  async function saveEdit(p: DebtPayment) {
    const amountNum = Number(editAmount);
    if (!amountNum || amountNum <= 0) return;
    setSaving(true);
    try {
      await updateDebtPayment(p.id!, { amount: amountNum, date: editDate, note: editNote });
      setEditingId(null);
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: DebtPayment) {
    if (!confirm(`Hapus pembayaran ${formatCurrency(p.amount, currency)} pada ${formatDate(p.date)}?`)) return;
    await deleteDebtPayment(p.id!);
    reload();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Riwayat: ${debt.name}`}>
      {payments.length === 0 ? (
        <p className="text-sm text-center text-[hsl(var(--muted-foreground))] py-6">Belum ada pembayaran</p>
      ) : (
        <ul className="space-y-2">
          {payments.map((p) => (
            <li key={p.id} className="text-sm py-2 border-b border-[hsl(var(--border))] last:border-0">
              {editingId === p.id ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      className="flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                    />
                    <input
                      type="date"
                      className="flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Catatan (opsional)"
                    className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingId(null)}>Batal</Button>
                    <Button size="sm" className="flex-1" disabled={saving} onClick={() => saveEdit(p)}>
                      {saving ? "Menyimpan…" : "Simpan"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{formatDate(p.date)}</div>
                    {p.note && <div className="text-[hsl(var(--muted-foreground))] text-xs">{p.note}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="font-semibold text-emerald-500">{formatCurrency(p.amount, currency)}</span>
                    <button onClick={() => startEdit(p)} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">✏️</button>
                    <button onClick={() => handleDelete(p)} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-red-500">🗑️</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ─── Debt Card ────────────────────────────────────────────────────────────────

interface DebtCardProps {
  debt: Debt;
  currency: string;
  onEdit: () => void;
  onPay: () => void;
  onHistory: () => void;
  onDelete: () => void;
}

function DebtCard({ debt, currency, onEdit, onPay, onHistory, onDelete }: DebtCardProps) {
  const pct = Math.round(((debt.amount - debt.remaining) / debt.amount) * 100);
  const isOverdue = debt.dueDate && !debt.isSettled && debt.dueDate < todayISO();

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] p-4 space-y-3 bg-[hsl(var(--card))]">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-[hsl(var(--foreground))]">{debt.name}</p>
          {debt.dueDate && (
            <p className={`text-xs mt-0.5 ${isOverdue ? "text-red-500 font-medium" : "text-[hsl(var(--muted-foreground))]"}`}>
              {isOverdue ? "⚠️ Jatuh tempo " : "📅 "}{formatDate(debt.dueDate)}
            </p>
          )}
          {debt.isSettled && <span className="inline-block mt-1 text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">✅ Lunas</span>}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-1">✏️</button>
          <button onClick={onDelete} className="text-xs text-[hsl(var(--muted-foreground))] hover:text-red-500 p-1">🗑️</button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-[hsl(var(--muted-foreground))]">Sisa</span>
          <span className="font-semibold">{formatCurrency(debt.remaining, currency)}</span>
        </div>
        <div className="w-full h-2 rounded-full bg-[hsl(var(--muted))]">
          <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
          <span>Terbayar {pct}%</span>
          <span>Total {formatCurrency(debt.amount, currency)}</span>
        </div>
      </div>

      {!debt.isSettled && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1" onClick={onHistory}>Riwayat</Button>
          <Button size="sm" className="flex-1" onClick={onPay}>💳 Bayar</Button>
        </div>
      )}
      {debt.isSettled && (
        <button onClick={onHistory} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline block">
          Lihat Riwayat Pembayaran
        </button>
      )}
    </div>
  );
}

// ─── Delete Confirmation ──────────────────────────────────────────────────────

interface DeleteModalProps {
  open: boolean;
  name: string;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteModal({ open, name, onClose, onConfirm }: DeleteModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Hapus Hutang/Piutang">
      <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
        Hapus <span className="font-semibold text-[hsl(var(--foreground))]">{name}</span>? Semua riwayat pembayaran juga akan dihapus.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Batal</Button>
        <Button variant="destructive" className="flex-1" onClick={onConfirm}>Hapus</Button>
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Debts() {
  const { currency } = useSettingsStore();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [showSettled, setShowSettled] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editDebt, setEditDebt] = useState<Debt | null>(null);
  const [payDebtTarget, setPayDebtTarget] = useState<Debt | null>(null);
  const [historyDebt, setHistoryDebt] = useState<Debt | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Debt | null>(null);

  async function load() {
    setDebts(await getDebts(showSettled));
  }

  useEffect(() => { load(); }, [showSettled]);

  async function handleDelete() {
    if (!deleteTarget?.id) return;
    await deleteDebt(deleteTarget.id);
    setDeleteTarget(null);
    load();
  }

  const oweDebts = debts.filter((d) => d.type === "owe");
  const owedDebts = debts.filter((d) => d.type === "owed");
  const totalOwe = oweDebts.filter((d) => !d.isSettled).reduce((s, d) => s + d.remaining, 0);
  const totalOwed = owedDebts.filter((d) => !d.isSettled).reduce((s, d) => s + d.remaining, 0);

  return (
    <div className="p-4 pb-24 space-y-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">Hutang & Piutang</h1>
        <Button size="sm" onClick={() => setAddOpen(true)}>+ Tambah</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 p-4">
          <p className="text-xs text-red-500 font-medium mb-1">💸 Hutang Saya</p>
          <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(totalOwe, currency)}</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 p-4">
          <p className="text-xs text-emerald-600 font-medium mb-1">🤝 Piutang Saya</p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalOwed, currency)}</p>
        </div>
      </div>

      {/* Show settled toggle */}
      <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] cursor-pointer">
        <input
          type="checkbox"
          checked={showSettled}
          onChange={(e) => setShowSettled(e.target.checked)}
          className="rounded"
        />
        Tampilkan yang sudah lunas
      </label>

      {/* Hutang Saya */}
      {oweDebts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-red-500 uppercase tracking-wide">💸 Hutang Saya</h2>
          {oweDebts.map((d) => (
            <DebtCard
              key={d.id}
              debt={d}
              currency={currency}
              onEdit={() => setEditDebt(d)}
              onPay={() => setPayDebtTarget(d)}
              onHistory={() => setHistoryDebt(d)}
              onDelete={() => setDeleteTarget(d)}
            />
          ))}
        </section>
      )}

      {/* Piutang Saya */}
      {owedDebts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-emerald-600 uppercase tracking-wide">🤝 Piutang Saya</h2>
          {owedDebts.map((d) => (
            <DebtCard
              key={d.id}
              debt={d}
              currency={currency}
              onEdit={() => setEditDebt(d)}
              onPay={() => setPayDebtTarget(d)}
              onHistory={() => setHistoryDebt(d)}
              onDelete={() => setDeleteTarget(d)}
            />
          ))}
        </section>
      )}

      {debts.length === 0 && (
        <div className="text-center py-16 text-[hsl(var(--muted-foreground))]">
          <div className="text-5xl mb-3">🤝</div>
          <p className="font-medium">Belum ada hutang/piutang</p>
          <p className="text-sm mt-1">Tap + Tambah untuk mencatat</p>
        </div>
      )}

      {/* Modals */}
      <DebtForm open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} />
      {editDebt && <DebtForm open onClose={() => setEditDebt(null)} onSaved={load} existing={editDebt} />}
      {payDebtTarget && <PayDebtModal open onClose={() => setPayDebtTarget(null)} onSaved={load} debt={payDebtTarget} />}
      {historyDebt && <PaymentsHistory open onClose={() => setHistoryDebt(null)} debt={historyDebt} />}
      {deleteTarget && (
        <DeleteModal
          open
          name={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
