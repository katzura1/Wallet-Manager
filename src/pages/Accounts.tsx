import { useEffect, useState } from "react";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { Button, EmptyState, Badge, Modal, Spinner } from "@/components/ui";
import { AccountForm } from "@/components/forms/AccountForm";
import { archiveAccount, deleteAccount, updateAccount } from "@/db/accounts";
import { formatCurrency, ACCOUNT_TYPE_LABELS } from "@/lib/utils";
import type { Account } from "@/types";
import { Plus, Archive, Trash2, Pencil, Wallet, Layers3 } from "lucide-react";

export default function Accounts() {
  const { accounts, loadAccounts } = useWalletStore();
  const { currency } = useSettingsStore();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Account | null>(null);
  const [view, setView] = useState<"active" | "archived">("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    void hydrate();
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  async function hydrate() {
    setLoading(true);
    setError(null);
    try {
      await loadAccounts();
    } catch {
      setError("Gagal memuat daftar akun. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const archivedAccounts = accounts.filter((a) => a.isArchived);
  const totalBalance = activeAccounts.reduce((s, a) => s + a.currentBalance, 0);

  async function handleToggleArchive(acc: Account) {
    setBusyId(acc.id ?? null);
    try {
      if (acc.isArchived) {
        await updateAccount(acc.id!, { isArchived: false });
        setFeedback({ type: "success", text: `${acc.name} dipulihkan.` });
      } else {
        await archiveAccount(acc.id!);
        setFeedback({ type: "success", text: `${acc.name} diarsipkan.` });
      }
      await hydrate();
    } catch {
      setFeedback({ type: "error", text: "Aksi arsip gagal diproses." });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(acc: Account) {
    setBusyId(acc.id ?? null);
    try {
      await deleteAccount(acc.id!);
      await hydrate();
      setFeedback({ type: "success", text: `${acc.name} dihapus.` });
      setDeleteTarget(null);
    } catch {
      setFeedback({ type: "error", text: "Gagal menghapus akun." });
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmArchive() {
    if (!archiveTarget) return;
    await handleToggleArchive(archiveTarget);
    setArchiveTarget(null);
  }

  const visibleAccounts = view === "active" ? activeAccounts : archivedAccounts;

  return (
    <div className="p-3 space-y-3.5">
      <div className="pt-1 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">Akun Saya</h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Kelola akun aktif dan arsip dengan cepat</p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} disabled={loading}>
            <Plus size={16} /> Tambah
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2.5">
            <p className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1.5"><Wallet size={13} /> Total Saldo Aktif</p>
            <p className="text-sm font-bold mt-0.5 truncate">{formatCurrency(totalBalance, currency)}</p>
          </div>
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2.5">
            <p className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1.5"><Layers3 size={13} /> Jumlah Akun</p>
            <p className="text-sm font-bold mt-0.5">{activeAccounts.length} aktif • {archivedAccounts.length} arsip</p>
          </div>
        </div>
      </div>

      {feedback && (
        <div className={`rounded-xl border px-3 py-2 text-sm ${feedback.type === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"}`}>
          {feedback.text}
        </div>
      )}

      <div className="flex rounded-xl border border-[hsl(var(--border))] overflow-hidden text-xs">
        <button
          onClick={() => setView("active")}
          className={`flex-1 py-1.5 font-medium transition-colors ${view === "active" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
        >
          Aktif ({activeAccounts.length})
        </button>
        <button
          onClick={() => setView("archived")}
          className={`flex-1 py-1.5 font-medium transition-colors ${view === "archived" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
        >
          Arsip ({archivedAccounts.length})
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <Spinner />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 space-y-3">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void hydrate()}>Coba lagi</Button>
        </div>
      ) : visibleAccounts.length === 0 ? (
        <EmptyState
          icon={view === "active" ? "💳" : "🗃️"}
          title={view === "active" ? "Belum ada akun aktif" : "Belum ada akun diarsipkan"}
          description={view === "active" ? "Tap Tambah untuk mulai tracking saldo akun" : "Akun yang diarsipkan akan muncul di sini"}
        />
      ) : (
        <div className="space-y-2">
          {visibleAccounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              currency={currency}
              onEdit={() => setEditTarget(account)}
              onArchive={() => setArchiveTarget(account)}
              onDelete={() => setDeleteTarget(account)}
              busy={busyId === account.id}
            />
          ))}
        </div>
      )}

      <AccountForm
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          void hydrate();
          setFeedback({ type: "success", text: "Akun baru berhasil ditambahkan." });
        }}
      />

      {editTarget && (
        <AccountForm
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            void hydrate();
            setFeedback({ type: "success", text: "Perubahan akun disimpan." });
            setEditTarget(null);
          }}
          existing={editTarget}
        />
      )}

      {/* Delete confirmation modal */}
      <Modal open={!!archiveTarget} onClose={() => setArchiveTarget(null)} title={archiveTarget?.isArchived ? "Pulihkan Akun" : "Arsipkan Akun"}>
        <div className="space-y-4">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {archiveTarget?.isArchived
              ? <>Pulihkan akun <strong>{archiveTarget?.name}</strong> ke daftar aktif?</>
              : <>Arsipkan akun <strong>{archiveTarget?.name}</strong>? Akun tidak dihapus dan bisa dipulihkan kapan saja.</>}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setArchiveTarget(null)}>
              Batal
            </Button>
            <Button className="flex-1" onClick={() => void handleConfirmArchive()}>
              {archiveTarget?.isArchived ? "Pulihkan" : "Arsipkan"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Hapus Akun">
        <div className="space-y-4">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Yakin ingin menghapus akun <strong>{deleteTarget?.name}</strong>? Semua transaksi di akun ini akan ikut terhapus.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
              Batal
            </Button>
            <Button variant="destructive" className="flex-1" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              Hapus
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AccountCard({
  account,
  currency,
  onEdit,
  onArchive,
  onDelete,
  busy,
}: {
  account: Account;
  currency: string;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-[hsl(var(--border))] overflow-hidden bg-[hsl(var(--card))] ${account.isArchived ? "opacity-80" : ""}`}>
      <div className="flex items-center gap-3 p-3 pb-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-none" style={{ background: account.color + "25" }}>
          {account.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm flex-1">{account.name}</p>
            <Badge className="text-white text-[10px]" style={{ background: account.color }}>
              {ACCOUNT_TYPE_LABELS[account.type]}
            </Badge>
            <Badge className={account.isArchived ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}>
              {account.isArchived ? "Arsip" : "Aktif"}
            </Badge>
          </div>
          <p className="text-base font-bold mt-0.5">{formatCurrency(account.currentBalance, currency)}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 px-2.5 pb-2.5">
        <button
          onClick={onEdit}
          disabled={busy}
          aria-label={`Edit ${account.name}`}
          title={`Edit ${account.name}`}
          className="h-8 rounded-xl border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] inline-flex items-center justify-center gap-1 text-[11px] font-medium"
        >
          <Pencil size={14} />
          Edit
        </button>
        <button
          onClick={onArchive}
          disabled={busy}
          aria-label={account.isArchived ? `Pulihkan ${account.name}` : `Arsipkan ${account.name}`}
          title={account.isArchived ? `Pulihkan ${account.name}` : `Arsipkan ${account.name}`}
          className="h-8 rounded-xl border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-amber-500 hover:bg-amber-500/10 inline-flex items-center justify-center gap-1 text-[11px] font-medium"
        >
          <Archive size={14} />
          {account.isArchived ? "Pulihkan" : "Arsipkan"}
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          aria-label={`Hapus ${account.name}`}
          title={`Hapus ${account.name}`}
          className="h-8 rounded-xl border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-red-500 hover:bg-red-500/10 inline-flex items-center justify-center gap-1 text-[11px] font-medium"
        >
          <Trash2 size={14} />
          Hapus
        </button>
      </div>
    </div>
  );
}
