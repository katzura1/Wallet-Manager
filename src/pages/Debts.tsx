import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Input, Select, Textarea, Sheet, PageHeader, SegmentedControl, Switch, ProgressBar } from "@/components/ui";
import { getDebts, addDebt, updateDebt, deleteDebt, payDebt, getDebtPayments, updateDebtPayment, deleteDebtPayment, getOrphanDebtTransactions, deleteOrphanDebtTransactions } from "@/db/debts";
import { formatCurrency, formatDate, formatNumberWithSeparator, todayISO } from "@/lib/utils";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Debt, DebtPayment, Transaction } from "@/types";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { usePageAction } from "@/components/layout/appLayoutContext";

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
  const [date, setDate] = useState(existing?.date ?? todayISO());
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
        date,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={existing ? "Edit hutang/piutang" : "Tambah hutang/piutang"}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <SegmentedControl
          label="Jenis"
          value={type}
          onChange={setType}
          options={[{ value: "owe", label: "Kita hutang" }, { value: "owed", label: "Piutang" }]}
        />
        <Input
          label="Nama"
          placeholder={type === "owe" ? "Nama kreditur (siapa yang meminjamkan)" : "Nama debitur (siapa yang berhutang)"}
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          error={error}
        />
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
        />
        <Select label="Akun (opsional)" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">-- Tidak Ada --</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
          ))}
        </Select>
        <Input label="Tanggal Transaksi" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Jatuh Tempo (opsional)" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <Textarea label="Catatan (opsional)" placeholder="Tambah catatan..." rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Menyimpan..." : existing ? "Simpan Perubahan" : "Tambah"}
        </Button>
      </form>
    </Sheet>
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
  const creditAccount = debt.type === "owe" ? accounts.find((a) => a.id === debt.accountId && a.type === "credit") : undefined;
  const [accountId, setAccountId] = useState(creditAccount ? "" : String(debt.accountId ?? ""));
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`${debt.type === "owe" ? "Bayar" : "Terima"}: ${debt.name}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm tabular-nums text-[hsl(var(--muted-foreground))]">
          Sisa <span className="font-semibold text-[hsl(var(--foreground))]">{formatCurrency(debt.remaining, currency)}</span> dari {formatCurrency(debt.amount, currency)}
        </p>
        <Input
          label="Jumlah pembayaran"
          type="text"
          inputMode="numeric"
          value={formatNumberWithSeparator(amount)}
          onChange={(e) => { 
            const cleanValue = e.target.value.replace(/\D/g, "");
            setAmount(cleanValue); 
            setError(""); 
          }}
          error={error}
        />
        <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => { setAmount(String(debt.remaining)); setError(""); }}>Lunasi</Button>
        <Select label={creditAccount ? "Bayar dari akun (opsional)" : "Akun (opsional)"} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">-- Tidak Ada --</option>
          {accounts.filter((a) => a.id !== creditAccount?.id).map((a) => (
            <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
          ))}
        </Select>
        {creditAccount && <p className="text-xs text-[hsl(var(--muted-foreground))]">Jika dipilih, dicatat sebagai transfer ke {creditAccount.name}. Kosongkan jika refund: dicatat sebagai pemasukan ke akun CC.</p>}
        <Input label="Tanggal pembayaran" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Textarea label="Catatan pembayaran" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Memproses..." : debt.type === "owe" ? "Bayar" : "Terima"}
        </Button>
      </form>
    </Sheet>
  );
}

// ─── Payments History Modal ───────────────────────────────────────────────────

interface PaymentsHistoryProps {
  open: boolean;
  onClose: () => void;
  debt: Debt;
  onPaymentChanged: () => void;
}

function PaymentsHistory({ open, onClose, debt, onPaymentChanged }: PaymentsHistoryProps) {
  const { currency } = useSettingsStore();
  const { accounts } = useWalletStore();
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<DebtPayment | null>(null);

  const reload = useCallback(() => {
    return getDebtPayments(debt.id!).then(setPayments);
  }, [debt.id]);

  useEffect(() => {
    if (open) void reload().then(() => setEditingId(null));
  }, [open, reload]);

  function startEdit(p: DebtPayment) {
    setEditError("");
    setEditingId(p.id!);
    setEditAmount(String(p.amount));
    setEditDate(p.date);
    setEditNote(p.note);
  }

  async function saveEdit(p: DebtPayment) {
    const amountNum = Number(editAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) { setEditError("Jumlah harus lebih dari 0."); return; }
    setEditError("");
    setSaving(true);
    try {
      await updateDebtPayment(p.id!, { amount: amountNum, date: editDate, note: editNote });
      setEditingId(null);
      reload();
      onPaymentChanged();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Gagal menyimpan pembayaran.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: DebtPayment) {
    setDeletePaymentTarget(null);
    try {
      await deleteDebtPayment(p.id!);
      reload();
      onPaymentChanged();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Gagal menghapus pembayaran.");
    }
  }

  return (
    <>
    <Sheet open={open} onClose={onClose} title={`Riwayat: ${debt.name}`}>
      {editError && <p role="alert" className="mb-3 text-xs text-danger">{editError}</p>}
      {payments.length === 0 ? (
        <p className="text-xs text-center text-[hsl(var(--muted-foreground))] py-4">Belum ada pembayaran</p>
      ) : (
        <ul>
          {payments.map((p) => (
            <li key={p.id} className="text-xs py-2 border-b border-[hsl(var(--border))] last:border-0">
              {editingId === p.id ? (
                <div className="space-y-1.5">
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      aria-label="Jumlah pembayaran"
                      className="flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] min-h-11 px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                    />
                    <input
                      type="date"
                      aria-label="Tanggal pembayaran"
                      className="flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] min-h-11 px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                  </div>
                  <input
                    type="text"
                    aria-label="Catatan pembayaran"
                    placeholder="Catatan (opsional)"
                    className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] min-h-11 px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="min-h-11 flex-1 text-xs" onClick={() => setEditingId(null)}>Batal</Button>
                    <Button size="sm" className="min-h-11 flex-1 text-xs" disabled={saving} onClick={() => saveEdit(p)}>
                      {saving ? "Menyimpan…" : "Simpan"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex-1">
                    <div className="font-medium text-xs">{formatDate(p.date)}</div>
                    {p.note && <div className="text-[hsl(var(--muted-foreground))] text-xs">{p.note}</div>}
                    {p.accountId && (() => { const acc = accounts.find(a => a.id === p.accountId); return acc ? <div className="text-[hsl(var(--muted-foreground))] text-xs">{acc.name}</div> : null; })()}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="font-semibold text-success text-xs tabular-nums">{formatCurrency(p.amount, currency)}</span>
                    <button aria-label="Edit pembayaran" onClick={() => startEdit(p)} className="flex h-11 w-11 items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><Pencil size={16} aria-hidden="true" /></button>
                    <button aria-label="Hapus pembayaran" onClick={() => setDeletePaymentTarget(p)} className="flex h-11 w-11 items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-danger"><Trash2 size={16} aria-hidden="true" /></button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
    <ConfirmDialog
      open={deletePaymentTarget !== null}
      title="Hapus pembayaran ini?"
      description={deletePaymentTarget ? `Pembayaran ${formatCurrency(deletePaymentTarget.amount, currency)} pada ${formatDate(deletePaymentTarget.date)} akan dihapus.` : ""}
      confirmLabel="Hapus"
      onConfirm={() => deletePaymentTarget && handleDelete(deletePaymentTarget)}
      onClose={() => setDeletePaymentTarget(null)}
    />
    </>
  );
}

// ─── Debt Card ────────────────────────────────────────────────────────────────

interface DebtCardProps {
  debt: Debt;
  currency: string;
  accountName?: string;
  onEdit: () => void;
  onPay: () => void;
  onHistory: () => void;
  onDelete: () => void;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

function dueInfo(debt: Debt): { text: string; cls: string } | null {
  if (!debt.dueDate) return null;
  if (debt.isSettled) return { text: `Jatuh tempo ${formatDate(debt.dueDate)}`, cls: "text-[hsl(var(--muted-foreground))]" };
  const days = differenceInCalendarDays(parseISO(debt.dueDate), parseISO(todayISO()));
  if (days < 0) return { text: `Terlambat ${-days} hari · ${formatDate(debt.dueDate)}`, cls: "text-danger font-medium" };
  if (days <= 7) return { text: days === 0 ? "Jatuh tempo hari ini" : `Jatuh tempo ${days} hari lagi · ${formatDate(debt.dueDate)}`, cls: "text-warning font-medium" };
  return { text: `Jatuh tempo ${formatDate(debt.dueDate)}`, cls: "text-[hsl(var(--muted-foreground))]" };
}

function DebtCard({ debt, currency, accountName, onEdit, onPay, onHistory, onDelete }: DebtCardProps) {
  const owe = debt.type === "owe";
  const due = dueInfo(debt);
  const meta = [debt.date ? formatDate(debt.date) : "", debt.note, accountName].filter(Boolean).join(" · ");
  const iconBtn = "flex h-11 w-11 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

  return (
    <article className="space-y-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="flex items-start gap-3">
        <div aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--surface-2))] text-sm font-semibold ${owe ? "text-danger" : "text-success"}`}>{initials(debt.name)}</div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{debt.name}</h3>
          {meta && <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{meta}</p>}
          {due && <p className={`text-xs ${due.cls}`}>{due.text}</p>}
          {debt.isSettled && <span className="mt-1 inline-block rounded-full bg-[hsl(var(--surface-2))] px-2 py-0.5 text-xs font-medium text-success">Lunas</span>}
        </div>
        <div className="-my-1 -mr-2 flex shrink-0">
          <button type="button" aria-label={`Edit ${debt.name}`} onClick={onEdit} className={iconBtn}><Pencil size={16} aria-hidden="true" /></button>
          <button type="button" aria-label={`Hapus ${debt.name}`} onClick={onDelete} className={`${iconBtn} hover:text-danger`}><Trash2 size={16} aria-hidden="true" /></button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
          <span>Sisa <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{formatCurrency(debt.remaining, currency)}</span></span>
          <span>dari {formatCurrency(debt.amount, currency)}</span>
        </div>
        <ProgressBar value={debt.amount - debt.remaining} max={debt.amount} tone="success" label={`Terbayar ${debt.name}`} />
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="min-h-11 flex-1" onClick={onHistory}>Riwayat</Button>
        {!debt.isSettled && <Button size="sm" className="min-h-11 flex-1" onClick={onPay}>{owe ? "Bayar" : "Terima"}</Button>}
      </div>
    </article>
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
    <ConfirmDialog
      open={open}
      title="Hapus hutang/piutang ini?"
      description={`“${name}” dan semua riwayat pembayarannya akan dihapus.`}
      confirmLabel="Hapus"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Debts() {
  const { currency } = useSettingsStore();
  const { accounts } = useWalletStore();
  const [allDebts, setAllDebts] = useState<Debt[]>([]);
  const [showSettled, setShowSettled] = useState(false);
  const [tab, setTab] = useState<"owe" | "owed">("owe");
  const [addOpen, setAddOpen] = useState(false);
  const [editDebt, setEditDebt] = useState<Debt | null>(null);
  const [payDebtTarget, setPayDebtTarget] = useState<Debt | null>(null);
  const [historyDebt, setHistoryDebt] = useState<Debt | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Debt | null>(null);
  const [orphans, setOrphans] = useState<Transaction[]>([]);
  const [orphanConfirm, setOrphanConfirm] = useState(false);

  const load = useCallback(() => {
    return useWalletStore.getState().refreshAll().then(async () => { setOrphans(await getOrphanDebtTransactions()); return getDebts(true); }).then((all) => {
      setAllDebts(all);
      setHistoryDebt((current) => current ? all.find((debt) => debt.id === current.id) ?? null : null);
    });
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete() {
    if (!deleteTarget?.id) return;
    await deleteDebt(deleteTarget.id);
    setDeleteTarget(null);
    load();
  }

  async function handleCleanOrphans() {
    setOrphanConfirm(false);
    await deleteOrphanDebtTransactions();
    load();
  }

  const settledCount = allDebts.filter((d) => d.isSettled).length;
  const debts = showSettled ? allDebts : allDebts.filter((d) => !d.isSettled);
  const oweDebts = debts.filter((d) => d.type === "owe");
  const owedDebts = debts.filter((d) => d.type === "owed");
  const totalOwe = oweDebts.filter((d) => !d.isSettled).reduce((s, d) => s + d.remaining, 0);
  const totalOwed = owedDebts.filter((d) => !d.isSettled).reduce((s, d) => s + d.remaining, 0);
  const net = totalOwed - totalOwe;

  usePageAction({ label: "Tambah hutang/piutang", onClick: () => setAddOpen(true) });

  function renderColumn(kind: "owe" | "owed", list: Debt[]) {
    const owe = kind === "owe";
    return (
      <section aria-label={owe ? "Hutang saya" : "Piutang saya"} className={`min-w-0 space-y-3 lg:block ${tab === kind ? "block" : "hidden"}`}>
        <h2 className={`hidden text-sm font-semibold lg:block ${owe ? "text-danger" : "text-success"}`}>{owe ? "Hutang saya" : "Piutang saya"}</h2>
        {list.length === 0 && <p className="rounded-2xl border border-dashed border-[hsl(var(--border))] py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">{owe ? "Tidak ada hutang" : "Tidak ada piutang"}</p>}
        {list.map((d) => (
          <DebtCard
            key={d.id}
            debt={d}
            currency={currency}
            accountName={accounts.find((a) => a.id === d.accountId)?.name}
            onEdit={() => setEditDebt(d)}
            onPay={() => setPayDebtTarget(d)}
            onHistory={() => setHistoryDebt(d)}
            onDelete={() => setDeleteTarget(d)}
          />
        ))}
      </section>
    );
  }

  const summary: { label: string; value: number; tone: string }[] = [
    { label: "Hutang saya", value: totalOwe, tone: "text-danger" },
    { label: "Piutang saya", value: totalOwed, tone: "text-success" },
    { label: "Bersih", value: net, tone: net >= 0 ? "text-success" : "text-danger" },
  ];

  return (
    <div className="space-y-4 px-4 pt-5 pb-4 lg:px-0 lg:pt-7">
      <PageHeader
        title="Hutang & piutang"
        actions={
          <Button size="sm" className="min-h-11 gap-1 lg:hidden" onClick={() => setAddOpen(true)}>
            <Plus size={16} aria-hidden="true" />Tambah
          </Button>
        }
      />

      {orphans.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-[hsl(var(--card))] px-4 py-3 text-sm">
          <span>{orphans.length} transaksi sisa hutang/piutang yang sudah dihapus.</span>
          <Button size="sm" variant="outline" className="min-h-11" onClick={() => setOrphanConfirm(true)}>Bersihkan</Button>
        </div>
      )}

      <section aria-label="Ringkasan hutang dan piutang">
        <dl className="grid grid-cols-3 gap-2 lg:gap-3">
          {summary.map(({ label, value, tone }) => (
            <div key={label} className="min-w-0 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 lg:p-4">
              <dt className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</dt>
              <dd className={`mt-1 break-words text-sm font-semibold tabular-nums lg:text-lg ${tone}`}>{formatCurrency(value, currency)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="lg:hidden">
        <SegmentedControl
          label="Jenis hutang"
          value={tab}
          onChange={setTab}
          options={[{ value: "owe", label: "Hutang saya" }, { value: "owed", label: "Piutang saya" }]}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-4 pr-3 text-sm">
        <span className="text-[hsl(var(--foreground))]">Sudah lunas ({settledCount})</span>
        <Switch label={`Tampilkan sudah lunas (${settledCount})`} checked={showSettled} onChange={setShowSettled} />
      </div>

      {debts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16 text-center text-[hsl(var(--muted-foreground))]">
          <p className="font-medium">Belum ada hutang/piutang</p>
          <p className="mt-1 text-sm">Tekan Tambah untuk mencatat</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6">
          {renderColumn("owe", oweDebts)}
          {renderColumn("owed", owedDebts)}
        </div>
      )}

      {/* Sheets */}
      <DebtForm open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} />
      {editDebt && <DebtForm open onClose={() => setEditDebt(null)} onSaved={load} existing={editDebt} />}
      {payDebtTarget && <PayDebtModal open onClose={() => setPayDebtTarget(null)} onSaved={load} debt={payDebtTarget} />}
      {historyDebt && <PaymentsHistory open onClose={() => setHistoryDebt(null)} debt={historyDebt} onPaymentChanged={load} />}
      <ConfirmDialog
        open={orphanConfirm}
        title="Hapus transaksi yatim?"
        description={`${orphans.length} transaksi tanpa hutang terkait akan dihapus: ${orphans.map((t) => `${formatDate(t.date)} · ${formatCurrency(t.amount, currency)}`).join(", ")}.`}
        confirmLabel="Hapus"
        onConfirm={handleCleanOrphans}
        onClose={() => setOrphanConfirm(false)}
      />
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
