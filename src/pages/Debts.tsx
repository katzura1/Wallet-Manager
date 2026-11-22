import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, IconTile, Modal, Sheet, PageHeader, SegmentedControl, Switch, ProgressBar } from "@/components/ui";
import { AccountPickerSheet, AmountHero, FieldRow, NoteLine, PickerRow, RowsCard, SubmitButton } from "@/components/forms/formParts";
import { dateInputCls, openDatePicker, textInputCls } from "@/components/forms/formStyles";
import { getDebts, addDebt, updateDebt, deleteDebt, payDebt, getDebtPayments, updateDebtPayment, deleteDebtPayment, getOrphanDebtTransactions, deleteOrphanDebtTransactions } from "@/db/debts";
import { cn, formatCurrency, formatDate, readBalanceHidden, todayISO } from "@/lib/utils";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Debt, DebtPayment, Transaction } from "@/types";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { usePageAction } from "@/components/layout/appLayoutContext";

function useMoney() {
  const { currency } = useSettingsStore();
  const hidden = readBalanceHidden();
  return (value: number) => (hidden ? "•••" : formatCurrency(value, currency));
}

// ─── Debt Form Modal ──────────────────────────────────────────────────────────

interface DebtFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  existing?: Debt;
}

function DebtForm({ open, onClose, onSaved, existing }: DebtFormProps) {
  const { accounts } = useWalletStore();
  const { currency } = useSettingsStore();
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<"owe" | "owed">(existing?.type ?? "owe");
  const [amount, setAmount] = useState(String(existing?.amount ?? ""));
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [accountId, setAccountId] = useState(String(existing?.accountId ?? ""));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const account = accounts.find((a) => String(a.id) === accountId);

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

  const owe = type === "owe";
  const accountNote = !account
    ? "Tanpa akun, saldo tidak berubah dan tidak ada transaksi yang dicatat."
    : owe && account.type === "credit"
      ? `Pemakaian kartu kredit dicatat sebagai pengeluaran di ${account.name}.`
      : owe
        ? `Uang yang kamu terima masuk ke saldo ${account.name}. Transaksi ini tidak dihitung sebagai pemasukan di laporan.`
        : `Uang yang kamu pinjamkan keluar dari saldo ${account.name}. Transaksi ini tidak dihitung sebagai pengeluaran di laporan.`;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={existing ? "Edit hutang / piutang" : "Catat hutang / piutang"}
        closePosition="left"
        footer={<SubmitButton form="debt-form" disabled={loading}>{loading ? "Menyimpan..." : "Simpan"}</SubmitButton>}
      >
        <form id="debt-form" onSubmit={handleSubmit} className="space-y-4">
          <SegmentedControl
            label="Jenis"
            value={type}
            onChange={setType}
            options={[{ value: "owe", label: "Saya berhutang" }, { value: "owed", label: "Orang berhutang ke saya" }]}
          />
          <AmountHero label="Jumlah" ariaLabel="Jumlah" value={amount} autoFocus={!existing} error={error} onChange={(v) => { setAmount(v); setError(""); }} />
          <RowsCard>
            <label className="flex cursor-text flex-col gap-1 px-4 py-3">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">{owe ? "Nama pemberi pinjaman" : "Nama orang"}</span>
              <input
                type="text"
                aria-label="Nama"
                placeholder={owe ? "Siapa yang meminjamkan" : "Siapa yang berhutang"}
                value={name}
                onChange={(e) => { setName(e.target.value); setError(""); }}
                className="min-h-8 bg-transparent p-0 text-base font-semibold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none"
              />
            </label>
            <FieldRow label="Tanggal">
              <input type="date" aria-label="Tanggal" value={date} onChange={(e) => setDate(e.target.value)} onClick={openDatePicker} className={dateInputCls} />
            </FieldRow>
            <FieldRow label="Jatuh tempo">
              <input type="date" aria-label="Jatuh tempo" value={dueDate} onChange={(e) => setDueDate(e.target.value)} onClick={openDatePicker} className={dateInputCls} />
            </FieldRow>
            <PickerRow label={owe ? "Uang masuk ke akun" : "Uang keluar dari akun"} value={account?.name ?? "Tidak ada"} muted={!account} onClick={() => setPickerOpen(true)} />
            <label className="flex cursor-text flex-col gap-1 px-4 py-3">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Catatan</span>
              <input
                type="text"
                aria-label="Catatan"
                placeholder="Opsional, misal: pinjam untuk servis motor"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-8 bg-transparent p-0 text-sm placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none"
              />
            </label>
          </RowsCard>
          <NoteLine>{accountNote}</NoteLine>
        </form>
      </Modal>
      <AccountPickerSheet
        open={open && pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={owe ? "Uang masuk ke akun" : "Uang keluar dari akun"}
        accounts={accounts}
        selectedId={accountId}
        noneLabel="Tidak ada"
        hidden={readBalanceHidden()}
        currency={currency}
        onPick={(id) => { setAccountId(id); setPickerOpen(false); }}
      />
    </>
  );
}

