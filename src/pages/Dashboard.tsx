import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { Card, CardContent, Modal, Button, Badge } from "@/components/ui";
import { TransactionForm } from "@/components/forms/TransactionForm";
import { AITransactionForm } from "@/components/forms/AITransactionForm";
import { TransactionCard } from "@/components/TransactionCard";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deleteTransaction, getRecentSpendingAnomalies } from "@/db/transactions";
import { getUpcomingRecurringTransactions } from "@/db/recurring";
import { getBudgetsForMonth, predictBudgetStatus } from "@/db/budgets";
import { getCategoryExpenseData } from "@/db/transactions";
import { getCategories } from "@/db/categories";
import { db } from "@/db/db";
import { Plus, Settings, CreditCard, Eye, EyeOff, AlertTriangle, Target, ChevronDown, ChevronUp, MoreHorizontal, TrendingDown, TrendingUp, ArrowRightLeft, Sparkles } from "lucide-react";
import type { RecurringTransaction, Transaction } from "@/types";

function formatCompactRupiah(value: number) {
  if (value === 0) return "Rp 0";
  return `Rp ${new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value)}`;
}

interface BudgetAlertItem {
  categoryId: number;
  categoryName: string;
  categoryIcon: string;
  spent: number;
  budget: number;
  percentage: number;
  predictedExhaustInDays: number | null;
  projectedOverrun: number;
  level: "warning" | "danger";
}

interface AnomalyAlertItem {
  transactionId: number;
  categoryId: number;
  categoryName: string;
  categoryIcon: string;
  accountId: number;
  amount: number;
  date: string;
  note: string;
  baselineAverage: number;
  ratioToAverage: number;
  severity: "warning" | "danger";
}

