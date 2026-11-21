import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { Card, CardContent, Modal, Button, ProgressBar } from "@/components/ui";
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
import { getDebts } from "@/db/debts";
import { getAssets } from "@/db/assets";
import { getPortfolioMetrics } from "@/lib/portfolioMetrics";
import { getNetWorth } from "@/lib/netWorth";
import { getAttentionItems } from "@/lib/attention";
import { Plus, Settings, CreditCard, Eye, EyeOff, AlertTriangle, Target, Pencil, Trash2, Receipt, HandCoins, ChevronDown, ChevronUp, MoreHorizontal, TrendingDown, TrendingUp, ArrowRightLeft, Sparkles, MessageCircle } from "lucide-react";
import type { AssetPrice, Debt, RecurringTransaction, Transaction } from "@/types";
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
  const [debts, setDebts] = useState<Debt[]>([]);
  const [portfolio, setPortfolio] = useState({ totalValue: 0, unpricedAssetCount: 0 });
  const [budgetUsage, setBudgetUsage] = useState<{ categoryId: number; name: string; used: number; limit: number }[]>([]);
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
    
    const [recurring, budgets, categorySpending, anomalies, latestTransactions, debtRows, assets, storedPrices] = await Promise.all([
      getUpcomingRecurringTransactions(),
      getBudgetsForCategoriesWithInheritance(monthKey, expenseCategoryIds),
      getCategoryExpenseData(now.getFullYear(), now.getMonth() + 1),
      getRecentSpendingAnomalies(),
      getTransactions(),
      getDebts(),
      getAssets(),
      db.assetPrices.toArray(),
    ]);
    const priceMap: Record<string, AssetPrice> = {};
    for (const price of storedPrices) priceMap[price.symbol] = price;
    const metrics = getPortfolioMetrics(assets, priceMap);
    setPortfolio({ totalValue: metrics.totalValue, unpricedAssetCount: metrics.unpricedAssetCount });
    setDebts(debtRows);
    setBudgetUsage(budgets.map((budget) => ({
      categoryId: budget.categoryId,
      name: allCategories.find((item) => item.id === budget.categoryId)?.name ?? "Kategori",
      used: categorySpending[budget.categoryId] ?? 0,
      limit: budget.amount,
    })));
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
  const monthIncome = thisMonthTxs.filter((t) => !t.debtId && !t.isAdjustment && t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = thisMonthTxs.filter((t) => !t.debtId && !t.isAdjustment && t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const recentTxs = recentExpanded ? transactions.slice(0, 5) : transactions.slice(0, 3);
  const upcomingBills = recurringItems
    .filter((item) => item.isActive && item.type === "expense")
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 3);
  const monthNet = monthIncome - monthExpense;
  const savingsRate = monthIncome > 0 ? Math.round(monthNet / monthIncome * 100) : null;
  const totalCategorySpending = Object.values(expenseByCategory).reduce((sum, amount) => sum + amount, 0);
  const topSpendingCategories = Object.entries(expenseByCategory).sort(([, a], [, b]) => b - a).slice(0, 3);
  const money = (amount: number) => balanceHidden ? "•••" : formatCurrency(amount, currency);
  const netWorth = useMemo(() => getNetWorth(accounts, portfolio, debts), [accounts, portfolio, debts]);
  const attentionItems = getAttentionItems({
    today: format(now, "yyyy-MM-dd"),
    bills: recurringItems
      .filter((item) => item.isActive && item.type === "expense" && item.id !== undefined)
      .map((item) => ({ id: item.id!, name: item.note || categories.find((c) => c.id === item.categoryId)?.name || "Tagihan", amount: item.amount, nextDate: item.nextDate })),
    budgets: budgetUsage,
    debts,
  });
  const topBudgetAlert = budgetAlerts[0] ?? null;
  const topAnomalyAlert = anomalyAlerts[0] ?? null;

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

  function editRecent(tx: Transaction) {
    if (tx.isAdjustment) navigate("/accounts");
    else if (tx.debtId) navigate("/debts");
    else setEditTx(tx);
  }
  function deleteRecent(tx: Transaction) {
    if (tx.debtId) navigate("/debts");
    else setDeleteTargetId(tx.id!);
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

  const hasAccounts = activeAccounts.length > 0;
  const monthLabel = now.toLocaleString("id-ID", { month: "long" });
  const dateLabel = formatDate(now.toISOString(), "EEEE, dd MMMM");
  const attentionIcon = { bill: Receipt, budget: Target, debt: HandCoins } as const;
  const attentionTone = { bill: "bg-primary/10 text-primary", budget: "bg-warning/10 text-warning", debt: "bg-danger/10 text-danger" } as const;
  const sectionTitle = "text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]";
  const cardCls = "rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4";
  const maskedTone = (tone: string) => (balanceHidden ? "text-[hsl(var(--muted-foreground))]" : tone);

  const attentionList = (
    <ul className="divide-y divide-[hsl(var(--border))]">
      {attentionItems.map((item) => {
        const Icon = attentionIcon[item.kind];
        return (
          <li key={item.key}>
            <Link to={item.href} className="flex min-h-14 items-center gap-3 py-2.5">
              <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${attentionTone[item.kind]}`}><Icon size={18} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium">{item.title}</span>
                <span className="block text-xs text-[hsl(var(--muted-foreground))]">{item.detail}</span>
              </span>
              <span className="flex-none text-sm font-semibold tabular-nums">{item.amount !== undefined ? money(item.amount) : item.percent !== undefined ? (balanceHidden ? "•••" : `${item.percent}%`) : null}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const categoryBars = topSpendingCategories.length === 0 ? <p className="py-2 text-sm text-[hsl(var(--muted-foreground))]">Belum ada pengeluaran bulan ini.</p> : (
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
                {!balanceHidden && <div className="h-full rounded-full" style={{ width: `${percentage}%`, background: category?.color ?? "hsl(var(--primary))" }} />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const kpis = [
    { label: "Total saldo", value: money(totalBalance), tone: "", note: `${activeAccounts.length} akun` },
    { label: `Masuk ${monthLabel}`, value: money(monthIncome), tone: "text-success", note: null },
    { label: `Keluar ${monthLabel}`, value: money(monthExpense), tone: "text-danger", note: null },
    { label: "Kekayaan bersih", value: money(netWorth.total), tone: "", note: netWorth.unpricedAssetCount > 0 ? `${netWorth.unpricedAssetCount} aset belum ada harga` : null },
  ];

  return (
    <div className="space-y-4 px-4 pt-5 pb-4 lg:px-0 lg:pt-6 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[hsl(var(--primary))]">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{dateLabel}</p>
          <h1 className="text-2xl font-bold tracking-tight">Ringkasan kamu</h1>
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
                <Link to="/accounts" onClick={() => setHeroMenuOpen(false)} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]">
                  <CreditCard size={16} /> Akun
                </Link>
                <Link to="/settings" onClick={() => setHeroMenuOpen(false)} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]">
                  <Settings size={16} /> Pengaturan
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {hasAccounts && (
        <>
          {/* Mobile: balance + cash flow */}
          <section aria-label="Total saldo" className="space-y-3 lg:hidden">
            <div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Total saldo · <Link to="/accounts" className="inline-flex min-h-11 items-center text-[hsl(var(--primary))]">{activeAccounts.length} akun</Link></p>
              <p className="mt-1 break-words text-[38px] font-extrabold leading-tight tracking-tight tabular-nums">{money(totalBalance)}</p>
              <p className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${balanceHidden ? "bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]" : monthNet >= 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                {balanceHidden ? "•••" : `${monthNet >= 0 ? "+" : "-"}${formatCurrency(Math.abs(monthNet), currency)}`} bulan ini
              </p>
            </div>
            <div className={cardCls}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold capitalize">{monthLabel}</h2>
                <Link to="/reports" className="inline-flex min-h-11 items-center text-xs text-[hsl(var(--primary))]">Lihat laporan</Link>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Masuk</dt><dd className={`mt-0.5 break-words text-base font-bold tabular-nums ${maskedTone("text-success")}`}>{money(monthIncome)}</dd></div>
                <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Keluar</dt><dd className="mt-0.5 break-words text-base font-bold tabular-nums">{money(monthExpense)}</dd></div>
              </dl>
              {monthIncome > 0 && (
                <div className="mt-3 space-y-2">
                  <ProgressBar value={monthExpense} max={monthIncome} label="Pengeluaran dibanding pemasukan" />
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{balanceHidden ? "•••" : `${Math.round(monthExpense / monthIncome * 100)}% pemasukan sudah terpakai · tingkat tabungan ${savingsRate}%`}</p>
                </div>
              )}
            </div>
          </section>

          {/* Desktop: KPI row */}
          <section aria-label="Ringkasan keuangan" className="hidden gap-4 lg:grid lg:grid-cols-4">
            {kpis.map(({ label, value, tone, note }) => (
              <div key={label} className={cardCls}>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
                <p className={`mt-1 break-words text-2xl font-extrabold tracking-tight tabular-nums ${maskedTone(tone)}`}>{value}</p>
                {note && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{note}</p>}
              </div>
            ))}
          </section>

          <div role="group" aria-label="Aksi dashboard" className="flex flex-wrap gap-2">
            {fabActions.map(({ label, icon: Icon, onClick }) => <Button key={label} variant="outline" size="sm" className="min-h-10" onClick={onClick}><Icon size={15} />{label}</Button>)}
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="contents lg:block lg:min-w-0 lg:space-y-4">
              {attentionItems.length > 0 && (
                <section aria-label="Perlu perhatian" className="space-y-2 lg:hidden">
                  <h2 className={`px-1 ${sectionTitle}`}>Perlu perhatian</h2>
                  <div className={cardCls}>{attentionList}</div>
                </section>
              )}

              <section aria-label="Terbaru" className="space-y-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <h2 className={sectionTitle}>Terbaru</h2>
                  <div className="flex items-center gap-3">
                    {transactions.length > 3 && (
                      <button aria-expanded={recentExpanded} onClick={() => setRecentExpanded((value) => !value)} className="min-h-11 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                        {recentExpanded ? "Ringkas" : "Tampilkan lagi"}
                      </button>
                    )}
                    <Link to="/transactions" className="inline-flex min-h-11 items-center text-xs font-medium text-[hsl(var(--primary))] hover:underline">Semua transaksi</Link>
                  </div>
                </div>
                {recentTxs.length === 0 && <p className={`${cardCls} text-sm text-[hsl(var(--muted-foreground))]`}>Belum ada transaksi. Catat pemasukan atau pengeluaran pertamamu.</p>}
                <div className="space-y-2 lg:hidden">
                  {recentTxs.map((tx) => (
                    <TransactionCard
                      key={tx.id}
                      bordered
                      transaction={tx}
                      accountName={getAccountName(tx.accountId)}
                      toAccountName={tx.toAccountId ? getAccountName(tx.toAccountId) : undefined}
                      categoryLabel={splitTxIds.has(tx.id!) ? "Split" : (getCategoryName(tx.categoryId) ?? undefined)}
                      currency={currency}
                      hidden={balanceHidden}
                      hasSplits={splitTxIds.has(tx.id!)}
                      onEdit={() => editRecent(tx)}
                      onDelete={() => deleteRecent(tx)}
                    />
                  ))}
                </div>
                {recentTxs.length > 0 && (
                  <div className="hidden overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] lg:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[hsl(var(--border))] text-left text-xs text-[hsl(var(--muted-foreground))]">
                          <th scope="col" className="px-4 py-2.5 font-medium">Keterangan</th>
                          <th scope="col" className="px-4 py-2.5 font-medium">Kategori</th>
                          <th scope="col" className="px-4 py-2.5 font-medium">Akun</th>
                          <th scope="col" className="px-4 py-2.5 text-right font-medium">Jumlah</th>
                          <th scope="col" className="px-4 py-2.5 text-right font-medium"><span className="sr-only">Aksi</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[hsl(var(--border))]">
                        {recentTxs.map((tx) => (
                          <tr key={tx.id}>
                            <td className="px-4 py-3"><span className="font-medium">{tx.note || getCategoryName(tx.categoryId) || "Transaksi"}</span><span className="block text-xs text-[hsl(var(--muted-foreground))]">{formatDate(tx.date, "dd MMM")}</span></td>
                            <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{splitTxIds.has(tx.id!) ? "Split" : getCategoryName(tx.categoryId) ?? "—"}</td>
                            <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{getAccountName(tx.accountId)}{tx.toAccountId ? ` → ${getAccountName(tx.toAccountId)}` : ""}</td>
                            <td className={`px-4 py-3 text-right font-semibold tabular-nums ${maskedTone(tx.type === "income" ? "text-success" : "")}`}>{tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}{money(tx.amount)}</td>
                            <td className="px-2 py-1 text-right">
                              <div className="flex justify-end">
                                <button type="button" aria-label={`Ubah ${tx.note || getCategoryName(tx.categoryId) || "transaksi"}`} onClick={() => editRecent(tx)} className="flex h-11 w-11 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]"><Pencil size={16} /></button>
                                <button type="button" aria-label={`Hapus ${tx.note || getCategoryName(tx.categoryId) || "transaksi"}`} onClick={() => deleteRecent(tx)} className="flex h-11 w-11 items-center justify-center rounded-xl text-danger hover:bg-danger/10"><Trash2 size={16} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section aria-label="Pengeluaran bulan ini" className={`${cardCls} space-y-3 lg:hidden`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold capitalize">Pengeluaran {monthLabel}</h2>
                  <Link to="/reports" className="inline-flex min-h-11 items-center text-xs text-[hsl(var(--primary))]">Semua kategori</Link>
                </div>
                {categoryBars}
              </section>
            </div>

            <div className="contents lg:block lg:min-w-0 lg:space-y-4">
              {attentionItems.length > 0 && (
                <section aria-label="Perlu perhatian" className={`${cardCls} hidden space-y-1 lg:block`}>
                  <h2 className="text-sm font-semibold">Perlu perhatian</h2>
                  {attentionList}
                </section>
              )}

              <section aria-label="Pengeluaran per kategori" className={`${cardCls} hidden space-y-3 lg:block`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold capitalize">Pengeluaran {monthLabel}</h2>
                  <Link to="/reports" className="inline-flex min-h-11 items-center text-xs text-[hsl(var(--primary))]">Semua kategori</Link>
                </div>
                {categoryBars}
              </section>

              {(upcomingBills.length > 0 || budgetAlerts.length > 0 || anomalyAlerts.length > 0) && (
                <section aria-label="Peringatan dan tagihan" className={`${cardCls} space-y-3`}>
                  <h2 className="text-sm font-semibold">Peringatan dan tagihan</h2>
                  <div className="grid gap-2">
                    {upcomingBills.map((bill) => {
                      const dueStatus = getDueStatus(bill.nextDate);
                      const categoryLabel = getCategoryName(bill.categoryId);
                      return (
                        <Link key={bill.id} to="/transactions?tab=recurring" className="rounded-xl bg-[hsl(var(--surface-2))]/50 px-3 py-2.5 transition-colors hover:bg-[hsl(var(--accent))]">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-primary/10 text-base text-primary">{categoryLabel?.split(" ")[0] ?? "🧾"}</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="break-words text-sm font-medium">{bill.note || categoryLabel || "Tagihan berikutnya"}</p>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${dueStatus.className}`}>{dueStatus.label}</span>
                              </div>
                              <p className="mt-0.5 break-words text-xs text-[hsl(var(--muted-foreground))]">{getAccountName(bill.accountId)} · {formatDate(bill.nextDate, "dd MMM")}</p>
                            </div>
                            <p className={`max-w-full break-words text-sm font-semibold tabular-nums ${maskedTone("text-danger")}`}>{money(bill.amount)}</p>
                          </div>
                        </Link>
                      );
                    })}

                    {topBudgetAlert && (() => {
                      const isDanger = topBudgetAlert.level === "danger";
                      const predictionLabel = !isDanger && topBudgetAlert.predictedExhaustInDays !== null
                        ? topBudgetAlert.predictedExhaustInDays <= 1 ? "Estimasi habis hari ini" : `Estimasi habis ${topBudgetAlert.predictedExhaustInDays} hari lagi`
                        : null;
                      const tone = isDanger ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning";
                      return (
                        <Link to="/reports" className="rounded-xl bg-[hsl(var(--surface-2))]/50 px-3 py-2.5 transition-colors hover:bg-[hsl(var(--accent))]">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${tone}`}><span className="text-base">{topBudgetAlert.categoryIcon}</span></div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="break-words text-sm font-medium">Budget {topBudgetAlert.categoryName}</p>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{balanceHidden ? "•••" : `${topBudgetAlert.percentage}%`}</span>
                              </div>
                              <p className="mt-0.5 break-words text-xs text-[hsl(var(--muted-foreground))]">{money(topBudgetAlert.spent)} dari {money(topBudgetAlert.budget)}</p>
                              {predictionLabel && <p className="mt-0.5 text-xs text-warning">{predictionLabel}</p>}
                              {isDanger && topBudgetAlert.projectedOverrun > 0 && <p className="mt-0.5 text-xs text-danger">Proyeksi over budget {money(topBudgetAlert.projectedOverrun)} bulan ini</p>}
                            </div>
                            <AlertTriangle size={14} className={isDanger ? "text-danger" : "text-warning"} />
                          </div>
                        </Link>
                      );
                    })()}

                    {topAnomalyAlert && (() => {
                      const isDanger = topAnomalyAlert.severity === "danger";
                      const tone = isDanger ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning";
                      const ratioLabel = balanceHidden ? "•••" : `${topAnomalyAlert.ratioToAverage.toFixed(1)}x dari rata-rata`;
                      return (
                        <Link to={`/transactions?tx=${topAnomalyAlert.transactionId}`} className="rounded-xl bg-[hsl(var(--surface-2))]/50 px-3 py-2.5 transition-colors hover:bg-[hsl(var(--accent))]">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${tone}`}><span className="text-base">{topAnomalyAlert.categoryIcon}</span></div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="break-words text-sm font-medium">Lonjakan {topAnomalyAlert.categoryName}</p>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{ratioLabel}</span>
                              </div>
                              <p className="mt-0.5 break-words text-xs text-[hsl(var(--muted-foreground))]">{topAnomalyAlert.note || `${topAnomalyAlert.categoryName} di ${getAccountName(topAnomalyAlert.accountId)}`}</p>
                              <p className={`mt-0.5 text-xs ${isDanger ? "text-danger" : "text-warning"}`}>{money(topAnomalyAlert.amount)} vs rata-rata {money(topAnomalyAlert.baselineAverage)}</p>
                            </div>
                            <AlertTriangle size={14} className={isDanger ? "text-danger" : "text-warning"} />
                          </div>
                        </Link>
                      );
                    })()}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {upcomingBills.length > 0 && <Link to="/transactions?tab=recurring" className="text-[hsl(var(--primary))] hover:underline">Kelola tagihan</Link>}
                    {budgetAlerts.length > 0 && <Link to="/reports" className="inline-flex items-center gap-1 text-[hsl(var(--primary))] hover:underline"><Target size={12} /> Lihat budget</Link>}
                    {anomalyAlerts.length > 0 && <Link to={`/transactions?tx=${topAnomalyAlert?.transactionId ?? ""}`} className="inline-flex items-center gap-1 text-[hsl(var(--primary))] hover:underline"><AlertTriangle size={12} /> Review transaksi</Link>}
                  </div>
                </section>
              )}

              <section aria-label="Akun aktif" className={`${cardCls} space-y-3`}>
                <button aria-expanded={!accountsCollapsed} onClick={() => setAccountsCollapsed((value) => !value)} className="flex w-full items-center justify-between gap-3">
                  <div>
                    <p className="text-left text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">Akun aktif</p>
                    <p className="mt-1 text-left text-sm font-semibold">{activeAccounts.length} akun</p>
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
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-sm" style={{ background: `${account.color}20` }}>{account.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-xs font-semibold">{account.name}</p>
                          <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">{ACCOUNT_TYPE_LABELS[account.type]}</p>
                        </div>
                        <p className="max-w-full break-words text-right text-xs font-semibold tabular-nums">{money(account.currentBalance)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
      {!hasAccounts && (
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
