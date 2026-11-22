import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { Button, EmptyState, Modal, Spinner, PageHeader, ProgressBar, ListGroup, Sheet } from "@/components/ui";
import { ReconcileAccountForm } from "@/components/forms/ReconcileAccountForm";
import { AccountForm } from "@/components/forms/AccountForm";
import { archiveAccount, deleteAccount, updateAccount } from "@/db/accounts";
import { formatCurrency, formatDate, cn, ACCOUNT_TYPE_LABELS } from "@/lib/utils";
import { getDebts } from "@/db/debts";
import { getAssets } from "@/db/assets";
import { getTransactions } from "@/db/transactions";
import { db } from "@/db/db";
import { getPortfolioMetrics } from "@/lib/portfolioMetrics";
import { getNetWorth } from "@/lib/netWorth";
import type { Account, AssetPrice, Debt, Transaction } from "@/types";
import { Archive, Trash2, Pencil, Settings, Plus, ChevronRight, Briefcase, HandCoins } from "lucide-react";
import { usePageAction } from "@/components/layout/appLayoutContext";

export default function Accounts() {
  const { accounts, loadAccounts } = useWalletStore();
  const { currency } = useSettingsStore();
  const [addOpen, setAddOpen] = useState(false);
  const [reconcileTarget, setReconcileTarget] = useState<Account | null>(null);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Account | null>(null);
  const [view, setView] = useState<"active" | "archived">("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [portfolio, setPortfolio] = useState({ totalValue: 0, totalGain: null as number | null, unpricedAssetCount: 0 });
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadHub = useCallback(async () => {
    try {
      const [debtRows, assets, storedPrices] = await Promise.all([getDebts(), getAssets(), db.assetPrices.toArray()]);
      const priceMap: Record<string, AssetPrice> = {};
      for (const price of storedPrices) priceMap[price.symbol] = price;
      const metrics = getPortfolioMetrics(assets, priceMap);
      setDebts(debtRows);
      setPortfolio({ totalValue: metrics.totalValue, totalGain: metrics.totalGain, unpricedAssetCount: metrics.unpricedAssetCount });
    } catch {
      // Net worth extras are best effort; the account list still works.
    }
  }, []);

  const hydrate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadAccounts();
      void loadHub();
    } catch {
      setError("Gagal memuat daftar akun. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [loadAccounts, loadHub]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const archivedAccounts = accounts.filter((a) => a.isArchived);
  const netWorth = useMemo(() => getNetWorth(accounts, portfolio, debts), [accounts, portfolio, debts]);
  const openDebts = debts.filter((d) => !d.isSettled);
  const totalOwe = openDebts.filter((d) => d.type === "owe").reduce((sum, d) => sum + d.remaining, 0);
  const totalOwed = openDebts.filter((d) => d.type === "owed").reduce((sum, d) => sum + d.remaining, 0);

  usePageAction({ label: "Tambah akun", onClick: () => setAddOpen(true) });

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
  const selected = accounts.find((a) => a.id === selectedId && (!a.isArchived || view === "archived"))
    ?? (view === "active" ? activeAccounts[0] : archivedAccounts[0]);
  const allocationBase = Math.max(netWorth.cash, 0) + netWorth.investments;

  function selectAccount(account: Account) {
    setSelectedId(account.id ?? null);
    if (!window.matchMedia("(min-width: 1024px)").matches) setSheetOpen(true);
  }

  function renderDetail(account: Account, inSheet: boolean) {
    return (
      <AccountDetail
        key={account.id}
        account={account}
        currency={currency}
        busy={busyId === account.id}
        onReconcile={() => { setSheetOpen(false); setReconcileTarget(account); }}
        onEdit={() => { setSheetOpen(false); setEditTarget(account); }}
        onArchive={() => { setSheetOpen(false); setArchiveTarget(account); }}
        onDelete={() => { setSheetOpen(false); setDeleteTarget(account); }}
        inSheet={inSheet}
      />
    );
  }

  const rows = (list: Account[]) => (
    <ListGroup>
      {list.map((account) => (
        <button
          key={account.id}
          type="button"
          onClick={() => selectAccount(account)}
          aria-label={`Buka ${account.name}`}
          className={cn(
            "flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]",
            account.id === selected?.id && "lg:bg-[hsl(var(--surface-2))]",
          )}
        >
          <Avatar account={account} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{account.name}</span>
            <span className="block text-xs text-[hsl(var(--muted-foreground))]">{ACCOUNT_TYPE_LABELS[account.type]}</span>
          </span>
          <span className={cn("shrink-0 text-sm font-semibold tabular-nums", account.currentBalance < 0 && "text-danger")}>{formatCurrency(account.currentBalance, currency)}</span>
          <ChevronRight size={16} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
        </button>
      ))}
    </ListGroup>
  );

  return (
    <div className="space-y-4 px-4 pt-5 pb-4 lg:px-0 lg:pt-7">
      <PageHeader
        title="Aset"
        actions={
          <Link
            to="/settings"
            aria-label="Pengaturan"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            <Settings size={20} />
          </Link>
        }
      />

      <section aria-label="Kekayaan bersih" className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Kekayaan bersih</p>
        <p className={cn("mt-1 text-3xl font-semibold tracking-tight tabular-nums", netWorth.total < 0 && "text-danger")}>{formatCurrency(netWorth.total, currency)}</p>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
          {[
            { label: "Kas & bank", value: netWorth.cash },
            { label: "Investasi", value: netWorth.investments },
            { label: "Hutang bersih", value: netWorth.debtNet },
          ].map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-[hsl(var(--muted-foreground))]">{item.label}</dt>
              <dd className={cn("mt-0.5 truncate text-sm font-semibold tabular-nums", item.value < 0 && "text-danger")}>{formatCurrency(item.value, currency)}</dd>
            </div>
          ))}
        </dl>
        {allocationBase > 0 && (
          <div className="mt-4 space-y-1.5">
            <ProgressBar value={netWorth.investments} max={allocationBase} label="Alokasi investasi" />
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Kas {Math.round((Math.max(netWorth.cash, 0) / allocationBase) * 100)}% · Investasi {Math.round((netWorth.investments / allocationBase) * 100)}%</p>
          </div>
        )}
        {netWorth.unpricedAssetCount > 0 && (
          <p className="mt-3 text-xs text-warning">{netWorth.unpricedAssetCount} aset belum ada harga</p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link to="/debts" className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
          <HandCoins size={20} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Hutang & piutang</span>
            <span className="block truncate text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
              <span className="text-danger">{formatCurrency(totalOwe, currency)}</span> hutang · <span className="text-success">{formatCurrency(totalOwed, currency)}</span> piutang
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
        </Link>
        <Link to="/portfolio" className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
          <Briefcase size={20} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Portofolio</span>
            <span className="block truncate text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
              {formatCurrency(portfolio.totalValue, currency)}
              {portfolio.totalGain !== null && <span className={portfolio.totalGain >= 0 ? "text-success" : "text-danger"}> · {portfolio.totalGain >= 0 ? "+" : ""}{formatCurrency(portfolio.totalGain, currency)}</span>}
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
        </Link>
      </div>

      {feedback && (
        <div role="status" className={cn("rounded-xl border px-3 py-2 text-sm", feedback.type === "success" ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger")}>
          {feedback.text}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <Spinner />
        </div>
      ) : error ? (
        <div className="space-y-3 rounded-2xl border border-danger/40 bg-danger/10 p-4">
          <p className="text-sm text-danger">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void hydrate()}>Coba lagi</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Akun ({activeAccounts.length})</h2>
              <button type="button" onClick={() => setAddOpen(true)} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-medium text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
                <Plus size={16} /> Tambah akun
              </button>
            </div>
            {activeAccounts.length === 0 ? (
              <EmptyState icon="💳" title="Belum ada akun aktif" description="Tap Tambah untuk mulai tracking saldo akun" />
            ) : rows(activeAccounts)}
            {archivedAccounts.length > 0 && (
              <>
                <button
                  type="button"
                  aria-expanded={view === "archived"}
                  onClick={() => setView(view === "archived" ? "active" : "archived")}
                  className="flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-sm font-medium text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                >
                  <span>Akun diarsipkan ({archivedAccounts.length})</span>
                  <ChevronRight size={16} className={cn("transition-transform", view === "archived" && "rotate-90")} />
                </button>
                {view === "archived" && rows(archivedAccounts)}
              </>
            )}
          </div>
          <aside className="hidden min-w-0 lg:block" aria-label="Detail akun">
            {selected && visibleAccounts.length > 0 ? renderDetail(selected, false) : (
              <p className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Pilih akun untuk melihat detail.</p>
            )}
          </aside>
        </div>
      )}

      <Sheet open={sheetOpen && !!selected} onClose={() => setSheetOpen(false)} title={selected?.name ?? "Akun"}>
        <div className="min-h-0 overflow-y-auto p-5">{selected && renderDetail(selected, true)}</div>
      </Sheet>

      {reconcileTarget && (
        <ReconcileAccountForm
          account={reconcileTarget}
          currency={currency}
          onClose={() => setReconcileTarget(null)}
          onSaved={(difference) => {
            void useWalletStore.getState().refreshAll().catch(() => setFeedback({ type: "error", text: "Penyesuaian tersimpan. Muat ulang untuk melihat saldo terbaru." }));
            setFeedback({ type: "success", text: difference === 0 ? "Saldo sudah cocok. Tidak ada transaksi baru." : "Penyesuaian saldo tersimpan." });
          }}
        />
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

function Avatar({ account, large }: { account: Account; large?: boolean }) {
  const initials = account.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold", large ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm")}
      style={{ background: account.color + "25", color: account.color }}
    >
      {initials}
    </span>
  );
}

function AccountDetail({
  account,
  currency,
  inSheet,
  onEdit,
  onReconcile,
  onArchive,
  onDelete,
  busy,
}: {
  account: Account;
  currency: string;
  inSheet: boolean;
  onEdit: () => void;
  onReconcile: () => void;
  onArchive: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [recent, setRecent] = useState<Transaction[]>([]);
  const balance = account.currentBalance;
  useEffect(() => {
    let cancelled = false;
    getTransactions({ accountIds: [account.id!] }).then((rows) => { if (!cancelled) setRecent(rows.slice(0, 5)); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [account.id, balance]);

  const actionCls = "flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[hsl(var(--border))] px-3 text-sm font-medium hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";
  const smallBtn = "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--border))] text-xs font-medium disabled:opacity-50 hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";
  return (
    <div className={cn("space-y-4", !inSheet && "rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5")}>
      <div className="flex items-center gap-3">
        <Avatar account={account} large />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{account.name}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{ACCOUNT_TYPE_LABELS[account.type]}{account.isArchived ? " · Diarsipkan" : ""}</p>
        </div>
      </div>
      <p className={cn("text-3xl font-semibold tracking-tight tabular-nums", balance < 0 && "text-danger")}>{formatCurrency(balance, currency)}</p>

      {!account.isArchived && (
        <div className="flex gap-2">
          <Link to="/transactions?new=1" className={actionCls}>Catat</Link>
          <Link to="/transactions?new=1" className={actionCls}>Transfer</Link>
          <Link to={`/reports?tab=ledger&account=${account.id}`} className={actionCls}>Mutasi</Link>
        </div>
      )}
      {account.isArchived && (
        <Link to={`/reports?tab=ledger&account=${account.id}`} className={actionCls}>Mutasi</Link>
      )}

      {!account.isArchived && (
        <div className="rounded-2xl bg-[hsl(var(--surface-2))] p-4">
          <p className="text-sm font-semibold">Cocokkan dengan saldo bank</p>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">Samakan saldo aplikasi dengan saldo sebenarnya.</p>
          <button type="button" onClick={onReconcile} disabled={busy} aria-label={`Cocokkan saldo ${account.name}`} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
            Cocokkan saldo
          </button>
        </div>
      )}

      <section aria-label="Transaksi terbaru akun" className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Transaksi terbaru</h3>
        {recent.length === 0 ? (
          <p className="py-3 text-sm text-[hsl(var(--muted-foreground))]">Belum ada transaksi.</p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {recent.map((tx) => {
              const outgoing = tx.type === "expense" || (tx.type === "transfer" && tx.accountId === account.id);
              return (
                <li key={tx.id} className="flex min-h-[46px] items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{tx.note || (tx.type === "transfer" ? "Transfer" : tx.isAdjustment ? "Penyesuaian saldo" : "Transaksi")}</span>
                    <span className="block text-xs text-[hsl(var(--muted-foreground))]">{formatDate(tx.date, "dd MMM")}</span>
                  </span>
                  <span className={cn("shrink-0 text-sm font-medium tabular-nums", outgoing ? "text-danger" : "text-success")}>{outgoing ? "-" : "+"}{formatCurrency(tx.amount, currency)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex gap-2">
        <button type="button" onClick={onEdit} disabled={busy} aria-label={`Edit ${account.name}`} className={smallBtn}><Pencil size={14} />Edit</button>
        <button type="button" onClick={onArchive} disabled={busy} aria-label={account.isArchived ? `Pulihkan ${account.name}` : `Arsipkan ${account.name}`} className={smallBtn}><Archive size={14} />{account.isArchived ? "Pulihkan" : "Arsipkan"}</button>
        <button type="button" onClick={onDelete} disabled={busy} aria-label={`Hapus ${account.name}`} className={cn(smallBtn, "text-danger")}><Trash2 size={14} />Hapus</button>
      </div>
    </div>
  );
}
