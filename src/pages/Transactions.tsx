import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { Button, Input, Select, EmptyState, Modal } from "@/components/ui";
import { TransactionForm } from "@/components/forms/TransactionForm";
import { RecurringForm } from "@/components/forms/RecurringForm";
import { deleteTransaction } from "@/db/transactions";
import { getRecurringTransactions, deleteRecurring, updateRecurring } from "@/db/recurring";
import { db } from "@/db/db";
import { formatCurrency, formatDate, TRANSACTION_TYPE_BG } from "@/lib/utils";
import type { Transaction, RecurringTransaction, TransactionSplit } from "@/types";
import { Plus, Search, Filter, Trash2, Pencil, RefreshCw, Pause, Play, ChevronDown, ChevronUp } from "lucide-react";

const INTERVAL_LABEL: Record<string, string> = {
  daily: "Harian", weekly: "Mingguan", monthly: "Bulanan", yearly: "Tahunan",
};

export default function Transactions() {
  const { accounts, transactions, categories, filter, setFilter, refreshAll } = useWalletStore();
  const { currency } = useSettingsStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"all" | "recurring">(() => searchParams.get("tab") === "recurring" ? "recurring" : "all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [search, setSearch] = useState(filter.search ?? "");
  const [deleteTxId, setDeleteTxId] = useState<number | null>(null);
  // Recurring state
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [recurringFormOpen, setRecurringFormOpen] = useState(false);
  const [editRecurring, setEditRecurring] = useState<RecurringTransaction | null>(null);
  const [deleteRecurringId, setDeleteRecurringId] = useState<number | null>(null);
  const [splitMap, setSplitMap] = useState<Record<number, TransactionSplit[]>>({});
  const [expandedSplitId, setExpandedSplitId] = useState<number | null>(null);

  useEffect(() => {
    setSearch(filter.search ?? "");
  }, [filter.search]);

  useEffect(() => {
    void refreshAll();
    void loadRecurring();
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "recurring" || tab === "all") {
      setActiveTab(tab);
      return;
    }
    setActiveTab("all");
  }, [searchParams]);

  useEffect(() => {
    void loadSplits();
  }, [transactions]);

  async function loadSplits() {
    const rows = await db.transactionSplits.toArray();
    const map: Record<number, TransactionSplit[]> = {};
    for (const s of rows) {
      if (!map[s.transactionId]) map[s.transactionId] = [];
      map[s.transactionId].push(s);
    }
    setSplitMap(map);
  }

  async function loadRecurring() {
    setRecurring(await getRecurringTransactions());
  }

  function getAccountName(id: number) {
    return accounts.find((a) => a.id === id)?.name ?? "?";
  }
  function getCategory(id?: number) {
    if (!id) return null;
    return categories.find((c) => c.id === id) ?? null;
  }

  async function handleDelete(id: number) {
    await deleteTransaction(id);
    await refreshAll();
    setDeleteTxId(null);
  }

  async function handleDeleteRecurring(id: number) {
    await deleteRecurring(id);
    await loadRecurring();
    setDeleteRecurringId(null);
  }

  async function handleToggleRecurring(rec: RecurringTransaction) {
    await updateRecurring(rec.id!, { isActive: !rec.isActive });
    await loadRecurring();
  }

  function handleSearch(val: string) {
    setSearch(val);
    setFilter({ ...filter, search: val || undefined });
  }

  const groupedByDate: Record<string, Transaction[]> = {};
  for (const tx of transactions) {
    if (!groupedByDate[tx.date]) groupedByDate[tx.date] = [];
    groupedByDate[tx.date].push(tx);
  }
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  function handleTabChange(tab: "all" | "recurring") {
    setActiveTab(tab);
    setSearchParams(tab === "all" ? {} : { tab });
  }

  const activeFilterChips = [
    filter.search ? {
      key: "search",
      label: `Cari: ${filter.search}`,
      onRemove: () => {
        setSearch("");
        setFilter({ ...filter, search: undefined });
      },
    } : null,
    filter.accountId !== undefined ? {
      key: "accountId",
      label: `Akun: ${getAccountName(filter.accountId)}`,
      onRemove: () => setFilter({ ...filter, accountId: undefined }),
    } : null,
    filter.type ? {
      key: "type",
      label: `Tipe: ${filter.type === "income" ? "Pemasukan" : filter.type === "expense" ? "Pengeluaran" : "Transfer"}`,
      onRemove: () => setFilter({ ...filter, type: undefined }),
    } : null,
    filter.dateFrom ? {
      key: "dateFrom",
      label: `Dari: ${formatDate(filter.dateFrom, "dd MMM")}`,
      onRemove: () => setFilter({ ...filter, dateFrom: undefined }),
    } : null,
    filter.dateTo ? {
      key: "dateTo",
      label: `Sampai: ${formatDate(filter.dateTo, "dd MMM")}`,
      onRemove: () => setFilter({ ...filter, dateTo: undefined }),
    } : null,
  ].filter((item): item is { key: string; label: string; onRemove: () => void } => item !== null);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold">Transaksi</h1>
        <div className="flex gap-2">
          {activeTab === "all" && (
            <Button size="icon" variant="outline" onClick={() => setShowFilter(!showFilter)} className="relative">
              <Filter size={16} />
              {activeFilterChips.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-indigo-600 text-white text-[10px] leading-4 font-bold">
                  {activeFilterChips.length}
                </span>
              )}
            </Button>
          )}
          <Button size="sm" onClick={() => activeTab === "recurring" ? setRecurringFormOpen(true) : setAddOpen(true)}>
            <Plus size={16} /> Tambah
          </Button>
        </div>
      </div>

      {/* Tab toggle */}
      <div className="flex rounded-xl border border-[hsl(var(--border))] overflow-hidden text-sm">
        <button
          onClick={() => handleTabChange("all")}
          className={`flex-1 py-2 font-medium transition-colors ${activeTab === "all" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
        >
          Semua
        </button>
        <button
          onClick={() => handleTabChange("recurring")}
          className={`flex-1 py-2 font-medium transition-colors flex items-center justify-center gap-1.5 ${activeTab === "recurring" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
        >
          <RefreshCw size={13} /> Terjadwal
          {recurring.length > 0 && (
            <span className={`text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold ${activeTab === "recurring" ? "bg-white/30 text-white" : "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400"}`}>
              {recurring.length}
            </span>
          )}
        </button>
      </div>

      {/* Search — only on "all" tab */}
      {activeTab === "all" && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <input
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-[hsl(var(--border))] bg-transparent text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Cari transaksi..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      )}

      {activeTab === "all" && activeFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              onClick={chip.onRemove}
              className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
            >
              <span>{chip.label}</span>
              <span className="text-[hsl(var(--muted-foreground))]">×</span>
            </button>
          ))}
          <button
            onClick={() => {
              setSearch("");
              setFilter({});
            }}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Reset semua
          </button>
        </div>
      )}

      {/* Filters */}
      {activeTab === "all" && showFilter && (
        <div className="space-y-3 p-3 rounded-xl bg-[hsl(var(--muted))]">
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Akun"
              value={String(filter.accountId ?? "")}
              onChange={(e) => setFilter({ ...filter, accountId: e.target.value ? Number(e.target.value) : undefined })}
            >
              <option value="">Semua Akun</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select
              label="Tipe"
              value={filter.type ?? ""}
              onChange={(e) => setFilter({ ...filter, type: (e.target.value as Transaction["type"]) || undefined })}
            >
              <option value="">Semua Tipe</option>
              <option value="income">Pemasukan</option>
              <option value="expense">Pengeluaran</option>
              <option value="transfer">Transfer</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Dari Tanggal"
              type="date"
              value={filter.dateFrom ?? ""}
              onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value || undefined })}
            />
            <Input
              label="Sampai Tanggal"
              type="date"
              value={filter.dateTo ?? ""}
              onChange={(e) => setFilter({ ...filter, dateTo: e.target.value || undefined })}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => { setFilter({}); setSearch(""); }}>
            Reset Filter
          </Button>
        </div>
      )}

      {/* All Transactions tab */}
      {activeTab === "all" && (
        transactions.length === 0 ? (
          <EmptyState icon="📋" title="Belum ada transaksi" description="Tap + Tambah untuk mencatat transaksi baru" />
        ) : (
          <div className="space-y-4">
            {sortedDates.map((date) => {
              const dayTxs = groupedByDate[date];
              const dayIncome = dayTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
              const dayExpense = dayTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
              return (
                <div key={date}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{formatDate(date, "EEEE, dd MMM")}</p>
                    <div className="flex gap-2 text-xs">
                      {dayIncome > 0 && <span className="text-emerald-500">+{formatCurrency(dayIncome, currency)}</span>}
                      {dayExpense > 0 && <span className="text-red-500">-{formatCurrency(dayExpense, currency)}</span>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {dayTxs.map((tx) => {
                      const cat = getCategory(tx.categoryId);
                      const txSplits = splitMap[tx.id!] ?? [];
                      const hasSplits = txSplits.length > 0;
                      const isExpanded = expandedSplitId === tx.id;
                      return (
                        <div key={tx.id} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
                          <div className="flex items-center gap-3 p-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-none ${TRANSACTION_TYPE_BG[tx.type]}`}>
                              {hasSplits ? "✂️" : cat ? cat.icon : tx.type === "income" ? "💰" : tx.type === "expense" ? "💸" : "↔️"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{tx.note || (hasSplits ? "Split Kategori" : cat?.name) || getAccountName(tx.accountId)}</p>
                              <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                                {getAccountName(tx.accountId)}
                                {tx.toAccountId ? ` → ${getAccountName(tx.toAccountId)}` : ""}
                                {hasSplits ? ` · ${txSplits.length} kategori` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 text-right">
                              <p className={`font-semibold text-sm ${tx.type === "income" ? "text-emerald-500" : tx.type === "expense" ? "text-red-500" : "text-amber-500"}`}>
                                {tx.type === "expense" ? "-" : tx.type === "income" ? "+" : ""}
                                {formatCurrency(tx.amount, currency)}
                              </p>
                              {hasSplits && (
                                <button
                                  onClick={() => setExpandedSplitId(isExpanded ? null : tx.id!)}
                                  className="p-1 text-[hsl(var(--muted-foreground))] hover:text-indigo-500"
                                >
                                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                              )}
                              <button onClick={() => setEditTarget(tx)} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-indigo-500">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => setDeleteTxId(tx.id!)} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-red-500">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          {hasSplits && isExpanded && (
                            <div className="px-3 pb-3 pt-1 border-t border-[hsl(var(--border))] space-y-1.5">
                              {txSplits.map((s, i) => {
                                const splitCat = getCategory(s.categoryId);
                                return (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <span
                                      className="w-5 h-5 rounded-lg flex items-center justify-center flex-none"
                                      style={{ background: splitCat ? `${splitCat.color}22` : undefined }}
                                    >
                                      {splitCat?.icon ?? "📦"}
                                    </span>
                                    <span className="flex-1 text-[hsl(var(--foreground))]">{splitCat?.name ?? "Kategori tidak ditemukan"}</span>
                                    {s.note && <span className="text-[hsl(var(--muted-foreground))] italic truncate max-w-20">{s.note}</span>}
                                    <span className={`font-semibold ${tx.type === "income" ? "text-emerald-500" : "text-red-500"}`}>
                                      {tx.type === "expense" ? "-" : "+"}{formatCurrency(s.amount, currency)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Recurring tab */}
      {activeTab === "recurring" && (
        recurring.length === 0 ? (
          <EmptyState icon="🔄" title="Belum ada transaksi terjadwal" description="Tap + Tambah untuk membuat transaksi otomatis seperti gaji atau tagihan bulanan" />
        ) : (
          <div className="space-y-3">
            {recurring.map((rec) => {
              const cat = getCategory(rec.categoryId);
              return (
                <div key={rec.id} className={`flex items-center gap-3 p-3 rounded-2xl border bg-[hsl(var(--card))] ${rec.isActive ? "border-[hsl(var(--border))]" : "border-dashed border-[hsl(var(--border))] opacity-60"}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-none ${rec.type === "income" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                    {cat ? cat.icon : rec.type === "income" ? "💰" : "💸"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{rec.note || cat?.name || "Tanpa nama"}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {getAccountName(rec.accountId)} · {INTERVAL_LABEL[rec.interval]} · Berikutnya {formatDate(rec.nextDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <p className={`font-semibold text-sm ${rec.type === "income" ? "text-emerald-500" : "text-red-500"}`}>
                      {rec.type === "expense" ? "-" : "+"}{formatCurrency(rec.amount, currency)}
                    </p>
                    <button onClick={() => handleToggleRecurring(rec)} className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-indigo-500 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                      {rec.isActive ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button onClick={() => setEditRecurring(rec)} className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-indigo-500 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteRecurringId(rec.id!)} className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Modals ── */}
      <TransactionForm
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => void refreshAll()}
        accounts={accounts.filter((a) => !a.isArchived) as typeof accounts}
        categories={categories}
      />

      {editTarget && (
        <TransactionForm
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { void refreshAll(); setEditTarget(null); }}
          accounts={accounts.filter((a) => !a.isArchived) as typeof accounts}
          categories={categories}
          existing={editTarget}
        />
      )}

      <RecurringForm
        key={editRecurring?.id ?? "recurring-new"}
        open={recurringFormOpen || editRecurring !== null}
        onClose={() => { setRecurringFormOpen(false); setEditRecurring(null); }}
        onSaved={() => { void loadRecurring(); setRecurringFormOpen(false); setEditRecurring(null); }}
        accounts={accounts.filter((a) => !a.isArchived) as typeof accounts}
        categories={categories}
        existing={editRecurring ?? undefined}
      />

      <Modal open={deleteTxId !== null} onClose={() => setDeleteTxId(null)} title="Hapus Transaksi">
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">Yakin ingin menghapus transaksi ini? Aksi ini tidak bisa dibatalkan.</p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setDeleteTxId(null)}>Batal</Button>
          <Button variant="destructive" className="flex-1" onClick={() => deleteTxId !== null && handleDelete(deleteTxId)}>Hapus</Button>
        </div>
      </Modal>

      <Modal open={deleteRecurringId !== null} onClose={() => setDeleteRecurringId(null)} title="Hapus Transaksi Terjadwal">
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">Yakin ingin menghapus jadwal ini? Transaksi yang sudah dicatat tidak akan terpengaruh.</p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setDeleteRecurringId(null)}>Batal</Button>
          <Button variant="destructive" className="flex-1" onClick={() => deleteRecurringId !== null && handleDeleteRecurring(deleteRecurringId)}>Hapus</Button>
        </div>
      </Modal>
    </div>
  );
}
