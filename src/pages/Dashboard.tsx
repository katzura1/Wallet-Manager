import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { ConfirmDialog, IconTile, ProgressBar, Sheet } from "@/components/ui";
import { describeTransactionDelete } from "@/lib/deleteDescription";
import { TransactionForm } from "@/components/forms/TransactionForm";
import { AITransactionForm } from "@/components/forms/AITransactionForm";
import { TransactionCard } from "@/components/TransactionCard";
import { TransactionDetail } from "@/components/TransactionDetail";
import { formatCurrency, formatDate, readBalanceHidden, BALANCE_HIDDEN_KEY } from "@/lib/utils";
import { deleteTransaction, getRecentSpendingAnomalies, getTransactions } from "@/db/transactions";
import { getUpcomingRecurringTransactions } from "@/db/recurring";
import { predictBudgetStatus, getBudgetsForCategoriesWithInheritance } from "@/db/budgets";
import { getCategoryExpenseData } from "@/db/transactions";
import { getCategories } from "@/db/categories";
import { db } from "@/db/db";
import { getDebts } from "@/db/debts";
import { getAssets } from "@/db/assets";
import { getPortfolioMetrics } from "@/lib/portfolioMetrics";
import { getNetWorth } from "@/lib/netWorth";
import { getAttentionItems } from "@/lib/attention";
import { Settings, CreditCard, Eye, EyeOff, AlertTriangle, Target, Pencil, Trash2, Receipt, HandCoins, MoreHorizontal, TrendingDown, TrendingUp, ArrowRightLeft, Sparkles, MessageCircle, Wallet } from "lucide-react";
import type { AssetPrice, Debt, RecurringTransaction, Transaction, TransactionSplit } from "@/types";
import { useAppLayout } from "@/components/layout/appLayoutContext";

