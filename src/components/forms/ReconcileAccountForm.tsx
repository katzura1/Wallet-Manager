import { useState } from "react";
import { Button, Input, Modal, Textarea } from "@/components/ui";
import { reconcileAccount, recalculateAccountBalance } from "@/db/accounts";
import { formatCurrency } from "@/lib/utils";
import type { Account } from "@/types";

export function ReconcileAccountForm({ account, currency, onClose, onSaved }: {
  account: Account;
  currency: string;
  onClose: () => void;
  onSaved: (difference: number) => void;
}) {
  const [balance, setBalance] = useState(account.currentBalance);
  const [actual, setActual] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const actualBalance = Number(actual);
  const valid = actual.trim() !== "" && Number.isFinite(actualBalance) && Math.abs(actualBalance) <= Number.MAX_SAFE_INTEGER;
  const difference = valid ? actualBalance - balance : null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) { setError("Masukkan saldo aktual yang valid."); return; }
    setBusy(true);
    setError("");
    try {
      const delta = await reconcileAccount(account.id!, actualBalance, balance, note);
      onSaved(delta);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencocokkan saldo.");
      try {
        const latest = await recalculateAccountBalance(account.id!);
        if (latest !== undefined) setBalance(latest);
      } catch { /* Keep the form open so the user can retry. */ }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title="Cocokkan saldo">
      <form onSubmit={save} className="space-y-4">
        <div>
          <p className="break-words text-sm font-semibold">{account.name}</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Bandingkan dengan saldo bank atau dompet saat ini.</p>
        </div>
        <dl className="rounded-2xl bg-[hsl(var(--surface-2))] p-3">
          <dt className="text-xs text-[hsl(var(--muted-foreground))]">Saldo aplikasi</dt>
          <dd className="mt-1 break-words text-lg font-semibold tabular-nums">{formatCurrency(balance, currency)}</dd>
        </dl>
        <Input label="Saldo aktual" aria-label="Saldo aktual" type="number" step="any" value={actual} disabled={busy} placeholder="0" onChange={(event) => { setActual(event.target.value); setError(""); }} />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Gunakan angka tanpa pemisah ribuan. Saldo kartu kredit boleh negatif.</p>
        <div role="status" aria-live="polite" className="rounded-2xl border border-[hsl(var(--border))] p-3">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Selisih saldo</p>
          <p className="mt-1 break-words font-semibold tabular-nums">{difference === null ? "—" : `${difference > 0 ? "+" : ""}${formatCurrency(difference, currency)}`}</p>
          {difference === 0 && <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Saldo sudah cocok. Tidak perlu penyesuaian.</p>}
        </div>
        <Textarea label="Catatan (opsional)" aria-label="Catatan penyesuaian" rows={2} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} placeholder="Misalnya: selisih uang tunai setelah dihitung" />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Selisih dicatat sebagai penyesuaian hari ini. Riwayat lama dan saldo awal tetap; penyesuaian tidak dihitung sebagai pemasukan atau pengeluaran.</p>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={onClose}>Batal</Button>
          <Button type="submit" className="flex-1" disabled={busy || !valid}>{busy ? "Menyimpan…" : difference === 0 ? "Selesai" : "Simpan penyesuaian"}</Button>
        </div>
      </form>
    </Modal>
  );
}
