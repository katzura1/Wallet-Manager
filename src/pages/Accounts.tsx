import { useEffect, useState } from "react";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { Button, EmptyState, Badge, Modal } from "@/components/ui";
import { AccountForm } from "@/components/forms/AccountForm";
import { archiveAccount, deleteAccount } from "@/db/accounts";
import { formatCurrency, ACCOUNT_TYPE_LABELS } from "@/lib/utils";
import type { Account } from "@/types";
import { Plus, Archive, Trash2, Pencil } from "lucide-react";

export default function Accounts() {
  const { accounts, loadAccounts } = useWalletStore();
  const { currency } = useSettingsStore();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  useEffect(() => {
    void loadAccounts();
  }, []);

  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const archivedAccounts = accounts.filter((a) => a.isArchived);
  const totalBalance = activeAccounts.reduce((s, a) => s + a.currentBalance, 0);

  async function handleArchive(acc: Account) {
    await archiveAccount(acc.id!);
    await loadAccounts();
  }

  async function handleDelete(acc: Account) {
    await deleteAccount(acc.id!);
    await loadAccounts();
    setDeleteTarget(null);
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold">Akun Saya</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Total: {formatCurrency(totalBalance, currency)}</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus size={16} /> Tambah
        </Button>
      </div>

      {activeAccounts.length === 0 ? (
        <EmptyState icon="💳" title="Belum ada akun" description="Tambah akun bank atau e-wallet untuk mulai tracking" />
      ) : (
        <div className="space-y-3">
          {activeAccounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              currency={currency}
              onEdit={() => setEditTarget(account)}
              onArchive={() => handleArchive(account)}
              onDelete={() => setDeleteTarget(account)}
            />
          ))}
        </div>
      )}

      {archivedAccounts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] mb-2 uppercase tracking-wider">Diarsipkan</p>
          <div className="space-y-2 opacity-60">
            {archivedAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                currency={currency}
                onEdit={() => setEditTarget(account)}
                onArchive={() => handleArchive(account)}
                onDelete={() => setDeleteTarget(account)}
              />
            ))}
          </div>
        </div>
      )}

      <AccountForm open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => void loadAccounts()} />

      {editTarget && (
        <AccountForm
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            void loadAccounts();
            setEditTarget(null);
          }}
          existing={editTarget}
        />
      )}

      {/* Delete confirmation modal */}
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
}: {
  account: Account;
  currency: string;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] overflow-hidden bg-[hsl(var(--card))]">
      <div className="flex items-center gap-4 p-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-none" style={{ background: account.color + "25" }}>
          {account.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm">{account.name}</p>
            <Badge className="text-white text-[10px]" style={{ background: account.color }}>
              {ACCOUNT_TYPE_LABELS[account.type]}
            </Badge>
          </div>
          <p className="text-xl font-bold mt-0.5">{formatCurrency(account.currentBalance, currency)}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            <Pencil size={15} />
          </button>
          <button onClick={onArchive} className="p-2 text-[hsl(var(--muted-foreground))] hover:text-amber-500">
            <Archive size={15} />
          </button>
          <button onClick={onDelete} className="p-2 text-[hsl(var(--muted-foreground))] hover:text-red-500">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