interface BudgetAlertItem {
  categoryId: number;
  categoryName: string;
  categoryColor: string | undefined;
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
  categoryColor: string | undefined;
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
  const [balanceHidden, setBalanceHidden] = useState(readBalanceHidden);
  const [splitMap, setSplitMap] = useState<Record<number, TransactionSplit[]>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenseByCategory, setExpenseByCategory] = useState<Record<number, number>>({});
  const [recurringItems, setRecurringItems] = useState<RecurringTransaction[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlertItem[]>([]);
  const [anomalyAlerts, setAnomalyAlerts] = useState<AnomalyAlertItem[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [portfolio, setPortfolio] = useState({ totalValue: 0, unpricedAssetCount: 0 });
  const [budgetUsage, setBudgetUsage] = useState<{ categoryId: number; name: string; used: number; limit: number }[]>([]);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [heroMenuOpen, setHeroMenuOpen] = useState(false);
  const heroMenuRef = useRef<HTMLDivElement | null>(null);

  function toggleBalanceHidden() {
    setBalanceHidden((v) => {
      localStorage.setItem(BALANCE_HIDDEN_KEY, v ? "0" : "1");
      return !v;
    });
  }

  useEffect(() => {
    db.transactionSplits.toArray().then((rows) => {
      const map: Record<number, TransactionSplit[]> = {};
      for (const split of rows) (map[split.transactionId] ??= []).push(split);
      setSplitMap(map);
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
          categoryColor: category?.color,
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
          categoryColor: category?.color,
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
      heroMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [heroMenuOpen]);

  const activeAccounts = useMemo(() => accounts.filter((account) => !account.isArchived), [accounts]);
  const totalBalance = activeAccounts.reduce((sum, a) => sum + a.currentBalance, 0);
  const now = new Date();
  const splitTxIds = useMemo(() => new Set(Object.keys(splitMap).map(Number)), [splitMap]);

  const thisMonthTxs = transactions.filter((t) => t.date.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`));
  const monthIncome = thisMonthTxs.filter((t) => !t.debtId && !t.isAdjustment && t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = thisMonthTxs.filter((t) => !t.debtId && !t.isAdjustment && t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const recentTxs = recentExpanded ? transactions.slice(0, 5) : transactions.slice(0, 3);
  const desktopRecentTxs = transactions.slice(0, 5);
  const monthNet = monthIncome - monthExpense;
  const savingsRate = monthIncome > 0 ? Math.round(monthNet / monthIncome * 100) : null;
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  const totalCategorySpending = Object.values(expenseByCategory).reduce((sum, amount) => sum + amount, 0);
  const topSpendingCategories = Object.entries(expenseByCategory).sort(([, a], [, b]) => b - a).slice(0, 3);
  const money = (amount: number) => balanceHidden ? "•••" : formatCurrency(amount, currency);
  const netWorth = useMemo(() => getNetWorth(accounts, portfolio, debts), [accounts, portfolio, debts]);

  function getAccountName(id: number) {
    return accounts.find((a) => a.id === id)?.name ?? "?";
  }
  function getCategoryName(id?: number) {
    if (!id) return null;
    const cat = categories.find((c) => c.id === id);
    return cat ? cat.name : null;
  }

  // Perlu perhatian: bills, budgets and debts from getAttentionItems, plus a spending-spike row when one exists.
  type HomeAttention = {
    key: string;
    kind: "bill" | "budget" | "debt" | "anomaly";
    title: string;
    detail: string;
    amount?: number;
    percent?: number;
    level?: "warning" | "danger";
    href: string;
  };
  const baseAttention = getAttentionItems({
    today: format(now, "yyyy-MM-dd"),
    bills: recurringItems
      .filter((item) => item.isActive && item.type === "expense" && item.id !== undefined)
      .map((item) => ({ id: item.id!, name: item.note || categories.find((c) => c.id === item.categoryId)?.name || "Tagihan", amount: item.amount, nextDate: item.nextDate })),
    budgets: budgetUsage,
    debts,
  });
  const attentionItems: HomeAttention[] = baseAttention.map((item) => {
    if (item.kind !== "budget") return item;
    const alert = budgetAlerts.find((entry) => `budget-${entry.categoryId}` === item.key);
    if (!alert) return { ...item, level: (item.percent ?? 0) >= 100 ? "danger" : "warning" };
    const isDanger = alert.level === "danger";
    const prediction = !isDanger && alert.predictedExhaustInDays !== null
      ? alert.predictedExhaustInDays <= 1 ? "Estimasi habis hari ini" : `Estimasi habis ${alert.predictedExhaustInDays} hari lagi`
      : isDanger && alert.projectedOverrun > 0 ? `Proyeksi over budget ${money(alert.projectedOverrun)} bulan ini` : null;
    return { ...item, level: alert.level, detail: prediction ?? `${money(alert.spent)} dari ${money(alert.budget)}` };
  });
  const topAnomaly = anomalyAlerts[0];
  if (topAnomaly) {
    attentionItems.push({
      key: `anomaly-${topAnomaly.transactionId}`,
      kind: "anomaly",
      title: `Lonjakan ${topAnomaly.categoryName}`,
      detail: `${money(topAnomaly.amount)} vs rata-rata ${money(topAnomaly.baselineAverage)}`,
      amount: topAnomaly.amount,
      level: topAnomaly.severity,
      href: `/transactions?tx=${topAnomaly.transactionId}`,
    });
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
    setSelectedId(null);
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

  const menuActions = [
    { label: "Pengeluaran", icon: TrendingDown, onClick: () => openTransaction("expense") },
    { label: "Pemasukan", icon: TrendingUp, onClick: () => openTransaction("income") },
    { label: "Transfer", icon: ArrowRightLeft, onClick: () => openTransaction("transfer") },
    { label: "Input AI/Struk", icon: Sparkles, onClick: openAiTransaction },
    { label: "Chat AI", icon: MessageCircle, onClick: () => { setHeroMenuOpen(false); openChat(); } },
  ];

  const hasAccounts = activeAccounts.length > 0;
  const monthLabel = now.toLocaleString("id-ID", { month: "long" });
  const dateLabel = formatDate(now.toISOString(), "EEEE, dd MMMM");
  const attentionIcon = { bill: Receipt, budget: Target, debt: HandCoins, anomaly: AlertTriangle } as const;
  const attentionTone = { bill: "bg-primary/10 text-primary", budget: "bg-warning/10 text-warning", debt: "bg-danger/10 text-danger", anomaly: "bg-warning/10 text-warning" } as const;
  const cardCls = "rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4";
  const maskedTone = (tone: string) => (balanceHidden ? "text-[hsl(var(--muted-foreground))]" : tone);
  const menuItemCls = "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] focus-visible:bg-[hsl(var(--surface-2))]";
  const selectedTx = selectedId !== null ? transactions.find((t) => t.id === selectedId) ?? null : null;

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  const attentionList = (
    <ul className="divide-y divide-[hsl(var(--border))]">
      {attentionItems.map((item) => {
        const Icon = attentionIcon[item.kind];
        const tone = item.level === "danger" ? "bg-danger/10 text-danger" : attentionTone[item.kind];
        const percentText = item.percent !== undefined ? (balanceHidden ? "•••" : `${item.percent}%`) : null;
        return (
          <li key={item.key}>
            <Link to={item.href} className="flex min-h-14 items-center gap-3 px-4 py-3 lg:px-0">
              <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${tone}`}><Icon size={18} aria-hidden="true" /></span>
              {item.kind === "budget" ? (
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 break-words text-sm font-semibold">{item.title}</span>
                    <span className={`flex-none text-xs font-semibold tabular-nums ${item.level === "danger" ? "text-danger" : "text-warning"}`}>{percentText}</span>
                  </span>
                  <ProgressBar value={balanceHidden ? 0 : item.percent ?? 0} max={100} tone={item.level === "danger" ? "danger" : "warning"} label={item.title} />
                  <span className="block text-xs text-[hsl(var(--muted-foreground))]">{item.detail}</span>
                </span>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold">{item.title}</span>
                    <span className="block text-xs text-[hsl(var(--muted-foreground))]">{item.detail}</span>
                  </span>
                  <span className="flex-none text-sm font-bold tabular-nums">{item.kind === "anomaly" ? null : item.amount !== undefined ? money(item.amount) : null}</span>
                </>
              )}
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
            <IconTile label={category?.name ?? "Lainnya"} color={category?.color} size="sm" />
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
    { label: `Keluar ${monthLabel}`, value: money(monthExpense), tone: "", note: null },
    { label: "Kekayaan bersih", value: money(netWorth.total), tone: "", note: netWorth.unpricedAssetCount > 0 ? `${netWorth.unpricedAssetCount} aset belum ada harga` : "kas + investasi − hutang" },
  ];

  if (!hasAccounts) {
    const steps = [
      { n: "1", title: "Tambah akun", desc: "Bank, e-wallet, atau tunai", status: "Mulai", to: "/accounts", on: true },
      { n: "2", title: "Atur anggaran bulanan", desc: "Bisa dilewati dulu", status: "Nanti", to: "/budgets", on: false },
      { n: "3", title: "Pasang PIN", desc: "Kunci saat aplikasi dibuka", status: "Nanti", to: "/settings", on: false },
    ];
    return (
      <div className="mx-auto w-full max-w-md space-y-6 px-6 pt-10 pb-4 lg:pt-16">
        <div aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><Wallet size={30} /></div>
        <div className="space-y-2">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">Mulai kelola keuanganmu</h1>
          <p className="text-[15px] leading-relaxed text-[hsl(var(--muted-foreground))]">Semua data tersimpan di perangkat ini. Kamu bisa backup ke Google Drive kapan saja.</p>
        </div>
        <ol className="divide-y divide-[hsl(var(--border))] rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          {steps.map((step) => (
            <li key={step.n}>
              <Link to={step.to} className="flex min-h-16 items-center gap-3.5 px-4 py-3">
                <span aria-hidden="true" className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-[13px] font-extrabold ${step.on ? "bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]"}`}>{step.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{step.title}</span>
                  <span className="block text-xs text-[hsl(var(--muted-foreground))]">{step.desc}</span>
                </span>
                <span className={`flex-none text-xs font-semibold ${step.on ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}>{step.status}</span>
              </Link>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2.5 pt-2">
          <Link to="/accounts" className="flex h-[54px] items-center justify-center rounded-2xl bg-[hsl(var(--primary))] text-base font-bold text-[hsl(var(--primary-foreground))]">Tambah akun pertama</Link>
          <Link to="/settings" className="flex h-12 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[15px] font-semibold">Pulihkan dari backup</Link>
        </div>
      </div>
    );
  }

  const attentionSection = attentionItems.length > 0;

  return (
    <div className="space-y-4 px-4 pt-5 pb-4 lg:space-y-5 lg:px-0 lg:pt-6 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[hsl(var(--primary))]">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-[hsl(var(--muted-foreground))]">{dateLabel}</p>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl lg:font-extrabold">Ringkasan kamu</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={toggleBalanceHidden} aria-label={balanceHidden ? "Tampilkan nominal dashboard" : "Sembunyikan nominal dashboard"} aria-pressed={balanceHidden} className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]">
            {balanceHidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <div ref={heroMenuRef} className="relative">
            <button
              type="button"
              aria-label="Menu dashboard"
              aria-haspopup="menu"
              aria-expanded={heroMenuOpen}
              onClick={() => setHeroMenuOpen((value) => !value)}
              className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--surface-2))]"
            >
              <MoreHorizontal size={18} />
            </button>
            {heroMenuOpen && (
              <div role="menu" aria-label="Menu dashboard" onKeyDown={onMenuKeyDown} className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-60 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 text-[hsl(var(--foreground))] shadow-lg">
                {menuActions.map(({ label, icon: Icon, onClick }) => (
                  <button key={label} type="button" role="menuitem" onClick={onClick} className={menuItemCls}><Icon size={16} aria-hidden="true" /> {label}</button>
                ))}
                <div role="separator" className="my-1 h-px bg-[hsl(var(--border))]" />
                <Link to="/accounts" role="menuitem" onClick={() => setHeroMenuOpen(false)} className={menuItemCls}><CreditCard size={16} aria-hidden="true" /> Akun</Link>
                <Link to="/settings" role="menuitem" onClick={() => setHeroMenuOpen(false)} className={menuItemCls}><Settings size={16} aria-hidden="true" /> Pengaturan</Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile: balance + cash flow */}
      <section aria-label="Total saldo" className="space-y-4 lg:hidden">
        <div>
          <p className="text-[13px] font-medium text-[hsl(var(--muted-foreground))]">Total saldo · <Link to="/accounts" className="inline-flex min-h-11 items-center text-[hsl(var(--primary))]">{activeAccounts.length} akun</Link></p>
          <p className="break-words text-[38px] font-extrabold leading-tight tracking-tight tabular-nums">{money(totalBalance)}</p>
          <p className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${balanceHidden ? "bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]" : monthNet >= 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
            {balanceHidden ? "•••" : `${monthNet >= 0 ? "+" : "-"}${formatCurrency(Math.abs(monthNet), currency)}`} bulan ini
          </p>
        </div>
        <div className={`${cardCls} space-y-3`}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold capitalize">{monthLabel}</h2>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">{daysLeft > 0 ? `${daysLeft} hari lagi` : "Hari terakhir"}</span>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Masuk</dt><dd className={`mt-0.5 break-words text-[17px] font-bold tabular-nums ${maskedTone("text-success")}`}>{money(monthIncome)}</dd></div>
            <div><dt className="text-xs text-[hsl(var(--muted-foreground))]">Keluar</dt><dd className="mt-0.5 break-words text-[17px] font-bold tabular-nums">{money(monthExpense)}</dd></div>
          </dl>
          {monthIncome > 0 && (
            <div className="space-y-1.5">
              <ProgressBar value={balanceHidden ? 0 : monthExpense} max={monthIncome} label="Pengeluaran dibanding pemasukan" />
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{balanceHidden ? "•••" : `${Math.round(monthExpense / monthIncome * 100)}% pemasukan sudah terpakai · tingkat tabungan ${savingsRate}%`}</p>
            </div>
          )}
          <Link to="/reports" className="inline-flex min-h-11 items-center text-xs font-semibold text-[hsl(var(--primary))]">Lihat laporan</Link>
        </div>
      </section>

      {/* Desktop: KPI row */}
      <section aria-label="Ringkasan keuangan" className="hidden gap-4 lg:grid lg:grid-cols-4">
        {kpis.map(({ label, value, tone, note }) => (
          <div key={label} className={cardCls}>
            <p className="text-[13px] text-[hsl(var(--muted-foreground))]">{label}</p>
            <p className={`mt-1 break-words text-2xl font-extrabold tracking-tight tabular-nums ${maskedTone(tone)}`}>{value}</p>
            {note && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{note}</p>}
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="contents lg:block lg:min-w-0 lg:space-y-4">
          {attentionSection && (
            <section aria-label="Perlu perhatian" className="space-y-2 lg:hidden">
              <h2 className="px-1 text-[15px] font-bold">Perlu perhatian</h2>
              <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">{attentionList}</div>
            </section>
          )}

          <section aria-label="Terbaru" className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="text-[15px] font-bold">Terbaru</h2>
              <div className="flex items-center gap-3">
                {transactions.length > 3 && (
                  <button aria-expanded={recentExpanded} onClick={() => setRecentExpanded((value) => !value)} className="min-h-11 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] lg:hidden">
                    {recentExpanded ? "Ringkas" : "Tampilkan lagi"}
                  </button>
                )}
                <Link to="/transactions" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[hsl(var(--primary))] hover:underline">Semua transaksi</Link>
              </div>
            </div>
            {recentTxs.length === 0 && <p className={`${cardCls} text-sm text-[hsl(var(--muted-foreground))]`}>Belum ada transaksi. Catat pemasukan atau pengeluaran pertamamu.</p>}
            {recentTxs.length > 0 && (
              <div className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] lg:hidden">
                {recentTxs.map((tx) => (
                  <TransactionCard
                    key={tx.id}
                    showDate
                    transaction={tx}
                    accountName={getAccountName(tx.accountId)}
                    toAccountName={tx.toAccountId ? getAccountName(tx.toAccountId) : undefined}
                    categoryLabel={splitTxIds.has(tx.id!) ? "Split" : (getCategoryName(tx.categoryId) ?? undefined)}
                    categoryColor={categories.find((c) => c.id === tx.categoryId)?.color}
                    currency={currency}
                    hidden={balanceHidden}
                    hasSplits={splitTxIds.has(tx.id!)}
                    onSelect={() => setSelectedId(tx.id!)}
                    onEdit={() => editRecent(tx)}
                    onDelete={() => deleteRecent(tx)}
                  />
                ))}
              </div>
            )}
            {desktopRecentTxs.length > 0 && (
              <div className="hidden overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-left text-xs text-[hsl(var(--muted-foreground))]">
                      <th scope="col" className="px-5 py-2.5 font-semibold">Keterangan</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Kategori</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Akun</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">Jumlah</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold"><span className="sr-only">Aksi</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--border))]">
                    {desktopRecentTxs.map((tx) => (
                      <tr key={tx.id} className="group hover:bg-[hsl(var(--surface-2))]">
                        <td className="px-5 py-2.5"><span className="font-semibold">{tx.note || getCategoryName(tx.categoryId) || "Transaksi"}</span><span className="block text-xs text-[hsl(var(--muted-foreground))]">{formatDate(tx.date, "dd MMM")}</span></td>
                        <td className="px-4 py-2.5 text-[hsl(var(--muted-foreground))]">{splitTxIds.has(tx.id!) ? "Split" : getCategoryName(tx.categoryId) ?? "—"}</td>
                        <td className="px-4 py-2.5 text-[hsl(var(--muted-foreground))]">{getAccountName(tx.accountId)}{tx.toAccountId ? ` → ${getAccountName(tx.toAccountId)}` : ""}</td>
                        <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${maskedTone(tx.type === "income" ? "text-success" : tx.type === "transfer" ? "text-[hsl(var(--muted-foreground))]" : "")}`}>{balanceHidden ? "" : tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}{money(tx.amount)}</td>
                        <td className="px-2 py-1 text-right">
                          <div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <button type="button" aria-label={`Edit ${tx.note || getCategoryName(tx.categoryId) || "transaksi"}`} onClick={() => editRecent(tx)} className="flex h-11 w-11 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]"><Pencil size={16} /></button>
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
        </div>

        <div className="hidden lg:block lg:min-w-0 lg:space-y-4">
          {attentionSection && (
            <section aria-label="Perlu perhatian" className={`${cardCls} space-y-1`}>
              <h2 className="text-[15px] font-bold">Perlu perhatian</h2>
              {attentionList}
            </section>
          )}

          <section aria-label="Pengeluaran per kategori" className={`${cardCls} space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold capitalize">Pengeluaran {monthLabel}</h2>
              <Link to="/reports" className="inline-flex min-h-11 items-center text-xs font-semibold text-[hsl(var(--primary))]">Semua kategori</Link>
            </div>
            {categoryBars}
          </section>
        </div>
      </div>

      <Sheet open={selectedTx !== null} onClose={() => setSelectedId(null)} title="Detail transaksi">
        {selectedTx && (
          <TransactionDetail
            transaction={selectedTx}
            accountName={getAccountName(selectedTx.accountId)}
            toAccountName={selectedTx.toAccountId ? getAccountName(selectedTx.toAccountId) : undefined}
            category={categories.find((c) => c.id === selectedTx.categoryId) ?? null}
            splits={splitMap[selectedTx.id!] ?? []}
            categories={categories}
            currency={currency}
            hidden={balanceHidden}
            onEdit={() => { setSelectedId(null); editRecent(selectedTx); }}
            onDelete={() => { setSelectedId(null); deleteRecent(selectedTx); }}
          />
        )}
      </Sheet>

      <TransactionForm
        open={addOpen || shortcutType !== null}
        onClose={closeTransactionForm}
        onSaved={() => void refreshAll().then(loadDashboardData)}
        accounts={activeAccounts}
        categories={categories}
        defaultType={shortcutType ?? defaultType}
        hideBalances={balanceHidden}
        onUseAI={() => { closeTransactionForm(); setAiOpen(true); }}
      />

      <TransactionForm
        key={editTx?.id ?? "edit-none"}
        open={editTx !== null}
        onClose={() => setEditTx(null)}
        onSaved={() => { void refreshAll().then(loadDashboardData); setEditTx(null); }}
        accounts={activeAccounts}
        categories={categories}
        existing={editTx ?? undefined}
        hideBalances={balanceHidden}
      />

      <AITransactionForm
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onSaved={() => { void refreshAll().then(loadDashboardData); setAiOpen(false); }}
        accounts={activeAccounts}
        categories={categories}
      />

      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Hapus transaksi ini?"
        description={(() => {
          const target = transactions.find((t) => t.id === deleteTargetId);
          return target ? describeTransactionDelete(target, { accounts, categories, currency, hidden: balanceHidden }) : "Transaksi ini akan dihapus.";
        })()}
        confirmLabel="Hapus"
        onConfirm={() => deleteTargetId !== null && handleDelete(deleteTargetId)}
        onClose={() => setDeleteTargetId(null)}
      />
    </div>
  );
}