// ─── Pay Debt Modal ───────────────────────────────────────────────────────────

interface PayDebtModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  debt: Debt;
}

type PayChip = "partial" | "full" | "other";

function PayDebtModal({ open, onClose, onSaved, debt }: PayDebtModalProps) {
  const { accounts } = useWalletStore();
  const { currency } = useSettingsStore();
  const money = useMoney();
  const [amount, setAmount] = useState(String(debt.remaining));
  const [chip, setChip] = useState<PayChip>("full");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const creditAccount = debt.type === "owe" ? accounts.find((a) => a.id === debt.accountId && a.type === "credit") : undefined;
  const [accountId, setAccountId] = useState(creditAccount ? "" : String(debt.accountId ?? ""));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const owe = debt.type === "owe";
  const verb = owe ? "Bayar" : "Terima";
  const account = accounts.find((a) => String(a.id) === accountId);
  const amountNum = Number(amount) || 0;

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

  function pickChip(next: PayChip) {
    setChip(next);
    setError("");
    if (next === "full") setAmount(String(debt.remaining));
    if (next === "partial") setAmount("");
    amountRef.current?.focus();
  }

  const chips: { value: PayChip; label: string }[] = [{ value: "partial", label: "Sebagian" }, { value: "full", label: "Lunasi" }, { value: "other", label: "Nominal lain" }];
  const accountNote = account
    ? owe
      ? `Pembayaran mengurangi saldo ${account.name}, tapi tidak masuk laporan pengeluaran.`
      : `Penerimaan menambah saldo ${account.name}, tapi tidak masuk laporan pemasukan.`
    : creditAccount ? null : "Tanpa akun, saldo tidak berubah.";

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`${verb} · ${debt.name}`}
        closePosition="left"
        footer={<SubmitButton form="pay-form" disabled={loading}>{loading ? "Memproses..." : "Catat pembayaran"}</SubmitButton>}
      >
        <form id="pay-form" onSubmit={handleSubmit} className="space-y-4">
          <p className="text-center text-[13px] tabular-nums text-[hsl(var(--muted-foreground))]">
            Sisa <span className="font-semibold text-[hsl(var(--foreground))]">{money(debt.remaining)}</span> dari {money(debt.amount)}
          </p>
          <AmountHero
            ariaLabel="Jumlah pembayaran"
            value={amount}
            inputRef={amountRef}
            error={error}
            hint={amountNum > 0 && amountNum <= debt.remaining ? `Setelah ini sisa ${money(debt.remaining - amountNum)}` : undefined}
            onChange={(v) => {
              setAmount(v);
              setError("");
              setChip(Number(v) === debt.remaining ? "full" : chip === "full" ? "partial" : chip);
            }}
          />
          <div role="group" aria-label="Pilihan jumlah" className="grid grid-cols-3 gap-2">
            {chips.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={chip === c.value}
                onClick={() => pickChip(c.value)}
                className={cn(
                  "min-h-11 rounded-xl text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                  chip === c.value
                    ? "border-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 font-bold text-[hsl(var(--primary))]"
                    : "border border-[hsl(var(--border))] bg-[hsl(var(--card))] font-semibold text-[hsl(var(--foreground))]",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <RowsCard>
            <PickerRow label={owe ? "Bayar dari" : "Terima ke"} value={account ? `${account.name} · ${money(account.currentBalance)}` : creditAccount ? `Refund ke ${creditAccount.name}` : "Tidak dicatat"} muted={!account} onClick={() => setPickerOpen(true)} />
            <FieldRow label="Tanggal">
              <input type="date" aria-label="Tanggal pembayaran" value={date} onChange={(e) => setDate(e.target.value)} onClick={openDatePicker} className={dateInputCls} />
            </FieldRow>
            <FieldRow label="Catatan">
              <input type="text" aria-label="Catatan pembayaran" placeholder="Opsional" value={note} onChange={(e) => setNote(e.target.value)} className={textInputCls} />
            </FieldRow>
          </RowsCard>
          {accountNote && <NoteLine>{accountNote}</NoteLine>}
          {creditAccount && <NoteLine>Jika dipilih, dicatat sebagai transfer ke {creditAccount.name}. Kosongkan jika refund: dicatat sebagai pemasukan ke akun CC.</NoteLine>}
        </form>
      </Modal>
      <AccountPickerSheet
        open={open && pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={owe ? "Bayar dari" : "Terima ke"}
        accounts={accounts.filter((a) => a.id !== creditAccount?.id)}
        selectedId={accountId}
        noneLabel={creditAccount ? `Refund ke ${creditAccount.name}` : "Tidak dicatat"}
        hidden={readBalanceHidden()}
        currency={currency}
        onPick={(id) => { setAccountId(id); setPickerOpen(false); }}
      />
    </>
  );
}

// ─── Payments History Modal ───────────────────────────────────────────────────

interface PaymentsHistoryProps {
  open: boolean;
  onClose: () => void;
  debt: Debt;
  onPaymentChanged: () => void;
  onEditDebt: () => void;
  onDeleteDebt: () => void;
}

function PaymentsHistory({ open, onClose, debt, onPaymentChanged, onEditDebt, onDeleteDebt }: PaymentsHistoryProps) {
  const { currency } = useSettingsStore();
  const money = useMoney();
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
    <Sheet open={open} onClose={onClose} title={`Riwayat · ${debt.name}`}>
      <p className="mb-3 text-[13px] tabular-nums text-[hsl(var(--muted-foreground))]">Sisa <span className="font-semibold text-[hsl(var(--foreground))]">{money(debt.remaining)}</span> dari {money(debt.amount)}</p>
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
                    <span className="font-semibold text-success text-xs tabular-nums">{money(p.amount)}</span>
                    <button aria-label="Edit pembayaran" onClick={() => startEdit(p)} className="flex h-11 w-11 items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><Pencil size={16} aria-hidden="true" /></button>
                    <button aria-label="Hapus pembayaran" onClick={() => setDeletePaymentTarget(p)} className="flex h-11 w-11 items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-danger"><Trash2 size={16} aria-hidden="true" /></button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex gap-2 border-t border-[hsl(var(--border))] pt-4">
        <Button type="button" variant="outline" className="min-h-11 flex-1 gap-1.5" aria-label={`Edit ${debt.name}`} onClick={onEditDebt}><Pencil size={16} aria-hidden="true" />Edit</Button>
        <Button type="button" variant="outline" className="min-h-11 flex-1 gap-1.5 text-danger" aria-label={`Hapus ${debt.name}`} onClick={onDeleteDebt}><Trash2 size={16} aria-hidden="true" />Hapus</Button>
      </div>
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
  accountName?: string;
  onPay: () => void;
  onHistory: () => void;
}

function dueInfo(debt: Debt): { text: string; cls: string } | null {
  if (!debt.dueDate) return null;
  if (debt.isSettled) return { text: `Jatuh tempo ${formatDate(debt.dueDate)}`, cls: "text-[hsl(var(--muted-foreground))]" };
  const days = differenceInCalendarDays(parseISO(debt.dueDate), parseISO(todayISO()));
  if (days < 0) return { text: `Terlambat ${-days} hari · ${formatDate(debt.dueDate)}`, cls: "text-danger font-semibold" };
  if (days <= 7) return { text: days === 0 ? "Jatuh tempo hari ini" : `Jatuh tempo ${days} hari lagi · ${formatDate(debt.dueDate)}`, cls: "text-warning font-semibold" };
  return { text: `Jatuh tempo ${formatDate(debt.dueDate)}`, cls: "text-[hsl(var(--muted-foreground))]" };
}

function DebtCard({ debt, accountName, onPay, onHistory }: DebtCardProps) {
  const money = useMoney();
  const owe = debt.type === "owe";
  const due = dueInfo(debt);
  const meta = [debt.date ? formatDate(debt.date) : "", debt.note, accountName].filter(Boolean).join(" · ");
  const btn = "min-h-11 rounded-xl px-4 text-[13px] font-semibold";

  return (
    <article className="space-y-2.5 rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3.5 lg:space-y-3 lg:p-4">
      <div className="flex items-center gap-3">
        <IconTile label={debt.name} color={owe ? "hsl(var(--danger))" : "hsl(var(--success))"} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-bold text-[hsl(var(--foreground))]">{debt.name}</h3>
          {meta && <p className="hidden truncate text-xs text-[hsl(var(--muted-foreground))] lg:block">{meta}</p>}
          {due && <p className={`truncate text-xs ${due.cls}`}>{due.text}</p>}
          {debt.isSettled && <span className="mt-0.5 inline-block rounded-full bg-[hsl(var(--surface-2))] px-2 py-0.5 text-xs font-medium text-success">Lunas</span>}
        </div>
        <div className="flex shrink-0 flex-col items-end tabular-nums lg:hidden">
          <span className="text-[15px] font-extrabold">{money(debt.remaining)}</span>
          <span className="text-[11px] text-[hsl(var(--muted-foreground))]">sisa dari {money(debt.amount)}</span>
        </div>
      </div>

      <div className="hidden items-baseline justify-between gap-2 text-[13px] tabular-nums lg:flex">
        <span>Sisa <b>{money(debt.remaining)}</b></span>
        <span className="text-[hsl(var(--muted-foreground))]">dari {money(debt.amount)}</span>
      </div>
      <ProgressBar value={debt.amount - debt.remaining} max={debt.amount} tone="success" label={`Terbayar ${debt.name}`} />

      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-[hsl(var(--muted-foreground))] lg:hidden">{meta}</span>
        <span className="hidden flex-1 lg:block" />
        <Button size="sm" variant="outline" className={btn} onClick={onHistory}>Riwayat</Button>
        {!debt.isSettled && <Button size="sm" className={btn} onClick={onPay}>{owe ? "Bayar" : "Terima"}</Button>}
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
  const { accounts } = useWalletStore();
  const money = useMoney();
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
  const { currency } = useSettingsStore();

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
  const openOwe = oweDebts.filter((d) => !d.isSettled);
  const openOwed = owedDebts.filter((d) => !d.isSettled);
  const totalOwe = openOwe.reduce((s, d) => s + d.remaining, 0);
  const totalOwed = openOwed.reduce((s, d) => s + d.remaining, 0);
  const net = totalOwed - totalOwe;

  usePageAction({ label: "Tambah hutang/piutang", onClick: () => setAddOpen(true) });

  function renderColumn(kind: "owe" | "owed", list: Debt[]) {
    const owe = kind === "owe";
    return (
      <section aria-label={owe ? "Hutang saya" : "Piutang saya"} className={`min-w-0 space-y-3 lg:block ${tab === kind ? "block" : "hidden"}`}>
        <h2 className="hidden text-[15px] font-bold lg:block">{owe ? "Hutang saya" : "Piutang saya"}</h2>
        {list.length === 0 && <p className="rounded-2xl border border-dashed border-[hsl(var(--border))] py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">{owe ? "Tidak ada hutang" : "Tidak ada piutang"}</p>}
        {list.map((d) => (
          <DebtCard
            key={d.id}
            debt={d}
            accountName={accounts.find((a) => a.id === d.accountId)?.name}
            onPay={() => setPayDebtTarget(d)}
            onHistory={() => setHistoryDebt(d)}
          />
        ))}
      </section>
    );
  }

  const summary: { label: string; value: string; sub: string; tone: string }[] = [
    { label: "Hutang saya", value: money(totalOwe), sub: `${openOwe.length} belum lunas`, tone: "text-danger" },
    { label: "Piutang saya", value: money(totalOwed), sub: `${openOwed.length} belum lunas`, tone: "text-success" },
    { label: "Bersih", value: money(net), sub: "masuk ke kekayaan bersih", tone: "text-[hsl(var(--foreground))]" },
  ];

  return (
    <div className="space-y-3.5 px-5 pt-4 pb-4 lg:space-y-[18px] lg:px-0 lg:pt-7">
      <PageHeader
        title="Hutang & piutang"
        back="/accounts"
        actions={
          <button
            type="button"
            aria-label="Tambah hutang/piutang"
            onClick={() => setAddOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] lg:hidden"
          >
            <Plus size={20} strokeWidth={2.2} aria-hidden="true" />
          </button>
        }
      />

      {orphans.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-[hsl(var(--card))] px-4 py-3 text-sm">
          <span>{orphans.length} transaksi sisa hutang/piutang yang sudah dihapus.</span>
          <Button size="sm" variant="outline" className="min-h-11" onClick={() => setOrphanConfirm(true)}>Bersihkan</Button>
        </div>
      )}

      <section aria-label="Ringkasan hutang dan piutang" className="hidden lg:block">
        <dl className="grid grid-cols-3 gap-4">
          {summary.map(({ label, value, sub, tone }) => (
            <div key={label} className="flex min-w-0 flex-col gap-1 rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <dt className="text-[13px] text-[hsl(var(--muted-foreground))]">{label}</dt>
              <dd className={`break-words text-2xl font-extrabold tabular-nums ${tone}`}>{value}</dd>
              <dd className="text-xs text-[hsl(var(--muted-foreground))]">{sub}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="lg:hidden">
        <SegmentedControl
          label="Jenis hutang"
          value={tab}
          onChange={setTab}
          options={[
            { value: "owe", label: "Hutang saya", sub: money(totalOwe), subClassName: "text-danger" },
            { value: "owed", label: "Piutang saya", sub: money(totalOwed), subClassName: "text-success" },
          ]}
        />
        <p className="mt-2 px-1 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">Bersih <span className={`font-semibold ${net >= 0 ? "text-success" : "text-danger"}`}>{money(net)}</span></p>
      </div>

      {debts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16 text-center text-[hsl(var(--muted-foreground))]">
          <p className="font-medium">Belum ada hutang/piutang</p>
          <p className="mt-1 text-sm">Tekan + untuk mencatat</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2 lg:gap-4">
          {renderColumn("owe", oweDebts)}
          {renderColumn("owed", owedDebts)}
        </div>
      )}

      <div className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-4 pr-3 text-[13px] font-semibold lg:inline-flex lg:min-h-11 lg:rounded-xl">
        <span className="text-[hsl(var(--foreground))]">Sudah lunas ({settledCount})</span>
        <Switch label={`Tampilkan sudah lunas (${settledCount})`} checked={showSettled} onChange={setShowSettled} />
      </div>

      {/* Sheets */}
      <DebtForm open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} />
      {editDebt && <DebtForm open onClose={() => setEditDebt(null)} onSaved={load} existing={editDebt} />}
      {payDebtTarget && <PayDebtModal open onClose={() => setPayDebtTarget(null)} onSaved={load} debt={payDebtTarget} />}
      {historyDebt && (
        <PaymentsHistory
          open
          onClose={() => setHistoryDebt(null)}
          debt={historyDebt}
          onPaymentChanged={load}
          onEditDebt={() => { setEditDebt(historyDebt); setHistoryDebt(null); }}
          onDeleteDebt={() => { setDeleteTarget(historyDebt); setHistoryDebt(null); }}
        />
      )}
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
