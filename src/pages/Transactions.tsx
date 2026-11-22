import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { Button, ConfirmDialog, IconTile, Input, Select, EmptyState, Modal, Badge, Spinner, Sheet, ListGroup, ListRow } from "@/components/ui";
import { describeTransactionDelete } from "@/lib/deleteDescription";
import { TransactionForm } from "@/components/forms/TransactionForm";
import { AITransactionForm } from "@/components/forms/AITransactionForm";
import { RecurringForm, type RecurringDraftInput } from "@/components/forms/RecurringForm";
import { TransactionCard } from "@/components/TransactionCard";
import { TransactionDetail } from "@/components/TransactionDetail";
import { exportCSV } from "@/lib/backup";
import { format, subDays } from "date-fns";
import { deleteTransaction } from "@/db/transactions";
import { getRecurringTransactions, deleteRecurring, updateRecurring, getRecurringDueInfo, runRecurringNow, skipNextRecurring } from "@/db/recurring";
import { db } from "@/db/db";
import { formatCurrency, formatDate, todayISO, readBalanceHidden } from "@/lib/utils";
import { getRecurringDetectionSuggestions, type RecurringDetectionSuggestion } from "@/services/recurringDetection";
import type { Transaction, RecurringTransaction, TransactionSplit } from "@/types";
import { Plus, Search, Filter, ChevronLeft, MoreHorizontal, Sparkles, ClipboardList } from "lucide-react";
import { usePageAction } from "@/components/layout/appLayoutContext";

const PAGE_SIZE = 100;

const INTERVAL_LABEL: Record<string, string> = {
  daily: "Harian", weekly: "Mingguan", monthly: "Bulanan", yearly: "Tahunan",
};