export default function Dashboard() {
  const { accounts, transactions, categories, refreshAll } = useWalletStore();
  const { currency } = useSettingsStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<Transaction["type"]>("expense");
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [balanceHidden, setBalanceHidden] = useState(() => localStorage.getItem("balance_hidden") === "1");
  const [splitTxIds, setSplitTxIds] = useState<Set<number>>(new Set());
  const [aiOpen, setAiOpen] = useState(false);
  const [recurringItems, setRecurringItems] = useState<RecurringTransaction[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlertItem[]>([]);
  const [anomalyAlerts, setAnomalyAlerts] = useState<AnomalyAlertItem[]>([]);
  const [accountsCollapsed, setAccountsCollapsed] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [heroMenuOpen, setHeroMenuOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const heroMenuRef = useRef<HTMLDivElement | null>(null);

  function toggleBalanceHidden() {
    setBalanceHidden((v) => {
      localStorage.setItem("balance_hidden", v ? "0" : "1");
      return !v;
    });
  }

  useEffect(() => {
    void loadDashboardData();
  }, []);

  useEffect(() => {
    db.transactionSplits.toArray().then((rows) => {
      setSplitTxIds(new Set(rows.map((r) => r.transactionId)));
    });
  }, [transactions]);

  async function loadDashboardData() {
    await refreshAll();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const [recurring, budgets, expenseByCategory, allCategories, anomalies] = await Promise.all([
      getUpcomingRecurringTransactions(),
      getBudgetsForMonth(monthKey),
      getCategoryExpenseData(now.getFullYear(), now.getMonth() + 1),
      getCategories(),
      getRecentSpendingAnomalies(),
    ]);
    setRecurringItems(recurring);
    const alerts = budgets
      .map((budget) => {
        const spent = expenseByCategory[budget.categoryId] ?? 0;
        const prediction = predictBudgetStatus({
          budgetAmount: budget.amount,
          spent,
          dayOfMonth,
          daysInMonth,
        });
        const percentage = prediction.percentage;
        if (percentage < 80) return null;
        const category = allCategories.find((item) => item.id === budget.categoryId);
        return {
          categoryId: budget.categoryId,
          categoryName: category?.name ?? "Kategori",
          categoryIcon: category?.icon ?? "📦",
          spent,
          budget: budget.amount,
          percentage,
          predictedExhaustInDays: prediction.predictedExhaustInDays,
          projectedOverrun: prediction.projectedOverrun,
          level: percentage >= 100 ? "danger" : "warning",
        } satisfies BudgetAlertItem;
      })
      .filter((item): item is BudgetAlertItem => item !== null)
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3);
    setBudgetAlerts(alerts);
    setAnomalyAlerts(
      anomalies.map((item) => {
        const category = allCategories.find((entry) => entry.id === item.categoryId);
        return {
          transactionId: item.transactionId,
          categoryId: item.categoryId,
          categoryName: category?.name ?? "Kategori",
          categoryIcon: category?.icon ?? "📦",
          accountId: item.accountId,
          amount: item.amount,
          date: item.date,
          note: item.note,
          baselineAverage: item.baselineAverage,
          ratioToAverage: item.ratioToAverage,
          severity: item.severity,
        } satisfies AnomalyAlertItem;
      }),
    );
  }

  // Handle PWA shortcut deep-links: /?type=expense|income|transfer
  useEffect(() => {
    const type = searchParams.get("type") as Transaction["type"] | null;
    if (type && ["expense", "income", "transfer"].includes(type)) {
      setDefaultType(type);
      setAddOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!heroMenuRef.current?.contains(event.target as Node)) {
        setHeroMenuOpen(false);
      }
    }

    if (heroMenuOpen) {
      document.addEventListener("mousedown", handlePointerDown);
      return () => document.removeEventListener("mousedown", handlePointerDown);
    }
  }, [heroMenuOpen]);

  const totalBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0);
  const now = new Date();
  const todayKey = now.toISOString().split("T")[0];
  const thisMonthTxs = transactions.filter((t) => t.date.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`));
  const monthIncome = thisMonthTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = thisMonthTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const recentTxs = recentExpanded ? transactions.slice(0, 6) : transactions.slice(0, 3);
  const upcomingBills = recurringItems
    .filter((item) => item.isActive && item.type === "expense")
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 3);
  const upcomingBillsTotal = upcomingBills.reduce((sum, item) => sum + item.amount, 0);
  const nextBill = upcomingBills[0] ?? null;
  const topBudgetAlert = budgetAlerts[0] ?? null;
  const topAnomalyAlert = anomalyAlerts[0] ?? null;
  const attentionItemsCount = (nextBill ? 1 : 0) + (topBudgetAlert ? 1 : 0) + (topAnomalyAlert ? 1 : 0);

  function getAccountName(id: number) {
    return accounts.find((a) => a.id === id)?.name ?? "?";
  }
  function getCategoryName(id?: number) {
    if (!id) return null;
    const cat = categories.find((c) => c.id === id);
    return cat ? `${cat.icon} ${cat.name}` : null;
  }

  function getDueStatus(date: string) {
    const target = new Date(`${date}T00:00:00`);
    const today = new Date(`${todayKey}T00:00:00`);
    const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

    if (diffDays < 0) {
      return {
        label: `${Math.abs(diffDays)} hari lewat`,
        className: "text-red-600 dark:text-red-400 bg-red-500/10",
      };
    }
    if (diffDays === 0) {
      return {
        label: "Hari ini",
        className: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
      };
    }
    if (diffDays === 1) {
      return {
        label: "Besok",
        className: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10",
      };
    }
    return {
      label: `${diffDays} hari lagi`,
      className: "text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]",
    };
  }

  async function handleDelete(id: number) {
    await deleteTransaction(id);
    await refreshAll();
    setDeleteTargetId(null);
  }

  function openTransaction(type: Transaction["type"]) {
    setFabOpen(false);
    setHeroMenuOpen(false);
    setDefaultType(type);
    setAddOpen(true);
  }

  function openAiTransaction() {
    setFabOpen(false);
    setHeroMenuOpen(false);
    setAiOpen(true);
  }

  const fabActions = [
    {
      label: "Pengeluaran",
      helper: "Catat belanja dan biaya",
      icon: TrendingDown,
      className: "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-300",
      onClick: () => openTransaction("expense"),
    },
    {
      label: "Pemasukan",
      helper: "Gaji, bonus, pemasukan lain",
      icon: TrendingUp,
      className: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300",
      onClick: () => openTransaction("income"),
    },
    {
      label: "Transfer",
      helper: "Pindah saldo antar akun",
      icon: ArrowRightLeft,
      className: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300",
      onClick: () => openTransaction("transfer"),
    },
    {
      label: "AI Assistant",
      helper: "Input cepat dari teks atau struk",
      icon: Sparkles,
      className: "text-[hsl(var(--primary))] bg-[hsl(var(--surface-2))]",
      onClick: openAiTransaction,
    },
  ];

  return (
    <div className="px-4 pt-5 pb-28 space-y-5">
      <Card className="overflow-hidden border-transparent bg-[linear-gradient(135deg,hsl(var(--card))_0%,hsl(var(--surface-2))_100%)]">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Ringkasan Hari Ini</p>
              <p className="mt-4 text-xs font-medium text-[hsl(var(--muted-foreground))]">Total saldo</p>
              <h1 className="mt-1 text-[2.15rem] font-bold tracking-tight leading-[1.05] sm:text-4xl">
                {balanceHidden ? <span className="tracking-[0.35em] text-2xl">••••••</span> : formatCurrency(totalBalance, currency)}
              </h1>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{formatDate(now.toISOString(), "EEEE, dd MMMM yyyy")}</p>
            </div>
            <div className="flex items-center gap-2 pt-1 flex-none">
              <button onClick={toggleBalanceHidden} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--card))]/80 text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]">
                {balanceHidden ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              <div ref={heroMenuRef} className="relative">
                <button
                  onClick={() => setHeroMenuOpen((value) => !value)}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--card))]/80 text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                >
                  <MoreHorizontal size={18} />
                </button>
                {heroMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-44 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/98 p-2 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.55)] backdrop-blur-xl">
                    <Link
                      to="/accounts"
                      onClick={() => setHeroMenuOpen(false)}
                      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
                    >
                      <CreditCard size={16} /> Akun
                    </Link>
                    <Link
                      to="/settings"
                      onClick={() => setHeroMenuOpen(false)}
                      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
                    >
                      <Settings size={16} /> Pengaturan
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[22px] bg-[hsl(var(--card))]/82 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] leading-tight text-[hsl(var(--muted-foreground))]">Pemasukan</p>
              <p className="mt-2 text-sm font-bold text-emerald-500 leading-tight">{formatCompactRupiah(monthIncome)}</p>
              <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">bulan ini</p>
            </div>
            <div className="rounded-[22px] bg-[hsl(var(--card))]/82 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] leading-tight text-[hsl(var(--muted-foreground))]">Pengeluaran</p>
              <p className="mt-2 text-sm font-bold text-amber-500 leading-tight">{formatCompactRupiah(monthExpense)}</p>
              <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">bulan ini</p>
            </div>
            <div className="rounded-[22px] bg-[hsl(var(--card))]/82 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] leading-tight text-[hsl(var(--muted-foreground))]">Net</p>
              <p className={`mt-2 text-sm font-bold leading-tight ${monthIncome - monthExpense >= 0 ? "text-[hsl(var(--primary))]" : "text-red-600 dark:text-red-400"}`}>
                {formatCompactRupiah(Math.abs(monthIncome - monthExpense))}
              </p>
              <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">bulan ini</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {accounts.length > 0 && (nextBill || topBudgetAlert || topAnomalyAlert) && (
        <Card className="overflow-hidden">
          <CardContent className="p-5 space-y-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Perlu Perhatian</p>
                <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                  {attentionItemsCount >= 2
                    ? `${attentionItemsCount} sinyal finansial perlu dicek hari ini`
                    : nextBill
                      ? `${upcomingBills.length} tagihan terdekat senilai ${formatCurrency(upcomingBillsTotal, currency)}`
                      : topBudgetAlert
                        ? `${budgetAlerts.length} kategori mendekati limit bulan ini`
                        : `${anomalyAlerts.length} transaksi terlihat tidak biasa`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {upcomingBills.length > 0 && (
                  <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    {upcomingBills.length} tagihan
                  </Badge>
                )}
                {budgetAlerts.length > 0 && (
                  <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    {budgetAlerts.length} budget
                  </Badge>
                )}
                {anomalyAlerts.length > 0 && (
                  <Badge className="bg-red-500/10 text-red-600 dark:text-red-400">
                    {anomalyAlerts.length} anomali
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid gap-3">
              {nextBill && (() => {
                const dueStatus = getDueStatus(nextBill.nextDate);
                const categoryLabel = getCategoryName(nextBill.categoryId);
                return (
                  <Link
                    to="/transactions?tab=recurring"
                    className="rounded-[26px] border border-[hsl(var(--border))] px-4 py-4 hover:bg-[hsl(var(--accent))] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-base flex-none">
                        {categoryLabel?.split(" ")[0] ?? "🧾"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{nextBill.note || categoryLabel || "Tagihan berikutnya"}</p>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${dueStatus.className}`}>
                            {dueStatus.label}
                          </span>
                        </div>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">
                          {getAccountName(nextBill.accountId)} · {formatDate(nextBill.nextDate, "dd MMM")}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-red-500">{formatCurrency(nextBill.amount, currency)}</p>
                    </div>
                  </Link>
                );
              })()}

              {topBudgetAlert && (() => {
                const isDanger = topBudgetAlert.level === "danger";
                const predictionLabel = !isDanger && topBudgetAlert.predictedExhaustInDays !== null
                  ? topBudgetAlert.predictedExhaustInDays <= 1
                    ? "Estimasi habis hari ini"
                    : `Estimasi habis ${topBudgetAlert.predictedExhaustInDays} hari lagi`
                  : null;
                return (
                  <Link
                    to="/reports"
                    className="rounded-[26px] border border-[hsl(var(--border))] px-4 py-4 hover:bg-[hsl(var(--accent))] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-none ${isDanger ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                        <span className="text-base">{topBudgetAlert.categoryIcon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">Budget {topBudgetAlert.categoryName}</p>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${isDanger ? "text-red-600 dark:text-red-400 bg-red-500/10" : "text-amber-600 dark:text-amber-400 bg-amber-500/10"}`}>
                            {topBudgetAlert.percentage}%
                          </span>
                        </div>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">
                          {formatCurrency(topBudgetAlert.spent, currency)} dari {formatCurrency(topBudgetAlert.budget, currency)}
                        </p>
                        {predictionLabel && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{predictionLabel}</p>
                        )}
                        {isDanger && topBudgetAlert.projectedOverrun > 0 && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                            Proyeksi over budget {formatCurrency(topBudgetAlert.projectedOverrun, currency)} bulan ini
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
                        <AlertTriangle size={14} className={isDanger ? "text-red-500" : "text-amber-500"} />
                      </div>
                    </div>
                  </Link>
                );
              })()}

              {topAnomalyAlert && (() => {
                const isDanger = topAnomalyAlert.severity === "danger";
                const ratioLabel = `${topAnomalyAlert.ratioToAverage.toFixed(1)}x dari rata-rata`;
                const anomalyHref = `/transactions?tx=${topAnomalyAlert.transactionId}`;
                return (
                  <Link
                    to={anomalyHref}
                    className="rounded-[26px] border border-[hsl(var(--border))] px-4 py-4 hover:bg-[hsl(var(--accent))] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-none ${isDanger ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                        <span className="text-base">{topAnomalyAlert.categoryIcon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">Lonjakan {topAnomalyAlert.categoryName}</p>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${isDanger ? "text-red-600 dark:text-red-400 bg-red-500/10" : "text-amber-600 dark:text-amber-400 bg-amber-500/10"}`}>
                            {ratioLabel}
                          </span>
                        </div>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">
                          {topAnomalyAlert.note || `${topAnomalyAlert.categoryName} di ${getAccountName(topAnomalyAlert.accountId)}`}
                        </p>
                        <p className={`text-xs mt-0.5 ${isDanger ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                          {formatCurrency(topAnomalyAlert.amount, currency)} vs rata-rata {formatCurrency(topAnomalyAlert.baselineAverage, currency)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
                        <AlertTriangle size={14} className={isDanger ? "text-red-500" : "text-amber-500"} />
                      </div>
                    </div>
                  </Link>
                );
              })()}
            </div>

            <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              {upcomingBills.length > 0 && (
                <Link to="/transactions?tab=recurring" className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline">
                  Kelola tagihan
                </Link>
              )}
              {upcomingBills.length > 0 && budgetAlerts.length > 0 && <span>•</span>}
              {budgetAlerts.length > 0 && (
                <Link to="/reports" className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline">
                  <Target size={12} /> Lihat budget
                </Link>
              )}
              {(upcomingBills.length > 0 || budgetAlerts.length > 0) && anomalyAlerts.length > 0 && <span>•</span>}
              {anomalyAlerts.length > 0 && (
                <Link to={`/transactions?tx=${topAnomalyAlert?.transactionId ?? ""}`} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline">
                  <AlertTriangle size={12} /> Review transaksi
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account Cards */}
      {accounts.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setAccountsCollapsed((value) => !value)}
            className="w-full flex items-center justify-between gap-3"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))] text-left">Akun Kamu</p>
              <p className="text-sm font-semibold text-left mt-1">
                {accounts.length} akun aktif
              </p>
            </div>
            <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
              <span className="text-xs">{accountsCollapsed ? "Buka" : "Tutup"}</span>
              {accountsCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>
          </button>

          {!accountsCollapsed && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 pl-4 pr-16 scrollbar-hide">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex-none w-40 rounded-[28px] p-4 text-white relative overflow-hidden shadow-[0_20px_55px_-28px_rgba(15,23,42,0.7)]"
                  style={{ background: `linear-gradient(135deg, ${account.color}, ${account.color}cc)` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xl">{account.icon}</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-white/15 uppercase tracking-[0.16em]">{account.type}</span>
                  </div>
                  <p className="text-xs opacity-80 mt-6 truncate">{account.name}</p>
                  <p className="font-bold text-base mt-1 leading-tight">{formatCurrency(account.currentBalance, currency)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Transactions */}
      {recentTxs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Activity</p>
              <p className="mt-1 text-sm font-semibold">Transaksi terbaru</p>
            </div>
            <div className="flex items-center gap-3">
              {transactions.length > 3 && (
                <button
                  onClick={() => setRecentExpanded((value) => !value)}
                  className="text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  {recentExpanded ? "Ringkas" : "Tampilkan lagi"}
                </button>
              )}
              <Link to="/transactions" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                Lihat semua
              </Link>
            </div>
          </div>
          <div className="space-y-2">
            {recentTxs.map((tx) => (
              <TransactionCard
                key={tx.id}
                transaction={tx}
                accountName={getAccountName(tx.accountId)}
                toAccountName={tx.toAccountId ? getAccountName(tx.toAccountId) : undefined}
                categoryLabel={splitTxIds.has(tx.id!) ? "Split" : (getCategoryName(tx.categoryId) ?? undefined)}
                currency={currency}
                onEdit={() => setEditTx(tx)}
                onDelete={() => setDeleteTargetId(tx.id!)}
              />
            ))}
          </div>
        </div>
      )}

      {accounts.length === 0 && (
        <div className="py-4 space-y-5">
          <div className="text-center">
            <div className="text-6xl mb-3">💰</div>
            <h2 className="text-xl font-bold">Selamat Datang!</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 max-w-xs mx-auto">
              Kelola semua keuangan kamu di satu tempat. Mulai dalam 2 langkah mudah!
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-2xl border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center text-sm font-bold flex-none">1</div>
                <div>
                  <p className="font-semibold text-sm">Tambah akun pertamamu</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Bank, e-wallet, kartu kredit, atau dompet tunai</p>
                </div>
                <span className="ml-auto text-indigo-500 text-lg">→</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl border-2 border-dashed border-[hsl(var(--border))] opacity-50">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] flex items-center justify-center text-sm font-bold flex-none">2</div>
                <div>
                  <p className="font-semibold text-sm">Catat transaksi pertama</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Pengeluaran, pemasukan, atau transfer antar akun</p>
                </div>
              </div>
            </div>
          </div>

          <Link to="/accounts">
            <Button className="w-full gap-2 h-12 text-base">
              <Plus size={18} /> Tambah Akun Sekarang
            </Button>
          </Link>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="fixed bottom-[calc(6.3rem+env(safe-area-inset-bottom))] right-4 z-30 flex flex-col items-end gap-3 sm:right-[max(1rem,calc((100vw-36rem)/2+1rem))]">
          {fabOpen && (
            <div className="w-[min(19rem,calc(100vw-2rem))] rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/97 p-2 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl">
              <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Quick Actions</p>
              <div className="mt-2 space-y-1">
                {fabActions.map((item) => (
                  <button
                    key={item.label}
                    onClick={item.onClick}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-[hsl(var(--surface-2))]"
                  >
                    <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${item.className}`}>
                      <item.icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[hsl(var(--foreground))]">{item.label}</span>
                      <span className="mt-0.5 block text-xs text-[hsl(var(--muted-foreground))]">{item.helper}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setFabOpen((value) => !value)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_24px_50px_-24px_hsl(var(--primary))] transition-transform active:scale-95"
            aria-label="Buka quick actions"
          >
            <Plus size={18} className={`transition-transform ${fabOpen ? "rotate-45" : "rotate-0"}`} />
          </button>
        </div>
      )}

      <TransactionForm
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => void loadDashboardData()}
        accounts={accounts.filter((a) => !a.isArchived) as typeof accounts}
        categories={categories}
        defaultType={defaultType}
      />

      <TransactionForm
        key={editTx?.id ?? "edit-none"}
        open={editTx !== null}
        onClose={() => setEditTx(null)}
        onSaved={() => { void loadDashboardData(); setEditTx(null); }}
        accounts={accounts.filter((a) => !a.isArchived) as typeof accounts}
        categories={categories}
        existing={editTx ?? undefined}
      />

      <AITransactionForm
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onSaved={() => { void loadDashboardData(); setAiOpen(false); }}
        accounts={accounts}
        categories={categories}
      />

      <Modal open={deleteTargetId !== null} onClose={() => setDeleteTargetId(null)} title="Hapus Transaksi">
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">Yakin ingin menghapus transaksi ini? Aksi ini tidak bisa dibatalkan.</p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setDeleteTargetId(null)}>Batal</Button>
          <Button variant="destructive" className="flex-1" onClick={() => deleteTargetId !== null && handleDelete(deleteTargetId)}>Hapus</Button>
        </div>
      </Modal>
    </div>
  );
}


