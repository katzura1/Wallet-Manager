import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { Card, CardContent, Modal, Button, Badge } from "@/components/ui";
import { TransactionForm } from "@/components/forms/TransactionForm";
import { AITransactionForm } from "@/components/forms/AITransactionForm";
import { TransactionCard } from "@/components/TransactionCard";
import { formatCurrency, formatDate, ACCOUNT_TYPE_LABELS } from "@/lib/utils";
import { deleteTransaction, getRecentSpendingAnomalies, getTransactions } from "@/db/transactions";
import { getUpcomingRecurringTransactions, getRecurringDueInfo } from "@/db/recurring";
import { predictBudgetStatus, getBudgetsForCategoriesWithInheritance } from "@/db/budgets";
import { getCategoryExpenseData } from "@/db/transactions";
import { getCategories } from "@/db/categories";
import { db } from "@/db/db";
import { Plus, Settings, CreditCard, Eye, EyeOff, AlertTriangle, Target, ChevronDown, ChevronUp, MoreHorizontal, TrendingDown, TrendingUp, ArrowRightLeft, Sparkles, MessageCircle } from "lucide-react";
import type { RecurringTransaction, Transaction } from "@/types";
import { useAppLayout, usePageAction } from "@/components/layout/appLayoutContext";

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
  const navigate = useNavigate();
  const { openChat } = useAppLayout();
  const { accounts, categories, refreshAll } = useWalletStore();
  const { currency } = useSettingsStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<Transaction["type"]>("expense");
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [balanceHidden, setBalanceHidden] = useState(() => localStorage.getItem("balance_hidden") === "1");
  const [splitTxIds, setSplitTxIds] = useState<Set<number>>(new Set());
  const [aiOpen, setAiOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenseByCategory, setExpenseByCategory] = useState<Record<number, number>>({});
  const [recurringItems, setRecurringItems] = useState<RecurringTransaction[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlertItem[]>([]);
  const [anomalyAlerts, setAnomalyAlerts] = useState<AnomalyAlertItem[]>([]);
  const [accountsCollapsed, setAccountsCollapsed] = useState(false);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [heroMenuOpen, setHeroMenuOpen] = useState(false);
  const heroMenuRef = useRef<HTMLDivElement | null>(null);

  function toggleBalanceHidden() {
    setBalanceHidden((v) => {
      localStorage.setItem("balance_hidden", v ? "0" : "1");
      return !v;
    });
  }

  useEffect(() => {
    db.transactionSplits.toArray().then((rows) => {
      setSplitTxIds(new Set(rows.map((r) => r.transactionId)));
    });
  }, [transactions]);

  const loadDashboardData = useCallback(async () => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    // Get all categories first to determine which are expense categories
    const allCategories = await getCategories();
    const expenseCategoryIds = allCategories
      .filter((c) => c.type === "expense" || c.type === "both")
      .map((c) => c.id)
      .filter((id): id is number => id !== undefined);
    
    const [recurring, budgets, categorySpending, anomalies, latestTransactions] = await Promise.all([
      getUpcomingRecurringTransactions(),
      getBudgetsForCategoriesWithInheritance(monthKey, expenseCategoryIds),
      getCategoryExpenseData(now.getFullYear(), now.getMonth() + 1),
      getRecentSpendingAnomalies(),
      getTransactions(),
    ]);
    setRecurringItems(recurring);
    setTransactions(latestTransactions);
    setExpenseByCategory(categorySpending);
    const alerts = budgets
      .map((budget) => {
        const spent = categorySpending[budget.categoryId] ?? 0;
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
  }, []);

  useEffect(() => {
    void refreshAll().then(loadDashboardData);
  }, [refreshAll, loadDashboardData]);

  // PWA shortcuts open the form directly from the URL until it is closed.
  const requestedType = searchParams.get("type");
  const shortcutType = requestedType === "expense" || requestedType === "income" || requestedType === "transfer" ? requestedType : null;

  function closeTransactionForm() {
    setAddOpen(false);
    if (shortcutType) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("type");
      setSearchParams(nextParams, { replace: true });
    }
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!heroMenuRef.current?.contains(event.target as Node)) {
        setHeroMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setHeroMenuOpen(false);
        heroMenuRef.current?.querySelector("button")?.focus();
      }
    }
    if (heroMenuOpen) {
      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [heroMenuOpen]);

  const activeAccounts = accounts.filter((account) => !account.isArchived);
  const totalBalance = activeAccounts.reduce((sum, a) => sum + a.currentBalance, 0);
  const now = new Date();

  const thisMonthTxs = transactions.filter((t) => t.date.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`));
  const monthIncome = thisMonthTxs.filter((t) => !t.debtId && t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = thisMonthTxs.filter((t) => !t.debtId && t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const recentTxs = recentExpanded ? transactions.slice(0, 6) : transactions.slice(0, 3);
  const upcomingBills = recurringItems
    .filter((item) => item.isActive && item.type === "expense")
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 3);
  const upcomingBillsTotal = upcomingBills.reduce((sum, item) => sum + item.amount, 0);
  const monthNet = monthIncome - monthExpense;
  const savingsRate = monthIncome > 0 ? Math.round(monthNet / monthIncome * 100) : null;
  const totalCategorySpending = Object.values(expenseByCategory).reduce((sum, amount) => sum + amount, 0);
  const topSpendingCategories = Object.entries(expenseByCategory).sort(([, a], [, b]) => b - a).slice(0, 3);
  const money = (amount: number) => balanceHidden ? "•••" : formatCurrency(amount, currency);
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
    const info = getRecurringDueInfo(date);
    return {
      ...info,
      className: {
        overdue: "text-red-600 dark:text-red-400 bg-red-500/10",
        today: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
        soon: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10",
        upcoming: "text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]",
      }[info.tone],
    };
  }

  async function handleDelete(id: number) {
    await deleteTransaction(id);
    await refreshAll();
    await loadDashboardData();
    setDeleteTargetId(null);
  }

  function openTransaction(type: Transaction["type"]) {
    setHeroMenuOpen(false);
    setDefaultType(type);
    setAddOpen(true);
  }

  function openAiTransaction() {
    setHeroMenuOpen(false);
    setAiOpen(true);
  }

  const fabActions = [
    {
      label: "Pengeluaran",
      helper: "Catat belanja dan biaya",
      icon: TrendingDown,
      onClick: () => openTransaction("expense"),
    },
    {
      label: "Pemasukan",
      helper: "Gaji, bonus, pemasukan lain",
      icon: TrendingUp,
      onClick: () => openTransaction("income"),
    },
    {
      label: "Transfer",
      helper: "Pindah saldo antar akun",
      icon: ArrowRightLeft,
      onClick: () => openTransaction("transfer"),
    },
    {
      label: "Input AI/Struk",
      helper: "Input dari teks atau struk",
      icon: Sparkles,
      onClick: openAiTransaction,
    },
    {
      label: "Chat AI",
      helper: "Tanya tentang keuanganmu",
      icon: MessageCircle,
      onClick: openChat,
    },
  ];

  usePageAction(activeAccounts.length > 0 ? {
    label: "Tambah transaksi",
    onClick: () => openTransaction("expense"),
    mobileActions: fabActions.map(({ label, helper, icon, onClick }) => ({ label, description: helper, icon, onClick })),
  } : null);

  return (
    <div className="space-y-4 px-4 pt-5 pb-4 lg:px-0 lg:pt-6 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[hsl(var(--primary))]">
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{formatDate(now.toISOString(), "EEEE, dd MMMM yyyy")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={toggleBalanceHidden} aria-label={balanceHidden ? "Tampilkan nominal dashboard" : "Sembunyikan nominal dashboard"} aria-pressed={balanceHidden} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]">
                {balanceHidden ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              <div ref={heroMenuRef} className="relative">
                <button
                  aria-label="Menu dashboard"
                  aria-expanded={heroMenuOpen}
                  onClick={() => setHeroMenuOpen((value) => !value)}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
                >
                  <MoreHorizontal size={18} />
                </button>
                {heroMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-44 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 text-[hsl(var(--foreground))] shadow-lg">
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
            <div className="min-w-0">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Saldo akun aktif</p>
              <p className="mt-1 break-words text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{money(totalBalance)}</p>
              <Link to="/accounts" className="mt-1 inline-block text-xs text-[hsl(var(--primary))]">{activeAccounts.length} akun · Kelola akun</Link>
            </div>
            <section aria-label="Arus kas bulan ini" className="min-w-0 border-t border-[hsl(var(--border))] pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold">{now.toLocaleString("id-ID", { month: "long", year: "numeric" })}</h2>
                <Link to="/reports" className="text-xs text-[hsl(var(--primary))]">Lihat laporan</Link>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Pemasukan", value: money(monthIncome), tone: "text-emerald-500" },
                  { label: "Pengeluaran", value: money(monthExpense), tone: "text-red-500" },
                  { label: "Saldo bersih", value: money(monthNet), tone: monthNet >= 0 ? "text-emerald-500" : "text-red-500" },
                  { label: "Tingkat tabungan", value: balanceHidden ? "•••" : savingsRate === null ? "—" : `${savingsRate}%`, tone: "" },
                ].map(({ label, value, tone }) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[11px] text-[hsl(var(--muted-foreground))]">{label}</dt>
                    <dd className={`mt-1 break-words text-sm font-semibold tabular-nums ${balanceHidden ? "text-[hsl(var(--muted-foreground))]" : tone}`}>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
          {activeAccounts.length > 0 && (
            <div role="group" aria-label="Aksi dashboard" className="flex flex-wrap gap-2 border-t border-[hsl(var(--border))] pt-3">
              {fabActions.map(({ label, icon: Icon, onClick }) => <Button key={label} variant="outline" size="sm" className="min-h-10" onClick={onClick}><Icon size={15} />{label}</Button>)}
            </div>
          )}
        </CardContent>
      </Card>

      {activeAccounts.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="contents lg:block lg:min-w-0 lg:space-y-4">
            <Card className="order-2">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">Pengeluaran utama</h2>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Pengeluaran bersih per kategori bulan ini.</p>
                  </div>
                  <Link to="/reports" className="text-xs text-[hsl(var(--primary))]">Semua kategori</Link>
                </div>
                {topSpendingCategories.length === 0 ? <p className="py-2 text-sm text-[hsl(var(--muted-foreground))]">Belum ada pengeluaran bulan ini.</p> : (
                  <div className="space-y-3">
                    {topSpendingCategories.map(([categoryId, amount]) => {
                      const category = categories.find((item) => item.id === Number(categoryId));
                      const percentage = totalCategorySpending > 0 ? Math.round(amount / totalCategorySpending * 100) : 0;
                      return (
                        <div key={categoryId} className="flex min-w-0 items-center gap-3">
                          <span aria-hidden="true">{category?.icon ?? "📦"}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap justify-between gap-1 text-xs">
                              <span className="break-words font-medium">{category?.name ?? "Lainnya"}</span>
                              <span className="max-w-full break-words font-semibold tabular-nums">{money(amount)} <span className="font-normal text-[hsl(var(--muted-foreground))]">({balanceHidden ? "•••" : `${percentage}%`})</span></span>
                            </div>
                            <div aria-hidden="true" className="mt-1.5 h-1.5 rounded-full bg-[hsl(var(--surface-2))]">
                              {!balanceHidden && <div className="h-full rounded-full" style={{ width: `${percentage}%`, background: category?.color ?? "#6366f1" }} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Recent Transactions */}
            {activeAccounts.length > 0 && (
              <div className="order-3 space-y-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                      <p className="text-sm font-semibold">Transaksi terbaru</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {transactions.length > 3 && (
                      <button
                        aria-expanded={recentExpanded}
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
                {recentTxs.length === 0 && <p className="py-3 text-sm text-[hsl(var(--muted-foreground))]">Belum ada transaksi. Catat pemasukan atau pengeluaran pertamamu.</p>}
                <div className="space-y-2">
                  {recentTxs.map((tx) => (
                    <TransactionCard
                      key={tx.id}
                      transaction={tx}
                      accountName={getAccountName(tx.accountId)}
                      toAccountName={tx.toAccountId ? getAccountName(tx.toAccountId) : undefined}
                      categoryLabel={splitTxIds.has(tx.id!) ? "Split" : (getCategoryName(tx.categoryId) ?? undefined)}
                      currency={currency}
                      hidden={balanceHidden}
                      hasSplits={splitTxIds.has(tx.id!)}
                      onEdit={() => tx.debtId ? navigate("/debts") : setEditTx(tx)}
                      onDelete={() => tx.debtId ? navigate("/debts") : setDeleteTargetId(tx.id!)}
                    />
                  ))}
                </div>
              </div>
            )}

          </div>
          <div className="contents lg:block lg:min-w-0 lg:space-y-4">
            {activeAccounts.length > 0 && (
              <Card role="complementary" aria-label="Perlu perhatian" className="order-1 overflow-hidden">
                <CardContent className="space-y-3 p-4">
                  <div className="space-y-3">
                    <div>
                      <h2 className="text-sm font-semibold">Perlu perhatian</h2>
                      <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                        {attentionItemsCount >= 2
                          ? `${attentionItemsCount} sinyal finansial perlu dicek hari ini`
                          : nextBill
                            ? `${upcomingBills.length} tagihan dalam 7 hari · ${money(upcomingBillsTotal)}`
                            : topBudgetAlert
                              ? `${budgetAlerts.length} kategori mendekati limit bulan ini`
                              : topAnomalyAlert ? `${anomalyAlerts.length} transaksi terlihat tidak biasa` : "Tidak ada tagihan dalam 7 hari atau peringatan yang terdeteksi."}
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

                  <div className="grid gap-2">
                    {upcomingBills.map((bill) => {
                      const dueStatus = getDueStatus(bill.nextDate);
                      const categoryLabel = getCategoryName(bill.categoryId);
                      return (
                        <Link
                          key={bill.id}
                          to="/transactions?tab=recurring"
                          className="rounded-xl bg-[hsl(var(--surface-2))]/50 px-3 py-2.5 hover:bg-[hsl(var(--accent))] transition-colors"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-base flex-none">
                              {categoryLabel?.split(" ")[0] ?? "🧾"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium break-words">{bill.note || categoryLabel || "Tagihan berikutnya"}</p>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${dueStatus.className}`}>
                                  {dueStatus.label}
                                </span>
                              </div>
                              <p className="text-xs text-[hsl(var(--muted-foreground))] break-words mt-0.5">
                                {getAccountName(bill.accountId)} · {formatDate(bill.nextDate, "dd MMM")}
                              </p>
                            </div>
                            <p className={`max-w-full break-words text-sm font-semibold tabular-nums ${balanceHidden ? "text-[hsl(var(--muted-foreground))]" : "text-red-500"}`}>{money(bill.amount)}</p>
                          </div>
                        </Link>
                      );
                    })}

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
                          className="rounded-xl bg-[hsl(var(--surface-2))]/50 px-3 py-2.5 hover:bg-[hsl(var(--accent))] transition-colors"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-none ${isDanger ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                              <span className="text-base">{topBudgetAlert.categoryIcon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium break-words">Budget {topBudgetAlert.categoryName}</p>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${isDanger ? "text-red-600 dark:text-red-400 bg-red-500/10" : "text-amber-600 dark:text-amber-400 bg-amber-500/10"}`}>
                                  {balanceHidden ? "•••" : `${topBudgetAlert.percentage}%`}
                                </span>
                              </div>
                              <p className="text-xs text-[hsl(var(--muted-foreground))] break-words mt-0.5">
                                {money(topBudgetAlert.spent)} dari {money(topBudgetAlert.budget)}
                              </p>
                              {predictionLabel && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{predictionLabel}</p>
                              )}
                              {isDanger && topBudgetAlert.projectedOverrun > 0 && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                                  Proyeksi over budget {money(topBudgetAlert.projectedOverrun)} bulan ini
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
                      const ratioLabel = balanceHidden ? "•••" : `${topAnomalyAlert.ratioToAverage.toFixed(1)}x dari rata-rata`;
                      const anomalyHref = `/transactions?tx=${topAnomalyAlert.transactionId}`;
                      return (
                        <Link
                          to={anomalyHref}
                          className="rounded-xl bg-[hsl(var(--surface-2))]/50 px-3 py-2.5 hover:bg-[hsl(var(--accent))] transition-colors"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-none ${isDanger ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                              <span className="text-base">{topAnomalyAlert.categoryIcon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium break-words">Lonjakan {topAnomalyAlert.categoryName}</p>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${isDanger ? "text-red-600 dark:text-red-400 bg-red-500/10" : "text-amber-600 dark:text-amber-400 bg-amber-500/10"}`}>
                                  {ratioLabel}
                                </span>
                              </div>
                              <p className="text-xs text-[hsl(var(--muted-foreground))] break-words mt-0.5">
                                {topAnomalyAlert.note || `${topAnomalyAlert.categoryName} di ${getAccountName(topAnomalyAlert.accountId)}`}
                              </p>
                              <p className={`text-xs mt-0.5 ${isDanger ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                                {money(topAnomalyAlert.amount)} vs rata-rata {money(topAnomalyAlert.baselineAverage)}
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

                  <div className="flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
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
            {activeAccounts.length > 0 && (
              <div className="order-4 space-y-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <button
                  aria-expanded={!accountsCollapsed}
                  onClick={() => setAccountsCollapsed((value) => !value)}
                  className="w-full flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))] text-left">Akun aktif</p>
                    <p className="text-sm font-semibold text-left mt-1">
                      {activeAccounts.length} akun
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
                    <span className="text-xs">{accountsCollapsed ? "Buka" : "Tutup"}</span>
                    {accountsCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  </div>
                </button>

                {!accountsCollapsed && (
                  <div className="divide-y divide-[hsl(var(--border))]">
                    {activeAccounts.map((account) => (
                      <div key={account.id} className="flex min-w-0 items-center gap-2.5 rounded-xl px-2 py-2">
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-sm" style={{ background: `${account.color}20` }}>
                          {account.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-xs font-semibold">{account.name}</p>
                          <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">{ACCOUNT_TYPE_LABELS[account.type]}</p>
                        </div>
                        <p className="max-w-full break-words text-right text-xs font-semibold tabular-nums">{money(account.currentBalance)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
      {activeAccounts.length === 0 && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <h2 className="text-lg font-semibold">Mulai kelola keuanganmu</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Tambah akun bank, e-wallet, kartu kredit, atau dompet tunai, lalu catat transaksi pertamamu.</p>
            <Link to="/accounts" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))]"><Plus size={17} />Tambah akun</Link>
          </CardContent>
        </Card>
      )}

      <TransactionForm
        open={addOpen || shortcutType !== null}
        onClose={closeTransactionForm}
        onSaved={() => void refreshAll().then(loadDashboardData)}
        accounts={activeAccounts}
        categories={categories}
        defaultType={shortcutType ?? defaultType}
      />

      <TransactionForm
        key={editTx?.id ?? "edit-none"}
        open={editTx !== null}
        onClose={() => setEditTx(null)}
        onSaved={() => { void refreshAll().then(loadDashboardData); setEditTx(null); }}
        accounts={activeAccounts}
        categories={categories}
        existing={editTx ?? undefined}
      />

      <AITransactionForm
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onSaved={() => { void refreshAll().then(loadDashboardData); setAiOpen(false); }}
        accounts={activeAccounts}
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