export default function Transactions() {
  const navigate = useNavigate();
  const { accounts, transactions, categories, filter, setFilter, refreshAll, isLoading } = useWalletStore();
  const { currency } = useSettingsStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"all" | "recurring">(() => searchParams.get("tab") === "recurring" ? "recurring" : "all");
  const [addOpen, setAddOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const newRequested = searchParams.get("new") === "1";
  // Open the add form when arriving via ?new=1 (derived during render, then the param is cleaned below).
  if (newRequested && !addOpen) setAddOpen(true);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [search, setSearch] = useState(filter.search ?? "");
  const [deleteTxId, setDeleteTxId] = useState<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [page, setPage] = useState({ filterKey: "", count: PAGE_SIZE });
  const filterKey = JSON.stringify(filter);
  const visibleCount = page.filterKey === filterKey ? page.count : PAGE_SIZE;
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts]);
  const visibleTransactions = useMemo(() => transactions.slice(0, visibleCount), [transactions, visibleCount]);

  function cancelSearch() {
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    searchTimer.current = null;
  }

  useEffect(() => cancelSearch, []);
  // Recurring state
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(true);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [recurringBusyId, setRecurringBusyId] = useState<number | null>(null);
  const [recurringFeedback, setRecurringFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [recurringFormOpen, setRecurringFormOpen] = useState(false);
  const [editRecurring, setEditRecurring] = useState<RecurringTransaction | null>(null);
  const [recurringDraft, setRecurringDraft] = useState<RecurringDraftInput | null>(null);
  const [recurringSuggestions, setRecurringSuggestions] = useState<RecurringDetectionSuggestion[]>([]);
  const [deleteRecurringId, setDeleteRecurringId] = useState<number | null>(null);
  const [pendingRecurringAction, setPendingRecurringAction] = useState<{ rec: RecurringTransaction; action: "toggle" | "run" | "skip" } | null>(null);
  const [splitMap, setSplitMap] = useState<Record<number, TransactionSplit[]>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actionRec, setActionRec] = useState<RecurringTransaction | null>(null);
  const hidden = readBalanceHidden();
  const money = (amount: number) => (hidden ? "•••" : formatCurrency(amount, currency));
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const pendingFocusTxId = useRef<number | null>(null);

  useEffect(() => {
    cancelSearch();
    setSearch(filter.search ?? "");
  }, [filter.search]);

  useEffect(() => {
    void refreshAll();
    void loadRecurring();
  }, [refreshAll]);

  useEffect(() => {
    if (!recurringFeedback) return;
    const timer = window.setTimeout(() => setRecurringFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [recurringFeedback]);

  useEffect(() => {
    if (!newRequested) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("new");
    setSearchParams(nextParams, { replace: true });
  }, [newRequested, searchParams, setSearchParams]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "recurring" || tab === "all") {
      setActiveTab(tab);
    } else {
      setActiveTab("all");
    }

    const txParam = Number(searchParams.get("tx"));
    if (!Number.isFinite(txParam) || txParam <= 0) {
      pendingFocusTxId.current = null;
      return;
    }

    pendingFocusTxId.current = txParam;
    cancelSearch();
    setShowFilter(false);

    const currentFilter = useWalletStore.getState().filter;
    if (currentFilter.search || currentFilter.type || currentFilter.categoryId !== undefined || currentFilter.dateFrom || currentFilter.dateTo || (currentFilter.accountIds?.length ?? 0) > 0) {
      setSearch("");
      setFilter({});
    }
  }, [searchParams, setFilter]);

  useEffect(() => {
    const targetId = pendingFocusTxId.current;
    if (!targetId) return;

    const target = transactions.find((item) => item.id === targetId);
    if (!target) return;
    if (target.debtId || target.isAdjustment) {
      pendingFocusTxId.current = null;
      navigate(target.isAdjustment ? "/accounts" : "/debts");
      return;
    }

    setEditTarget(target);
    pendingFocusTxId.current = null;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("tx");
    if (nextParams.get("tab") === "all") {
      nextParams.delete("tab");
    }
    setSearchParams(nextParams, { replace: true });
  }, [transactions, searchParams, setSearchParams, navigate]);

  useEffect(() => {
    let cancelled = false;
    const ids = visibleTransactions.flatMap((tx) => tx.id !== undefined ? [tx.id] : []);
    void db.transactionSplits.where("transactionId").anyOf(ids).toArray().then((rows) => {
      if (cancelled) return;
      const map: Record<number, TransactionSplit[]> = {};
      for (const split of rows) (map[split.transactionId] ??= []).push(split);
      setSplitMap(map);
    });
    return () => { cancelled = true; };
  }, [visibleTransactions]);

  async function loadRecurring() {
    setRecurringLoading(true);
    setRecurringError(null);
    try {
      const [items, suggestions] = await Promise.all([
        getRecurringTransactions(),
        getRecurringDetectionSuggestions(),
      ]);
      setRecurring(items);
      setRecurringSuggestions(suggestions);
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
    setSelectedId(null);
    await refreshAll();
    await loadRecurring();
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

  function requestRecurringAction(rec: RecurringTransaction, action: "toggle" | "run" | "skip") {
    setPendingRecurringAction({ rec, action });
  }

  function buildRecurringDraft(suggestion: RecurringDetectionSuggestion): RecurringDraftInput {
    return {
      type: suggestion.type,
      amount: suggestion.amount,
      accountId: suggestion.accountId,
      categoryId: suggestion.categoryId,
      interval: suggestion.interval,
      nextDate: suggestion.nextDate,
      note: suggestion.note,
      isActive: true,
    };
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
    cancelSearch();
    searchTimer.current = setTimeout(() => {
      setFilter({ ...useWalletStore.getState().filter, search: val || undefined });
      searchTimer.current = null;
    }, 250);
  }

  const { totals, dayTotals } = useMemo(() => {
    const totals = { income: 0, expense: 0, transfer: 0 };
    const dayTotals: Record<string, { income: number; expense: number; count: number }> = {};
    for (const tx of transactions) {
      if (!tx.debtId && !tx.isAdjustment) totals[tx.type] += tx.amount;
      const day = dayTotals[tx.date] ??= { income: 0, expense: 0, count: 0 };
      day.count++;
      if (!tx.debtId && !tx.isAdjustment && tx.type !== "transfer") day[tx.type] += tx.amount;
    }
    return { totals, dayTotals };
  }, [transactions]);
  const visibleByDate = useMemo(() => {
    const grouped: Record<string, Transaction[]> = {};
    for (const tx of visibleTransactions) (grouped[tx.date] ??= []).push(tx);
    return grouped;
  }, [visibleTransactions]);

  function handleTabChange(tab: "all" | "recurring") {
    setActiveTab(tab);
    setSearchParams(tab === "all" ? {} : { tab });
  }

  const activeFilterChips = [
    filter.search ? {
      key: "search",
      label: `Cari: ${filter.search}`,
      onRemove: () => {
        cancelSearch();
        setSearch("");
        setFilter({ ...filter, search: undefined });
      },
    } : null,
    (filter.accountIds && filter.accountIds.length > 0) ? {
      key: "accountIds",
      label: `Akun: ${(filter.accountIds as number[]).map(id => getAccountName(id)).join(", ")}`,
      onRemove: () => setFilter({ ...filter, accountIds: undefined }),
    } : null,
    filter.categoryId !== undefined ? {
      key: "categoryId",
      label: `Kategori: ${getCategory(filter.categoryId)?.name ?? "Unknown"}`,
      onRemove: () => setFilter({ ...filter, categoryId: undefined }),
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

  function renderTransactions(items: Transaction[]) {
    return items.map((tx) => {
      const cat = getCategory(tx.categoryId);
      const txSplits = splitMap[tx.id!] ?? [];
      const hasSplits = txSplits.length > 0;
      return (
        <TransactionCard
          key={tx.id}
          desktop={desktop}
          transaction={tx}
          accountName={getAccountName(tx.accountId)}
          toAccountName={tx.toAccountId ? getAccountName(tx.toAccountId) : undefined}
          categoryLabel={hasSplits ? `Split · ${txSplits.length} kategori` : cat?.name}
          categoryColor={cat?.color}
          currency={currency}
          hidden={hidden}
          hasSplits={hasSplits}
          selected={selectedId === tx.id}
          onSelect={() => setSelectedId(tx.id!)}
          onEdit={() => editTx(tx)}
          onDelete={() => deleteTx(tx)}
        />
      );
    });
  }

  usePageAction({
    label: activeTab === "recurring" ? "Tambah jadwal" : "Tambah transaksi",
    onClick: () => {
      if (activeTab === "recurring") {
        setRecurringDraft(null);
        setRecurringFormOpen(true);
      } else {
        setAddOpen(true);
      }
    },
  });

  const activeRecurringCount = recurring.filter((r) => r.isActive).length;
  const monthLabel = formatDate(todayISO(), "MMMM yyyy");
  const selectedTx = selectedId !== null ? transactions.find((t) => t.id === selectedId) ?? null : null;
  const todayStr = todayISO();
  const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
  function dayLabel(date: string) {
    if (date === todayStr) return `Hari ini · ${formatDate(date, "EEE, d MMM")}`;
    if (date === yesterdayStr) return `Kemarin · ${formatDate(date, "EEE, d MMM")}`;
    return formatDate(date, "EEEE, d MMM");
  }
  function editTx(tx: Transaction) {
    if (tx.isAdjustment) navigate("/accounts");
    else if (tx.debtId) navigate("/debts");
    else setEditTarget(tx);
  }
  function deleteTx(tx: Transaction) {
    if (tx.debtId) navigate("/debts");
    else setDeleteTxId(tx.id!);
  }
  const typeChips: { value: Transaction["type"] | undefined; label: string }[] = [
    { value: undefined, label: "Semua" }, { value: "expense", label: "Keluar" }, { value: "income", label: "Masuk" }, { value: "transfer", label: "Transfer" },
  ];
  const pillCls = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-3.5 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${on ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : "border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]"}`;
  const monthlyFactor: Record<string, number> = { daily: 30, weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };
  const monthlyOutflow = Math.round(recurring.filter((r) => r.isActive && r.type === "expense").reduce((sum, r) => sum + r.amount * (monthlyFactor[r.interval] ?? 1), 0));
  const scheduledPill = "inline-flex min-h-11 items-center";
  const scheduledPillLabel = "rounded-full bg-[hsl(var(--primary))]/10 px-2.5 py-1 text-xs font-bold text-[hsl(var(--primary))]";
  const addSchedule = () => { setRecurringDraft(null); setRecurringFormOpen(true); };

  const detailPane = selectedTx ? (
    <TransactionDetail
      transaction={selectedTx}
      accountName={getAccountName(selectedTx.accountId)}
      toAccountName={selectedTx.toAccountId ? getAccountName(selectedTx.toAccountId) : undefined}
      category={getCategory(selectedTx.categoryId)}
      splits={splitMap[selectedTx.id!] ?? []}
      categories={categories}
      currency={currency}
      hidden={hidden}
      onEdit={() => { if (!desktop) setSelectedId(null); editTx(selectedTx); }}
      onDelete={() => { if (!desktop) setSelectedId(null); deleteTx(selectedTx); }}
    />
  ) : null;

  return (
    <div className="space-y-4 px-4 pt-6 pb-4 lg:px-0 lg:pt-8">
      {activeTab === "all" ? (
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="truncate text-2xl font-extrabold tracking-tight">Transaksi</h1>
            <div role="group" aria-label="Tampilan transaksi">
              <button type="button" onClick={() => handleTabChange("recurring")} aria-pressed={false} className={`${scheduledPill} rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]`}>
                <span className={scheduledPillLabel}>Terjadwal · {activeRecurringCount}</span>
              </button>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-sm text-[hsl(var(--muted-foreground))] lg:inline">{monthLabel}</span>
            <Button variant="outline" className="hidden lg:inline-flex" onClick={() => void exportCSV()}>Ekspor CSV</Button>
          </div>
        </header>
      ) : (
        <header className="flex items-center gap-3">
          <button type="button" onClick={() => handleTabChange("all")} aria-label="Kembali ke transaksi" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] lg:hidden">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold tracking-tight lg:text-2xl">Terjadwal</h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{activeRecurringCount > 0 ? `${activeRecurringCount} jadwal aktif${monthlyOutflow > 0 ? ` · ${money(monthlyOutflow)}/bulan` : ""}` : "Belum ada jadwal aktif"}</p>
          </div>
          <div className="hidden items-center gap-2 lg:flex" role="group" aria-label="Tampilan transaksi">
            <button type="button" onClick={() => handleTabChange("all")} aria-pressed={false} className={pillCls(false)}>Riwayat</button>
            <button type="button" onClick={() => handleTabChange("recurring")} aria-pressed={true} className={pillCls(true)}>Terjadwal · {activeRecurringCount}</button>
          </div>
          <button type="button" onClick={addSchedule} aria-label="Tambah jadwal" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] lg:hidden">
            <Plus size={20} aria-hidden="true" />
          </button>
        </header>
      )}

      {activeTab === "all" && (
        <div className="space-y-3">
          {isLoading && <p role="status" className="text-xs text-[hsl(var(--muted-foreground))]">Memuat transaksi…</p>}
          {filter.dateFrom && filter.dateTo && filter.dateFrom > filter.dateTo && <p role="alert" className="text-sm text-danger">Tanggal mulai harus sebelum atau sama dengan tanggal akhir.</p>}
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
              <input
                className="h-11 w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                aria-label="Cari transaksi"
                placeholder="Cari catatan transaksi..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              aria-expanded={showFilter}
              aria-controls="transaction-filters"
              onClick={() => setShowFilter((v) => !v)}
              className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border px-3.5 text-sm font-medium transition-colors ${showFilter || activeFilterChips.length > 0 ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]" : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]"}`}
            >
              <Filter size={15} />
              {activeFilterChips.length > 0 ? `Filter ${activeFilterChips.length}` : "Filter"}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Filter jenis">
            {typeChips.map((chip) => (
              <button key={chip.label} type="button" aria-pressed={filter.type === chip.value} onClick={() => setFilter({ ...filter, type: chip.value })} className={pillCls(filter.type === chip.value)}>{chip.label}</button>
            ))}
          </div>
          {activeFilterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  aria-label={`Hapus filter ${chip.label}`}
                  onClick={chip.onRemove}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
                >
                  <span className="min-w-0 break-words">{chip.label}</span>
                  <span className="text-[hsl(var(--muted-foreground))]">×</span>
                </button>
              ))}
              <button
                onClick={() => { cancelSearch(); setSearch(""); setFilter({}); }}
                className="min-h-11 px-2 text-xs font-medium text-[hsl(var(--primary))] hover:underline"
              >
                Reset semua
              </button>
            </div>
          )}

          {/* Filters */}
          {activeTab === "all" && showFilter && (
            <div id="transaction-filters" className="grid gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Akun</p>
                <div className="space-y-2 max-h-32 overflow-y-auto">
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
              {categories.length > 0 && (
                <Select
                  label="Kategori"
                  value={filter.categoryId ?? ""}
                  onChange={(e) => setFilter({ ...filter, categoryId: e.target.value ? Number(e.target.value) : undefined })}
                >
                  <option value="">Semua Kategori</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.icon} {category.name}
                    </option>
                  ))}
                </Select>
              )}
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
              <div className="grid grid-cols-2 gap-3 lg:col-span-2">
                <Input
                  label="Dari Tanggal"
                  aria-label="Dari Tanggal"
                  className="min-w-0 max-w-full px-2 text-sm"
                  max={filter.dateTo}
                  type="date"
                  value={filter.dateFrom ?? ""}
                  onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value || undefined })}
                />
                <Input
                  label="Sampai Tanggal"
                  aria-label="Sampai Tanggal"
                  className="min-w-0 max-w-full px-2 text-sm"
                  min={filter.dateFrom}
                  type="date"
                  value={filter.dateTo ?? ""}
                  onChange={(e) => setFilter({ ...filter, dateTo: e.target.value || undefined })}
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => { cancelSearch(); setFilter({}); setSearch(""); }}>
                Reset Filter
              </Button>
            </div>
          )}

          {transactions.length > 0 && (
            <div aria-label="Ringkasan periode" role="group" className="space-y-1.5">
              <dl className="grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-3"><dt className="text-xs text-[hsl(var(--muted-foreground))]">Masuk</dt><dd className={`break-words text-base font-bold tabular-nums ${hidden ? "text-[hsl(var(--muted-foreground))]" : "text-success"}`}>{money(totals.income)}</dd></div>
                <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-3"><dt className="text-xs text-[hsl(var(--muted-foreground))]">Keluar</dt><dd className="break-words text-base font-bold tabular-nums">{money(totals.expense)}</dd></div>
              </dl>
              {totals.transfer > 0 && <p className="px-1 text-xs text-[hsl(var(--muted-foreground))]">Transfer <span className="font-semibold tabular-nums">{money(totals.transfer)}</span></p>}
            </div>
          )}
        </div>
      )}

      {/* All Transactions tab */}
      {activeTab === "all" && (
        transactions.length === 0 ? (
          activeFilterChips.length > 0 ? (
            <EmptyState icon="📋" title="Tidak ada transaksi yang cocok" description="Ubah pencarian atau reset filter untuk melihat transaksi lainnya." />
          ) : (
            <div className="space-y-8">
              <section aria-label="Belum ada transaksi" className="mt-10 flex flex-col items-center gap-3.5 px-4 text-center">
                <div aria-hidden="true" className="flex h-24 w-24 items-center justify-center rounded-[32px] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"><ClipboardList size={44} /></div>
                <h2 className="text-lg font-extrabold">Belum ada transaksi</h2>
                <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Catat pengeluaran pertamamu. Bisa diketik manual, atau tulis saja “makan 25rb pakai GoPay” ke asisten.</p>
                <div className="mt-1.5 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => setAddOpen(true)} className="inline-flex h-[46px] items-center rounded-[14px] bg-[hsl(var(--primary))] px-[18px] text-sm font-bold text-[hsl(var(--primary-foreground))]">Catat manual</button>
                  <button type="button" onClick={() => setAiOpen(true)} className="inline-flex h-[46px] items-center gap-1.5 rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-[18px] text-sm font-semibold"><Sparkles size={15} aria-hidden="true" />Pakai asisten</button>
                </div>
              </section>
              <div className="flex items-center gap-2.5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-2">
                <span className="flex-1 text-[13px]">Punya data dari aplikasi lama?</span>
                <Link to="/settings" className="inline-flex min-h-11 items-center text-[13px] font-bold text-[hsl(var(--primary))]">Impor backup</Link>
              </div>
            </div>
          )
        ) : (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
            <div className="space-y-4">
              {desktop ? (
                <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                  <table className="w-full table-fixed text-left text-sm">
                    <caption className="sr-only">Daftar transaksi</caption>
                    <thead className="text-xs text-[hsl(var(--muted-foreground))]">
                      <tr>
                        {["Keterangan", "Kategori", "Akun", "Jumlah"].map((label, index) => <th key={label} scope="col" style={{ width: ["34%", "20%", "20%", "18%"][index] }} className={`px-3 py-2.5 font-medium ${label === "Jumlah" ? "text-right" : ""}`}>{label}</th>)}
                        <th scope="col" style={{ width: "8%" }}><span className="sr-only">Aksi</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(visibleByDate).map(([date, dayTxs]) => {
                        const net = dayTotals[date].income - dayTotals[date].expense;
                        return (
                          <Fragment key={date}>
                            <tr className="border-t border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]">
                              <th scope="colgroup" colSpan={3} className="px-3 py-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]">{dayLabel(date)}</th>
                              <td colSpan={2} className={`px-3 py-2 text-right text-xs font-semibold tabular-nums ${net > 0 && !hidden ? "text-success" : "text-[hsl(var(--muted-foreground))]"}`}>{hidden ? "" : net > 0 ? "+" : net < 0 ? "−" : ""}{money(Math.abs(net))}</td>
                            </tr>
                            {renderTransactions(dayTxs)}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                Object.entries(visibleByDate).map(([date, dayTxs]) => {
                  const net = dayTotals[date].income - dayTotals[date].expense;
                  return (
                    <section key={date} aria-label={dayLabel(date)} className="space-y-2">
                      <div className="flex items-baseline justify-between gap-3 px-1">
                        <h2 className="text-[13px] font-bold text-[hsl(var(--foreground))]">{dayLabel(date)}</h2>
                        <span className={`text-xs font-medium tabular-nums ${net > 0 && !hidden ? "text-success" : "text-[hsl(var(--muted-foreground))]"}`}>{hidden ? "" : net > 0 ? "+" : net < 0 ? "−" : ""}{money(Math.abs(net))}</span>
                      </div>
                      <div className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">{renderTransactions(dayTxs)}</div>
                    </section>
                  );
                })
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{Math.min(visibleCount, transactions.length)} dari {transactions.length} transaksi ditampilkan</p>
                {visibleCount < transactions.length && <Button size="sm" variant="outline" disabled={isLoading} onClick={() => setPage({ filterKey, count: visibleCount + PAGE_SIZE })}>Tampilkan 100 lagi</Button>}
              </div>
            </div>
            {desktop && (
              <aside role="region" aria-label="Detail transaksi" className="sticky top-6 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
                {detailPane ?? <p className="py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">Pilih transaksi untuk melihat detail.</p>}
              </aside>
            )}
          </div>
        )
      )}

      {!desktop && (
        <Sheet open={selectedTx !== null} onClose={() => setSelectedId(null)} title="Detail transaksi">
          {detailPane}
        </Sheet>
      )}
      {/* Recurring tab */}
      {activeTab === "recurring" && (
        recurringLoading ? (
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <Spinner />
          </div>
        ) : recurringError ? (
          <div className="space-y-3 rounded-2xl border border-danger/40 bg-danger/10 p-4">
            <p className="text-sm text-danger">{recurringError}</p>
            <Button size="sm" variant="outline" onClick={() => void loadRecurring()}>Coba lagi</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {recurringFeedback && (
              <div role="status" className={`rounded-xl border px-3 py-2 text-sm ${recurringFeedback.type === "success" ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger"}`}>
                {recurringFeedback.text}
              </div>
            )}

            {recurringSuggestions.length > 0 && (
              <section aria-label="Deteksi jadwal otomatis" className="space-y-3 rounded-[18px] border border-dashed border-[hsl(var(--primary))]/50 bg-[hsl(var(--card))] p-4">
                <div className="flex items-start gap-2.5">
                  <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"><Sparkles size={18} /></span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold">{recurringSuggestions.length} pola rutin terdeteksi</h2>
                    <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">AI lokal menemukan pola yang layak dijadikan transaksi terjadwal.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {recurringSuggestions.map((suggestion) => {
                    const category = getCategory(suggestion.categoryId);
                    const isIncome = suggestion.type === "income";
                    return (
                      <div key={suggestion.key} className="rounded-2xl bg-[hsl(var(--surface-2))] px-3 py-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <IconTile label={category?.name ?? suggestion.note ?? (isIncome ? "Pemasukan" : "Pengeluaran")} color={category?.color} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold">{suggestion.note || category?.name || "Pola berulang terdeteksi"}</p>
                              <Badge className={suggestion.confidence === "high" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}>
                                {suggestion.confidence === "high" ? "High confidence" : "Perlu review"}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                              {getAccountName(suggestion.accountId)} · {INTERVAL_LABEL[suggestion.interval]} · {suggestion.occurrences} transaksi mirip
                            </p>
                            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                              Rata-rata {money(suggestion.averageAmount)} · berikutnya {formatDate(suggestion.nextDate, "dd MMM yyyy")}
                            </p>
                          </div>
                          <Button
                            className="min-h-11"
                            onClick={() => {
                              setEditRecurring(null);
                              setRecurringDraft(buildRecurringDraft(suggestion));
                              setRecurringFormOpen(true);
                            }}
                          >
                            Buat jadwal
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {recurring.length === 0 && (
              <EmptyState icon="🔄" title="Belum ada transaksi terjadwal" description="Tekan + untuk membuat transaksi otomatis seperti gaji atau tagihan bulanan." />
            )}

            {recurring.length > 0 && (
              <section aria-label="Berikutnya" className="space-y-2">
                <h2 className="px-1 text-[13px] font-bold">Berikutnya</h2>
                <div className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                  {recurring.map((rec) => {
                    const cat = getCategory(rec.categoryId);
                    const due = getRecurringDueInfo(rec.nextDate);
                    const isBusy = recurringBusyId === rec.id;
                    const name = rec.note || cat?.name || "Tanpa nama";
                    const dueTone = due.tone === "overdue" ? "text-danger" : due.tone === "today" ? "text-warning" : "text-[hsl(var(--muted-foreground))]";
                    return (
                      <div key={rec.id} className={`space-y-2.5 px-4 py-3.5 ${rec.isActive ? "" : "opacity-75"}`}>
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 flex-none flex-col items-center justify-center rounded-xl bg-[hsl(var(--surface-2))] leading-tight" aria-hidden="true">
                            <span className="text-[15px] font-extrabold tabular-nums">{formatDate(rec.nextDate, "dd")}</span>
                            <span className="text-[10px] font-semibold uppercase text-[hsl(var(--muted-foreground))]">{formatDate(rec.nextDate, "MMM")}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{name}</p>
                            <p className="break-words text-xs text-[hsl(var(--muted-foreground))]">
                              {INTERVAL_LABEL[rec.interval]} · {getAccountName(rec.accountId)}{rec.isActive ? "" : " · Pause"} · <span className={dueTone}>{due.label}</span>
                            </p>
                          </div>
                          <p className={`shrink-0 text-sm font-bold tabular-nums ${rec.type === "income" && !hidden ? "text-success" : ""}`}>
                            {hidden ? "" : rec.type === "expense" ? "−" : "+"}{money(rec.amount)}
                          </p>
                          <button type="button" onClick={() => setActionRec(rec)} disabled={isBusy} aria-label={`Aksi jadwal ${name}`} className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50">
                            <MoreHorizontal size={18} aria-hidden="true" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2 pl-14">
                          <Button variant="outline" size="sm" className="min-h-11" disabled={isBusy} onClick={() => requestRecurringAction(rec, "run")}>Jalankan sekarang</Button>
                          <Button variant="outline" size="sm" className="min-h-11 text-[hsl(var(--muted-foreground))]" disabled={isBusy} aria-label="Lewati jadwal berikutnya" onClick={() => requestRecurringAction(rec, "skip")}>Lewati</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )
      )}

      <Sheet open={actionRec !== null} onClose={() => setActionRec(null)} title={actionRec ? actionRec.note || getCategory(actionRec.categoryId)?.name || "Jadwal" : "Jadwal"}>
        {actionRec && (
          <ListGroup>
            <ListRow label={actionRec.isActive ? "Pause jadwal" : "Aktifkan jadwal"} onClick={() => { const rec = actionRec; setActionRec(null); requestRecurringAction(rec, "toggle"); }} />
            <ListRow label="Edit jadwal" onClick={() => { const rec = actionRec; setActionRec(null); setEditRecurring(rec); }} />
            <ListRow label="Hapus jadwal" tone="danger" onClick={() => { const id = actionRec.id!; setActionRec(null); setDeleteRecurringId(id); }} />
          </ListGroup>
        )}
      </Sheet>

      {/* ── Modals ── */}
      <TransactionForm
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => void refreshAll()}
        accounts={activeAccounts}
        categories={categories}
        onUseAI={() => { setAddOpen(false); setAiOpen(true); }}
      />

      <AITransactionForm
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onSaved={() => { void refreshAll(); setAiOpen(false); }}
        accounts={activeAccounts}
        categories={categories}
      />

      {editTarget && (
        <TransactionForm
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { void refreshAll(); setEditTarget(null); }}
          accounts={activeAccounts}
          categories={categories}
          existing={editTarget}
        />
      )}

      <RecurringForm
        key={editRecurring?.id ?? (recurringDraft ? `${recurringDraft.interval}-${recurringDraft.accountId}-${recurringDraft.nextDate}` : "recurring-new")}
        open={recurringFormOpen || editRecurring !== null}
        onClose={() => { setRecurringFormOpen(false); setEditRecurring(null); setRecurringDraft(null); }}
        onSaved={() => {
          void loadRecurring();
          setRecurringFormOpen(false);
          setEditRecurring(null);
          setRecurringDraft(null);
          setRecurringFeedback({ type: "success", text: "Jadwal tersimpan." });
        }}
        accounts={activeAccounts}
        categories={categories}
        existing={editRecurring ?? undefined}
        initialValues={recurringDraft ?? undefined}
      />

      <ConfirmDialog
        open={deleteTxId !== null}
        title="Hapus transaksi ini?"
        description={(() => {
          const target = transactions.find((t) => t.id === deleteTxId);
          let hidden = false;
          hidden = readBalanceHidden();
          return target ? describeTransactionDelete(target, { accounts, categories, currency, hidden }) : "Transaksi ini akan dihapus.";
        })()}
        confirmLabel="Hapus"
        onConfirm={() => deleteTxId !== null && handleDelete(deleteTxId)}
        onClose={() => setDeleteTxId(null)}
      />

      <Modal
        open={pendingRecurringAction !== null}
        onClose={() => setPendingRecurringAction(null)}
        title={
          pendingRecurringAction?.action === "run"
            ? "Jalankan jadwal sekarang"
            : pendingRecurringAction?.action === "skip"
              ? "Lewati jadwal berikutnya"
              : pendingRecurringAction?.rec.isActive
                ? "Jeda jadwal"
                : "Aktifkan jadwal"
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

      <ConfirmDialog
        open={deleteRecurringId !== null}
        title="Hapus jadwal ini?"
        description={(() => {
          const target = recurring.find((r) => r.id === deleteRecurringId);
          const name = target ? target.note || getCategory(target.categoryId)?.name || "Jadwal" : "Jadwal";
          return `“${name}” akan dihapus. Transaksi yang sudah dicatat tidak akan terpengaruh.`;
        })()}
        confirmLabel="Hapus"
        onConfirm={() => deleteRecurringId !== null && handleDeleteRecurring(deleteRecurringId)}
        onClose={() => setDeleteRecurringId(null)}
      />

    </div>
  );
}
