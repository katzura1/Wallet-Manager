import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { Button, Input, Select, EmptyState, Modal, Badge, Spinner } from "@/components/ui";
import { TransactionForm } from "@/components/forms/TransactionForm";
import { RecurringForm } from "@/components/forms/RecurringForm";
import { TransactionCard } from "@/components/TransactionCard";
import { deleteTransaction } from "@/db/transactions";
import { getRecurringTransactions, deleteRecurring, updateRecurring, getRecurringDueInfo, runRecurringNow, skipNextRecurring } from "@/db/recurring";
import { db } from "@/db/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Transaction, RecurringTransaction, TransactionSplit } from "@/types";
import { Plus, Search, Filter, Pencil, Trash2, RefreshCw, Pause, Play, SkipForward } from "lucide-react";

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
  const [recurringLoading, setRecurringLoading] = useState(true);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [recurringBusyId, setRecurringBusyId] = useState<number | null>(null);
  const [recurringFeedback, setRecurringFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [recurringFormOpen, setRecurringFormOpen] = useState(false);
  const [editRecurring, setEditRecurring] = useState<RecurringTransaction | null>(null);
  const [deleteRecurringId, setDeleteRecurringId] = useState<number | null>(null);
  const [pendingRecurringAction, setPendingRecurringAction] = useState<{ rec: RecurringTransaction; action: "toggle" | "run" | "skip" } | null>(null);
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
    if (!recurringFeedback) return;
    const timer = window.setTimeout(() => setRecurringFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [recurringFeedback]);

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
    setRecurringLoading(true);
    setRecurringError(null);
    try {
      setRecurring(await getRecurringTransactions());
    } catch {
      setRecurringError("Gagal memuat transaksi terjadwal.");
    } finally {
      setRecurringLoading(false);
    }
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
    setRecurringBusyId(id);
    try {
      await deleteRecurring(id);
      await loadRecurring();
      setDeleteRecurringId(null);
      setRecurringFeedback({ type: "success", text: "Jadwal berhasil dihapus." });
    } catch {
      setRecurringFeedback({ type: "error", text: "Gagal menghapus jadwal." });
    } finally {
      setRecurringBusyId(null);
    }
  }

  async function handleToggleRecurring(rec: RecurringTransaction) {
    setRecurringBusyId(rec.id ?? null);
    try {
      await updateRecurring(rec.id!, { isActive: !rec.isActive });
      await loadRecurring();
      setRecurringFeedback({ type: "success", text: rec.isActive ? "Jadwal dipause." : "Jadwal diaktifkan kembali." });
    } catch {
      setRecurringFeedback({ type: "error", text: "Gagal mengubah status jadwal." });
    } finally {
      setRecurringBusyId(null);
    }
  }

  async function handleRunRecurringNow(rec: RecurringTransaction) {
    setRecurringBusyId(rec.id ?? null);
    try {
      await runRecurringNow(rec.id!);
      await refreshAll();
      await loadRecurring();
      setRecurringFeedback({ type: "success", text: "Jadwal dijalankan sekarang." });
    } catch {
      setRecurringFeedback({ type: "error", text: "Gagal menjalankan jadwal sekarang." });
    } finally {
      setRecurringBusyId(null);
    }
  }

  async function handleSkipNextRecurring(rec: RecurringTransaction) {
    setRecurringBusyId(rec.id ?? null);
    try {
      await skipNextRecurring(rec.id!);
      await loadRecurring();
      setRecurringFeedback({ type: "success", text: "Jadwal berikutnya berhasil dilewati." });
    } catch {
      setRecurringFeedback({ type: "error", text: "Gagal melewati jadwal berikutnya." });
    } finally {
      setRecurringBusyId(null);
    }
  }

  function getDueClass(tone: "overdue" | "today" | "soon" | "upcoming") {
    if (tone === "overdue") return "bg-red-500/10 text-red-600 dark:text-red-400";
    if (tone === "today") return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    if (tone === "soon") return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400";
    return "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]";
  }

  function requestRecurringAction(rec: RecurringTransaction, action: "toggle" | "run" | "skip") {
    setPendingRecurringAction({ rec, action });
  }

  async function confirmRecurringAction() {
    if (!pendingRecurringAction) return;

    const { rec, action } = pendingRecurringAction;
    if (action === "toggle") {
      await handleToggleRecurring(rec);
    } else if (action === "run") {
      await handleRunRecurringNow(rec);
    } else {
      await handleSkipNextRecurring(rec);
    }

    setPendingRecurringAction(null);
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
    (filter.accountIds && filter.accountIds.length > 0) ? {
      key: "accountIds",
      label: `Akun: ${(filter.accountIds as number[]).map(id => getAccountName(id)).join(", ")}`,
      onRemove: () => setFilter({ ...filter, accountIds: undefined }),
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
          <div className="space-y-2">
            <p className="text-sm font-medium">Pilih Akun (Multiple):</p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {accounts.map((a) => (
                <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(filter.accountIds ?? []).includes(a.id!)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const current = (filter.accountIds ?? []) as number[];
                      if (e.target.checked) {
                        const newIds: number[] = [...current, a.id!];
                        setFilter({ ...filter, accountIds: newIds });
                      } else {
                        const newIds: number[] = current.filter((id) => id !== a.id!);
                        setFilter({ ...filter, accountIds: newIds.length > 0 ? newIds : undefined });
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">{a.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
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
                        <div key={tx.id}>
                          <TransactionCard
                            transaction={tx}
                            accountName={getAccountName(tx.accountId)}
                            toAccountName={tx.toAccountId ? getAccountName(tx.toAccountId) : undefined}
                            categoryLabel={hasSplits ? `Split · ${txSplits.length} kategori` : cat?.name}
                            categoryIcon={hasSplits ? "✂️" : cat?.icon}
                            currency={currency}
                            hasSplits={hasSplits}
                            isExpanded={isExpanded}
                            onExpandSplits={() => setExpandedSplitId(isExpanded ? null : tx.id!)}
                            onEdit={() => setEditTarget(tx)}
                            onDelete={() => setDeleteTxId(tx.id!)}
                          />
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
        recurringLoading ? (
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <Spinner />
          </div>
        ) : recurringError ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 space-y-3">
            <p className="text-sm text-red-700 dark:text-red-300">{recurringError}</p>
            <Button size="sm" variant="outline" onClick={() => void loadRecurring()}>Coba lagi</Button>
          </div>
        ) : recurring.length === 0 ? (
          <EmptyState icon="🔄" title="Belum ada transaksi terjadwal" description="Tap + Tambah untuk membuat transaksi otomatis seperti gaji atau tagihan bulanan" />
        ) : (
          <div className="space-y-2">
            {recurringFeedback && (
              <div className={`rounded-xl border px-3 py-2 text-sm ${recurringFeedback.type === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"}`}>
                {recurringFeedback.text}
              </div>
            )}

            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2.5">
              <p className="text-xs font-semibold">Ringkasan Jadwal</p>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">
                {recurring.filter((r) => r.isActive).length} aktif • {recurring.filter((r) => !r.isActive).length} pause
              </p>
            </div>

            {recurring.map((rec) => {
              const cat = getCategory(rec.categoryId);
              const due = getRecurringDueInfo(rec.nextDate);
              const isBusy = recurringBusyId === rec.id;
              return (
                <div key={rec.id} className={`rounded-xl border bg-[hsl(var(--card))] ${rec.isActive ? "border-[hsl(var(--border))]" : "border-dashed border-[hsl(var(--border))] opacity-75"}`}>
                  <div className="flex items-center gap-2.5 p-2.5 pb-1.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-none ${rec.type === "income" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                      {cat ? cat.icon : rec.type === "income" ? "💰" : "💸"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-medium truncate">{rec.note || cat?.name || "Tanpa nama"}</p>
                        <Badge className={rec.isActive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}>
                          {rec.isActive ? "Aktif" : "Pause"}
                        </Badge>
                        <Badge className={getDueClass(due.tone)}>{due.label}</Badge>
                      </div>
                      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                        {getAccountName(rec.accountId)} · {INTERVAL_LABEL[rec.interval]} · Berikutnya {formatDate(rec.nextDate, "dd MMM")}
                      </p>
                    </div>
                    <p className={`font-semibold text-xs ${rec.type === "income" ? "text-emerald-500" : "text-red-500"}`}>
                      {rec.type === "expense" ? "-" : "+"}{formatCurrency(rec.amount, currency)}
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 px-2.5 pb-2.5 pt-0.5">
                    <button
                      onClick={() => requestRecurringAction(rec, "toggle")}
                      disabled={isBusy}
                      aria-label={rec.isActive ? "Pause jadwal" : "Aktifkan jadwal"}
                      title={rec.isActive ? "Pause" : "Aktifkan"}
                      className="w-8 h-8 rounded-lg border border-[hsl(var(--border))] inline-flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                    >
                      {rec.isActive ? <Pause size={13} /> : <Play size={13} />}
                      <span className="sr-only">{rec.isActive ? "Pause" : "Aktifkan"}</span>
                    </button>
                    <button
                      onClick={() => requestRecurringAction(rec, "run")}
                      disabled={isBusy}
                      aria-label="Jalankan sekarang"
                      title="Jalankan sekarang"
                      className="w-8 h-8 rounded-lg border border-[hsl(var(--border))] inline-flex items-center justify-center text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
                    >
                      <Play size={13} />
                      <span className="sr-only">Jalankan</span>
                    </button>
                    <button
                      onClick={() => requestRecurringAction(rec, "skip")}
                      disabled={isBusy}
                      aria-label="Lewati jadwal berikutnya"
                      title="Lewati berikutnya"
                      className="w-8 h-8 rounded-lg border border-[hsl(var(--border))] inline-flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                    >
                      <SkipForward size={13} />
                      <span className="sr-only">Lewati</span>
                    </button>
                    <button
                      onClick={() => setEditRecurring(rec)}
                      disabled={isBusy}
                      aria-label="Edit jadwal"
                      title="Edit jadwal"
                      className="w-8 h-8 rounded-lg border border-[hsl(var(--border))] inline-flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                    >
                      <Pencil size={13} />
                      <span className="sr-only">Edit</span>
                    </button>
                    <button
                      onClick={() => setDeleteRecurringId(rec.id!)}
                      disabled={isBusy}
                      aria-label="Hapus jadwal"
                      title="Hapus jadwal"
                      className="w-8 h-8 rounded-lg border border-[hsl(var(--border))] inline-flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 size={13} />
                      <span className="sr-only">Hapus</span>
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
        onSaved={() => {
          void loadRecurring();
          setRecurringFormOpen(false);
          setEditRecurring(null);
          setRecurringFeedback({ type: "success", text: "Jadwal tersimpan." });
        }}
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

      <Modal
        open={pendingRecurringAction !== null}
        onClose={() => setPendingRecurringAction(null)}
        title={
          pendingRecurringAction?.action === "run"
            ? "Jalankan Jadwal Sekarang"
            : pendingRecurringAction?.action === "skip"
              ? "Lewati Jadwal Berikutnya"
              : pendingRecurringAction?.rec.isActive
                ? "Pause Jadwal"
                : "Aktifkan Jadwal"
        }
      >
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
          {pendingRecurringAction?.action === "run"
            ? <>Transaksi <strong>{pendingRecurringAction.rec.note || "terjadwal"}</strong> akan dicatat untuk hari ini. Lanjutkan?</>
            : pendingRecurringAction?.action === "skip"
              ? <>Jadwal berikutnya untuk <strong>{pendingRecurringAction.rec.note || "transaksi ini"}</strong> akan dilewati. Lanjutkan?</>
              : pendingRecurringAction?.rec.isActive
                ? <>Jadwal <strong>{pendingRecurringAction.rec.note || "ini"}</strong> akan di-pause sampai diaktifkan lagi. Lanjutkan?</>
                : <>Jadwal <strong>{pendingRecurringAction?.rec.note || "ini"}</strong> akan diaktifkan kembali. Lanjutkan?</>}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setPendingRecurringAction(null)}>Batal</Button>
          <Button className="flex-1" onClick={() => void confirmRecurringAction()}>
            Ya, Lanjutkan
          </Button>
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
