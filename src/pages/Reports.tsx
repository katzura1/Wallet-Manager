import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Card, CardHeader, CardTitle, CardContent, Badge, IconTile, PageHeader, ProgressBar, SegmentedControl } from "@/components/ui";
import { getTransactions, getMonthlyChartData, getCategoryExpenseData, getMonthlySummary, getTotalBalanceHistory, getSummaryBetween, getCategoryExpenseBetween, getYearToDateSummary, getYearOverYearComparison, getCategoryIncomeData, getCategoryTrends, type YearToDateSummary, type YearOverYearComparison, type CategoryIncomeEntry, type CategoryTrend } from "@/db/transactions";
import { getBudgetsForMonth, getBudgetsForCategoriesWithInheritance, predictBudgetStatus } from "@/db/budgets";
import { BudgetForm } from "@/components/forms/BudgetForm";
import { formatCurrency, todayISO } from "@/lib/utils";
import { generateMonthlyInsight, type MonthlyInsightResult } from "@/lib/monthlyInsight";
import { LedgerContent, ReportTabs } from "@/pages/Ledger";
import { ChevronLeft, ChevronRight, Target, ChevronDown, ChevronUp } from "lucide-react";
import type { Budget } from "@/types";

interface ChartBar {
  month: string;
  income: number;
  expense: number;
}
interface PieEntry {
  name: string;
  value: number;
  color: string;
  icon: string;
}

/** Merge entries with the same name (e.g. multiple orphan "Lainnya") to prevent duplicate React keys */
function mergePieEntries(entries: PieEntry[]): PieEntry[] {
  const map = new Map<string, PieEntry>();
  for (const e of entries) {
    const existing = map.get(e.name);
    if (existing) {
      existing.value += e.value;
    } else {
      map.set(e.name, { ...e });
    }
  }
  return Array.from(map.values());
}

export default function Reports() {
  const { accounts, categories, refreshAll } = useWalletStore();
  const { currency } = useSettingsStore();
  const [searchParams] = useSearchParams();
  const { hash } = useLocation();
  const [chartData, setChartData] = useState<ChartBar[]>([]);
  const [pieData, setPieData] = useState<PieEntry[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const scrolledHash = useRef<string | null>(null);
  const [prevCategoryMap, setPrevCategoryMap] = useState<Record<number, number>>({});
  const [summary, setSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [previousSummary, setPreviousSummary] = useState<{ income: number; expense: number; net: number } | null>(null);
  const [balanceHistory, setBalanceHistory] = useState<{ month: string; balance: number }[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [inheritedBudgetIds, setInheritedBudgetIds] = useState<Set<number>>(new Set());
  const [budgetFormOpen, setBudgetFormOpen] = useState(false);
  const [budgetCategoryId, setBudgetCategoryId] = useState<number | undefined>();
  const [budgetInitialAmount, setBudgetInitialAmount] = useState<number>(0);
  const [budgetFormRecurring, setBudgetFormRecurring] = useState<boolean>(true);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllBudgets, setShowAllBudgets] = useState(false);
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const insightRequestId = useRef(0);
  const [monthlyInsight, setMonthlyInsight] = useState<MonthlyInsightResult | null>(null);
  const [monthlyInsightLoading, setMonthlyInsightLoading] = useState(false);
  const [ytdSummary, setYtdSummary] = useState<YearToDateSummary | null>(null);
  const [yoyComparison, setYoyComparison] = useState<YearOverYearComparison | null>(null);
  const [incomeCategories, setIncomeCategories] = useState<CategoryIncomeEntry[]>([]);
  const [categoryTrends, setCategoryTrends] = useState<CategoryTrend[]>([]);
  const [showTrends, setShowTrends] = useState(false);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  // Range mode
  const [mode, setMode] = useState<"monthly" | "range">("monthly");
  const todayStr = now.toISOString().split("T")[0];
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayStr);
  const isLedgerTab = searchParams.get("tab") === "ledger";

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const loadChartData = useCallback(async () => {
    const requestId = ++insightRequestId.current;
    const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

    let catMap: Record<number, number>;
    let sum: { income: number; expense: number; net: number };

    if (mode === "range" && dateFrom && dateTo) {
      [catMap, sum] = await Promise.all([
        getCategoryExpenseBetween(dateFrom, dateTo),
        getSummaryBetween(dateFrom, dateTo),
      ]);
      // Bar chart & balance history don't apply in range mode — keep stale
      setSummary(sum);
      setPreviousSummary(null);
      setPrevCategoryMap({});
      setMonthlyInsight(null);
      setMonthlyInsightLoading(false);
      const pie: PieEntry[] = mergePieEntries(
        Object.entries(catMap).map(([catId, amount]) => {
          const cat = categories.find((c) => c.id === Number(catId));
          return { name: cat?.name ?? "Lainnya", value: amount, color: cat?.color ?? "#6b7280", icon: cat?.icon ?? "📦" };
        })
      ).sort((a, b) => b.value - a.value);
      setPieData(pie);
      return;
    }

    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

    // Get category IDs for budget enrichment
    const expenseCategoryIds = categories
      .filter((c) => c.type === "expense" || c.type === "both")
      .map((c) => c.id)
      .filter((id): id is number => id !== undefined);

    const [bars, catMapM, prevCatMap, sumM, prevSumM, history, bdgtList, explicitBdgts, yearSummary, yearComparison, incomeData, trends] = await Promise.all([
      getMonthlyChartData(6),
      getCategoryExpenseData(selectedYear, selectedMonth),
      getCategoryExpenseData(prevYear, prevMonth),
      getMonthlySummary(selectedYear, selectedMonth),
      getMonthlySummary(prevYear, prevMonth),
      getTotalBalanceHistory(6),
      getBudgetsForCategoriesWithInheritance(monthStr, expenseCategoryIds),
      getBudgetsForMonth(monthStr),
      // New YTD and analysis data
      getYearToDateSummary(selectedYear, selectedMonth),
      getYearOverYearComparison(selectedYear, selectedMonth),
      getCategoryIncomeData(selectedYear, selectedMonth),
      getCategoryTrends(selectedYear, selectedMonth, 3),
    ]);
    
    // Track which budgets are inherited (not explicitly set for this month)
    const explicitCategoryIds = new Set(explicitBdgts.map((b) => b.categoryId));
    const inheritedIds = new Set<number>();
    for (const budget of bdgtList) {
      if (!explicitCategoryIds.has(budget.categoryId)) {
        inheritedIds.add(budget.id ?? 0);
      }
    }
    setInheritedBudgetIds(inheritedIds);

    setChartData(bars);
    setPrevCategoryMap(prevCatMap);
    setSummary(sumM);
    setPreviousSummary(prevSumM);
    setBalanceHistory(history);
    setBudgets(bdgtList);
    // Set new state values
    setYtdSummary(yearSummary);
    setYoyComparison(yearComparison);
    setIncomeCategories(incomeData);
    setCategoryTrends(trends);
    const pie: PieEntry[] = mergePieEntries(
      Object.entries(catMapM).map(([catId, amount]) => {
        const cat = categories.find((c) => c.id === Number(catId));
        return {
          name: cat?.name ?? "Lainnya",
          value: amount,
          color: cat?.color ?? "#6b7280",
          icon: cat?.icon ?? "📦",
        };
      })
    ).sort((a, b) => b.value - a.value);
    setPieData(pie);
    setDataLoaded(true);

    setMonthlyInsightLoading(true);
    try {
      const asOf = todayISO();
      const currentMonth = asOf.slice(0, 7);
      const periodStatus = monthStr === currentMonth ? "ongoing" : monthStr < currentMonth ? "completed" : "future";
      const prevPrefix = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
      const [previousTransactions, insightSummary, insightCategoryMap] = await Promise.all([
        getTransactions({ dateFrom: `${prevPrefix}-01`, dateTo: `${prevPrefix}-${new Date(prevYear, prevMonth, 0).getDate()}` }),
        periodStatus === "ongoing" ? getSummaryBetween(`${monthStr}-01`, asOf) : Promise.resolve(sumM),
        periodStatus === "ongoing" ? getCategoryExpenseBetween(`${monthStr}-01`, asOf) : Promise.resolve(catMapM),
      ]);
      if (requestId !== insightRequestId.current) return;
      const hasPreviousActivity = previousTransactions.some((tx) => !tx.debtId && !tx.isAdjustment && tx.type !== "transfer");
      const budgetRows = categories
        .filter((category) => category.type === "expense" || category.type === "both")
        .map((category) => {
          const actual = category.id !== undefined ? insightCategoryMap[category.id] ?? 0 : 0;
          const budget = bdgtList.find((item) => item.categoryId === category.id);
          return {
            category,
            actual,
            budget,
            pct: budget?.amount ? Math.round((actual / budget.amount) * 100) : 0,
          };
        })
        .filter((row) => row.budget || row.actual > 0);

      const insight = await generateMonthlyInsight({
        monthLabel: new Date(selectedYear, selectedMonth - 1, 1).toLocaleString("id-ID", { month: "long", year: "numeric" }),
        currency,
        period: { status: periodStatus, asOf },
        summary: insightSummary,
        previousSummary: hasPreviousActivity ? prevSumM : null,
        topCategories: Object.entries(insightCategoryMap).map(([id, value]) => {
          const category = categories.find((item) => item.id === Number(id));
          return { name: category?.name ?? "Lainnya", value, icon: category?.icon ?? "📦" };
        }).sort((a, b) => b.value - a.value).slice(0, 3),
        budget: {
          overBudgetCount: budgetRows.filter((row) => row.budget && row.actual > row.budget.amount).length,
          nearLimitCount: budgetRows.filter((row) => row.budget && row.actual <= row.budget.amount && row.pct >= 80).length,
          trackedCategoryCount: budgetRows.filter((row) => !!row.budget).length,
          unusedBudgetCount: budgetRows.filter((row) => row.budget && row.actual === 0).length,
          categories: budgetRows.flatMap((row) => row.budget ? [{
            categoryId: row.budget.categoryId,
            name: row.category.name,
            limit: row.budget.amount,
            actual: row.actual,
            remaining: row.budget.amount - row.actual,
            usagePercent: row.pct,
          }] : []).sort((a, b) => b.usagePercent - a.usagePercent),
        },
      });
      if (requestId === insightRequestId.current) setMonthlyInsight(insight);
    } finally {
      if (requestId === insightRequestId.current) setMonthlyInsightLoading(false);
    }
  }, [selectedYear, selectedMonth, categories, mode, dateFrom, dateTo, currency]);

  useEffect(() => {
    void loadChartData();
  }, [loadChartData]);

  function openBudgetForm(catId: number) {
    const existing = budgets.find((b) => b.categoryId === catId);
    setBudgetCategoryId(catId);
    setBudgetInitialAmount(existing?.amount ?? 0);
    setBudgetFormOpen(true);
    // Store recurring flag for BudgetForm via a temporary state
    setBudgetFormRecurring(existing?.recurring ?? true);
  }

  const currentMonth = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

  const prevMonthDate = new Date(selectedYear, selectedMonth - 2, 1);
  const prevMonthName = prevMonthDate.toLocaleString("id-ID", { month: "long" });

  function getComparisonMeta(current: number, previous: number, goodWhen: "up" | "down") {
    if (previous === 0) {
      return {
        label: current === 0 ? `Sama seperti ${prevMonthName}` : "Belum ada data pembanding",
        className: "text-[hsl(var(--muted-foreground))]",
      };
    }

    const diff = current - previous;
    const pct = Math.round((Math.abs(diff) / Math.abs(previous)) * 100);
    if (diff === 0) {
      return { label: `Tidak berubah dari ${prevMonthName}`, className: "text-[hsl(var(--muted-foreground))]" };
    }

    const improved = goodWhen === "up" ? diff > 0 : diff < 0;
    return {
      label: `${diff > 0 ? "+" : "-"}${pct}% vs ${prevMonthName}`,
      className: improved ? "text-success" : "text-danger",
    };
  }

  const incomeComparison = previousSummary ? getComparisonMeta(summary.income, previousSummary.income, "up") : null;
  const expenseComparison = previousSummary ? getComparisonMeta(summary.expense, previousSummary.expense, "down") : null;
  const netComparison = previousSummary ? getComparisonMeta(summary.net, previousSummary.net, "up") : null;
  const totalPieValue = pieData.reduce((sum, entry) => sum + entry.value, 0);
  const visiblePieData = showAllCategories ? pieData : pieData.slice(0, 5);
  const visibleAccounts = showAllAccounts
    ? accounts.filter((a) => !a.isArchived)
    : accounts.filter((a) => !a.isArchived).slice(0, 5);
  const budgetRows = (mode === "monthly"
    ? categories
        .filter((category) => category.type === "expense" || category.type === "both")
        .map((category) => {
          const actual = pieData.find((entry) => entry.name === category.name)?.value ?? 0;
          const budget = budgets.find((item) => item.categoryId === category.id);
          const isInherited = budget ? inheritedBudgetIds.has(budget.id ?? 0) : false;
          const pct = budget?.amount ? Math.round((actual / budget.amount) * 100) : 0;
          // Calculate prediction if budget exists
          const prediction = budget && budget.amount > 0
            ? predictBudgetStatus({
                budgetAmount: budget.amount,
                spent: actual,
                dayOfMonth: selectedMonth === new Date().getMonth() + 1 && selectedYear === new Date().getFullYear() ? new Date().getDate() : new Date(selectedYear, selectedMonth, 0).getDate(),
                daysInMonth: new Date(selectedYear, selectedMonth, 0).getDate(),
              })
            : null;
          return {
            category,
            actual,
            budget,
            isInherited,
            pct,
            prediction,
          };
        })
        .filter((row) => row.budget || row.actual > 0)
        .sort((a, b) => {
          const aScore = a.budget?.amount ? a.actual / a.budget.amount : a.actual;
          const bScore = b.budget?.amount ? b.actual / b.budget.amount : b.actual;
          return bScore - aScore;
        })
    : []);
  const activeBudgetRows = budgetRows.filter((row) => row.actual > 0 || !row.budget);
  const unusedBudgetRows = budgetRows.filter((row) => row.budget && row.actual === 0);
  const visibleBudgetRows = showAllBudgets ? activeBudgetRows : activeBudgetRows.slice(0, 5);
  const visibleUnusedBudgetRows = showAllBudgets ? unusedBudgetRows : unusedBudgetRows.slice(0, 4);

  const budgetTotals = budgetRows.reduce(
    (acc, row) => (row.budget ? { spent: acc.spent + row.actual, limit: acc.limit + row.budget.amount } : acc),
    { spent: 0, limit: 0 },
  );
  const hasBudgetSection = mode === "monthly" && budgetRows.length > 0;

  // Scroll to #anggaran once, after data has loaded and the section has rendered.
  useEffect(() => {
    if (hash !== "#anggaran") { scrolledHash.current = null; return; }
    if (!dataLoaded || !hasBudgetSection || isLedgerTab || scrolledHash.current === hash) return;
    scrolledHash.current = hash;
    document.getElementById("anggaran")?.scrollIntoView({ block: "start" });
  }, [hash, dataLoaded, hasBudgetSection, isLedgerTab]);

  function prevMonth() {
    if (selectedMonth === 1) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(12);
    } else setSelectedMonth((m) => m - 1);
  }
  function nextMonth() {
    if (selectedMonth === 12) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(1);
    } else setSelectedMonth((m) => m + 1);
  }

  const monthLabel = new Date(selectedYear, selectedMonth - 1, 1).toLocaleString("id-ID", { month: "long", year: "numeric" });

  if (isLedgerTab) {
    return <LedgerContent />;
  }

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "12px",
    fontSize: "12px",
  };
  const prevByName = new Map<string, number>();
  for (const [catId, amount] of Object.entries(prevCategoryMap)) {
    const name = categories.find((c) => c.id === Number(catId))?.name ?? "Lainnya";
    prevByName.set(name, (prevByName.get(name) ?? 0) + amount);
  }
  const savingsRate = ytdSummary?.savingsRate ?? 0;
  const savingsTone = savingsRate >= 20 ? "text-success" : savingsRate >= 10 ? "text-warning" : "text-danger";
  const ringCircumference = 2 * Math.PI * 28;
  const ringFill = (Math.min(100, Math.max(0, savingsRate)) / 100) * ringCircumference;
  const sectionCard = "min-w-0 rounded-[20px]";
  const linkButton = "inline-flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-[hsl(var(--primary))]";

  const summaryCards = [
    { label: "Masuk", value: summary.income, comparison: incomeComparison, tone: "text-success", annualChange: yoyComparison?.incomeChange, expense: false },
    { label: "Keluar", value: summary.expense, comparison: expenseComparison, tone: "text-danger", annualChange: yoyComparison?.expenseChange, expense: true },
    { label: "Bersih", value: summary.net, comparison: netComparison, tone: summary.net >= 0 ? "text-success" : "text-danger", annualChange: yoyComparison?.netChange, expense: false },
  ];

  return (
    <div className="space-y-4 px-4 pt-5 pb-4 lg:px-0 lg:pt-7">
      <PageHeader title="Laporan" />
      <p className="hidden text-sm font-medium capitalize print:block">{mode === "monthly" ? monthLabel : `${dateFrom} - ${dateTo}`}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ReportTabs value="overview" />
        <div className="flex flex-col gap-3 no-print sm:flex-row sm:items-center">
          <div className="sm:w-56">
            <SegmentedControl
              label="Mode periode"
              value={mode}
              options={[{ value: "monthly", label: "Bulanan" }, { value: "range", label: "Rentang" }]}
              onChange={setMode}
            />
          </div>
          {mode === "monthly" ? (
            <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-1 sm:w-64">
              <button type="button" aria-label="Bulan sebelumnya" onClick={prevMonth} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[hsl(var(--surface-2))]"><ChevronLeft size={18} /></button>
              <p className="text-sm font-semibold capitalize">{monthLabel}</p>
              <button type="button" aria-label="Bulan berikutnya" onClick={nextMonth} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[hsl(var(--surface-2))]"><ChevronRight size={18} /></button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 sm:w-80">
              <label className="min-w-0 text-[11px] text-[hsl(var(--muted-foreground))]">Dari
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 min-h-11 w-full min-w-0 max-w-full rounded bg-transparent text-sm text-[hsl(var(--foreground))] outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]" />
              </label>
              <label className="min-w-0 text-[11px] text-[hsl(var(--muted-foreground))]">Sampai
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 min-h-11 w-full min-w-0 max-w-full rounded bg-transparent text-sm text-[hsl(var(--foreground))] outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]" />
              </label>
            </div>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map(({ label, value, comparison, tone, annualChange, expense }, index) => (
          <Card key={label} className={`${sectionCard} p-4 ${index === 2 ? "col-span-2 lg:col-span-1" : ""}`}>
            <dt className="text-xs text-[hsl(var(--muted-foreground))]">{label}</dt>
            <dd className={`mt-1 break-words text-lg font-semibold tabular-nums lg:text-xl ${tone}`}>{formatCurrency(value, currency)}</dd>
            {mode === "monthly" && comparison && <dd className={`mt-1 text-[11px] ${comparison.className}`}>{comparison.label}</dd>}
            {mode === "monthly" && yoyComparison?.hasPreviousYearData && annualChange !== undefined && (
              <dd className={`mt-1 text-[11px] ${(expense ? annualChange <= 0 : annualChange >= 0) ? "text-success" : "text-danger"}`}>
                {annualChange > 0 ? "+" : ""}{annualChange}% vs {new Date(yoyComparison.previousYear, yoyComparison.currentMonth - 1, 1).toLocaleString("id-ID", { month: "long", year: "numeric" })}
              </dd>
            )}
          </Card>
        ))}
        {mode === "monthly" && ytdSummary && ytdSummary.totalIncome > 0 && (
          <Card className={`${sectionCard} col-span-2 flex items-center gap-4 p-4 lg:col-span-1`}>
            <svg width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={`Tingkat tabungan ${savingsRate}%`} className="shrink-0 -rotate-90">
              <circle cx="34" cy="34" r="28" fill="none" strokeWidth="7" className="stroke-[hsl(var(--surface-3))]" />
              <circle cx="34" cy="34" r="28" fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${ringFill} ${ringCircumference}`} className={`${savingsRate >= 20 ? "stroke-success" : savingsRate >= 10 ? "stroke-warning" : "stroke-danger"}`} />
            </svg>
            <div className="min-w-0">
              <dt className="text-xs text-[hsl(var(--muted-foreground))]">Tingkat tabungan</dt>
              <dd className={`text-lg font-semibold tabular-nums lg:text-xl ${savingsTone}`}>{savingsRate}%</dd>
              <dd className="text-[11px] text-[hsl(var(--muted-foreground))]">YTD {selectedYear} · {ytdSummary.monthsIncluded} bulan</dd>
            </div>
          </Card>
        )}
      </dl>

      {mode === "monthly" && ytdSummary && ytdSummary.totalIncome > 0 && (
        <section aria-label="Ringkasan tahunan">
          <Card className={`${sectionCard} p-4`}>
            <h2 className="text-sm font-semibold">YTD {selectedYear} <span className="font-normal text-[hsl(var(--muted-foreground))]">· {ytdSummary.monthsIncluded} bulan berjalan</span></h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { label: "Total Masuk", value: ytdSummary.totalIncome, tone: "text-success" },
                { label: "Total Keluar", value: ytdSummary.totalExpense, tone: "text-danger" },
                { label: "Tersisa", value: ytdSummary.netSavings, tone: ytdSummary.netSavings >= 0 ? "text-success" : "text-danger" },
              ].map(({ label, value, tone }, index) => (
                <div key={label} className={`min-w-0 ${index === 2 ? "col-span-2 sm:col-span-1" : ""}`}>
                  <dt className="text-[11px] text-[hsl(var(--muted-foreground))]">{label}</dt>
                  <dd className={`mt-1 break-words text-sm font-semibold tabular-nums ${tone}`}>{formatCurrency(value, currency)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {/* Cash Flow Bar Chart — monthly only */}
        {mode === "monthly" && <Card className={sectionCard}>
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle>Arus Kas 6 Bulan</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(val) => formatCurrency(Number(val), currency)} contentStyle={tooltipStyle} />
                  <Bar dataKey="income" name="Pemasukan" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Pengeluaran" fill="hsl(var(--danger))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Belum ada data</p>
            )}
          </CardContent>
        </Card>}

        {/* Balance History — monthly only */}
        {mode === "monthly" && balanceHistory.length > 0 && balanceHistory.some((d) => d.balance !== 0) && (
          <Card className={sectionCard}>
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle>Riwayat Total Saldo</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={balanceHistory}>
                  <defs>
                    <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(val) => formatCurrency(Number(val), currency)} contentStyle={tooltipStyle} />
                  <Area dataKey="balance" name="Total Saldo" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#balGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Category breakdown */}
        {(pieData.length > 0 || (mode === "monthly" && incomeCategories.length > 0)) && (
          <Card className={`${sectionCard} lg:col-span-2`}>
            <CardHeader className="px-4 pt-4 pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Kategori</CardTitle>
                {(pieData.length > 5 || (mode === "monthly" && incomeCategories.length > 5)) && (
                  <button type="button" onClick={() => setShowAllCategories((value) => !value)} aria-expanded={showAllCategories} className={linkButton}>
                    {showAllCategories ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{showAllCategories ? "Ringkas" : "Semua kategori"}
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className={`grid gap-4 p-4 pt-1 ${mode === "monthly" ? "lg:grid-cols-2" : ""}`}>
              <section aria-label="Kategori Pengeluaran" className="min-w-0">
                <h3 className="mb-2 text-sm font-semibold">Kategori Pengeluaran</h3>
                <p className="mb-2 text-[11px] text-[hsl(var(--muted-foreground))]">Pengeluaran dan pemasukan bersih per kategori</p>
                {pieData.length > 0 ? (
                  <div className="sm:grid sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:items-center sm:gap-3">
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3} stroke="hsl(var(--card))">
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val) => formatCurrency(Number(val), currency)} contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>

                    <div className="mt-2 space-y-3 lg:mt-0">
                      {visiblePieData.map((entry) => {
                        const pct = totalPieValue ? Math.round((entry.value / totalPieValue) * 100) : 0;
                        const prev = prevByName.get(entry.name) ?? 0;
                        const delta = mode === "monthly" && prev > 0 ? Math.round(((entry.value - prev) / prev) * 100) : null;
                        return (
                          <div key={entry.name} className="flex items-center gap-2.5">
                            <IconTile label={entry.name} color={entry.color} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-xs">
                                <span className="truncate">{entry.name}</span>
                                <span className="max-w-full break-words font-medium tabular-nums">{formatCurrency(entry.value, currency)}</span>
                              </div>
                              <ProgressBar value={entry.value} max={totalPieValue} label={`${entry.name} ${pct}% dari pengeluaran`} />
                            </div>
                            <span className="w-14 text-right text-[11px] tabular-nums text-[hsl(var(--muted-foreground))]">
                              {pct}%
                              {delta !== null && delta !== 0 && (
                                <span className={`block ${delta > 0 ? "text-danger" : "text-success"}`}>{delta > 0 ? "+" : ""}{delta}%</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                      {!showAllCategories && pieData.length > visiblePieData.length && (
                        <p className="pt-1 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
                          {pieData.length - visiblePieData.length} kategori lain disembunyikan
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Belum ada data pengeluaran</p>
                )}
              </section>
              {mode === "monthly" && <section aria-label="Sumber Pemasukan" className="min-w-0 lg:border-l lg:border-[hsl(var(--border))] lg:pl-4">
                <h3 className="mb-2 text-sm font-semibold">Sumber Pemasukan</h3>
                {incomeCategories.length > 0 ? (
                  <div className="space-y-3">
                    {incomeCategories.slice(0, showAllCategories ? undefined : 5).map((entry) => {
                      const category = categories.find((c) => c.id === entry.categoryId);
                      const totalIncome = incomeCategories.reduce((s, c) => s + c.amount, 0);
                      const pct = totalIncome > 0 ? Math.round((entry.amount / totalIncome) * 100) : 0;
                      return (
                        <div key={entry.categoryId} className="flex items-center gap-2.5">
                          <IconTile label={category?.name ?? "Lainnya"} color={category?.color} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-xs">
                              <span className="truncate">{category?.name ?? "Lainnya"}</span>
                              <span className="max-w-full break-words font-medium tabular-nums text-success">{formatCurrency(entry.amount, currency)}</span>
                            </div>
                            <ProgressBar value={entry.amount} max={totalIncome} tone="success" label={`${category?.name ?? "Lainnya"} ${pct}% dari pemasukan`} />
                          </div>
                          <span className="w-9 text-right text-[11px] tabular-nums text-[hsl(var(--muted-foreground))]">{pct}%</span>
                        </div>
                      );
                    })}
                    {!showAllCategories && incomeCategories.length > 5 && (
                      <p className="pt-1 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
                        {incomeCategories.length - 5} kategori lain disembunyikan
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Belum ada data pemasukan</p>
                )}
              </section>}
            </CardContent>
          </Card>
        )}

        {/* Budget vs Actuals — monthly only */}
        {hasBudgetSection && (
          <section id="anggaran" aria-label="Anggaran" className="min-w-0 scroll-mt-4 lg:col-span-2">
            <Card className={sectionCard}>
              <CardHeader className="px-4 pt-4 pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle>Anggaran Bulan Ini</CardTitle>
                    <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Pemakaian dihitung dari pengeluaran bersih per kategori</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(activeBudgetRows.length > 5 || unusedBudgetRows.length > 4) && (
                      <button type="button" onClick={() => setShowAllBudgets((value) => !value)} className={linkButton}>
                        {showAllBudgets ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {showAllBudgets ? "Ringkas" : "Semua anggaran"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setBudgetCategoryId(undefined); setBudgetInitialAmount(0); setBudgetFormRecurring(true); setBudgetFormOpen(true); }}
                      className={linkButton}
                    >
                      <Target size={13} /> + Atur
                    </button>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-[hsl(var(--border))] pt-3">
                  <div className="min-w-0">
                    <dt className="text-[11px] text-[hsl(var(--muted-foreground))]">Terpakai</dt>
                    <dd className="mt-0.5 break-words text-sm font-semibold tabular-nums">{formatCurrency(budgetTotals.spent, currency)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] text-[hsl(var(--muted-foreground))]">Batas</dt>
                    <dd className="mt-0.5 break-words text-sm font-semibold tabular-nums">{formatCurrency(budgetTotals.limit, currency)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] text-[hsl(var(--muted-foreground))]">Sisa</dt>
                    <dd className={`mt-0.5 break-words text-sm font-semibold tabular-nums ${budgetTotals.limit - budgetTotals.spent < 0 ? "text-danger" : "text-success"}`}>{formatCurrency(budgetTotals.limit - budgetTotals.spent, currency)}</dd>
                  </div>
                </dl>
              </CardHeader>
              <CardContent className="space-y-1 p-4 pt-1 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:space-y-0">
                {visibleBudgetRows.map(({ category, actual, budget, isInherited, pct, prediction }) => {
                  const over = !!budget && actual > budget.amount;
                  const tone = pct >= 100 ? "danger" : pct >= 80 ? "warning" : "primary";
                  return (
                    <div key={category.id} className="flex items-center gap-3 py-2">
                      <IconTile label={category.name} color={category.color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-xs">
                          <span className="truncate">{category.name}</span>
                          <span className="max-w-full break-words font-medium tabular-nums">
                            {formatCurrency(actual, currency)}
                            {budget && <span className={`ml-1 ${over ? "text-danger" : "text-[hsl(var(--muted-foreground))]"}`}>/ {formatCurrency(budget.amount, currency)}</span>}
                          </span>
                        </div>
                        {budget && (
                          <div className="flex items-center gap-2">
                            <div className="flex-1"><ProgressBar value={actual} max={budget.amount} tone={tone} label={`Anggaran ${category.name}`} /></div>
                            {isInherited && (
                              <Badge className="h-fit shrink-0 bg-[hsl(var(--surface-2))] px-2 py-0.5 text-[9px] text-[hsl(var(--muted-foreground))]">Inherited</Badge>
                            )}
                            {prediction && !over && prediction.predictedExhaustInDays !== null && prediction.predictedExhaustInDays <= 15 && (
                              <span className="shrink-0 text-[9px] text-warning">
                                ~{prediction.predictedExhaustInDays === 0 ? "habis" : `${prediction.predictedExhaustInDays}d`}
                              </span>
                            )}
                          </div>
                        )}
                        {over && prediction && prediction.projectedOverrun > 0 && (
                          <p className="mt-0.5 text-[10px] text-danger">
                            Proyeksi over {formatCurrency(prediction.projectedOverrun, currency)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openBudgetForm(category.id!)}
                        aria-label={`Atur anggaran ${category.name}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--primary))]"
                      >
                        <Target size={14} />
                      </button>
                    </div>
                  );
                })}
                {!showAllBudgets && activeBudgetRows.length > visibleBudgetRows.length && (
                  <p className="pt-1 text-center text-[11px] text-[hsl(var(--muted-foreground))] lg:col-span-2">
                    {activeBudgetRows.length - visibleBudgetRows.length} kategori budget aktif lain disembunyikan
                  </p>
                )}

                {unusedBudgetRows.length > 0 && (
                  <div className="mt-2 border-t border-[hsl(var(--border))] pt-2 lg:col-span-2">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Belum terpakai bulan ini</p>
                      <span className="text-[11px] text-[hsl(var(--muted-foreground))]">{unusedBudgetRows.length} kategori</span>
                    </div>
                    <div className="lg:grid lg:grid-cols-2 lg:gap-x-6">
                      {visibleUnusedBudgetRows.map(({ category, budget, isInherited }) => (
                        <div key={category.id} className="flex items-center gap-3 py-2">
                          <IconTile label={category.name} color={category.color} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-xs">
                              <span className="truncate">{category.name}</span>
                              <span className="max-w-full break-words font-medium tabular-nums">0 / {formatCurrency(budget!.amount, currency)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1"><ProgressBar value={0} max={budget!.amount} label={`Anggaran ${category.name}`} /></div>
                              {isInherited && (
                                <Badge className="h-fit shrink-0 bg-[hsl(var(--surface-2))] px-2 py-0.5 text-[9px] text-[hsl(var(--muted-foreground))]">Inherited</Badge>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => openBudgetForm(category.id!)}
                            aria-label={`Atur anggaran ${category.name}`}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--primary))]"
                          >
                            <Target size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    {!showAllBudgets && unusedBudgetRows.length > visibleUnusedBudgetRows.length && (
                      <p className="pt-1 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
                        {unusedBudgetRows.length - visibleUnusedBudgetRows.length} budget belum terpakai disembunyikan
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {mode === "monthly" && (monthlyInsightLoading || monthlyInsight) && (
          <Card className={sectionCard}>
            <CardHeader className="px-4 pt-4 pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>Insight {new Date(selectedYear, selectedMonth - 1, 1).toLocaleString("id-ID", { month: "long", year: "numeric" })}</CardTitle>
                  <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Ringkasan dari transaksi yang tercatat pada periode terpilih</p>
                </div>
                {monthlyInsight && (
                  <Badge className={monthlyInsight.source === "ai" ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]" : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"}>
                    {monthlyInsight.source === "ai" ? "AI" : "Lokal"}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              {monthlyInsightLoading ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-4 w-2/3 rounded bg-[hsl(var(--muted))]" />
                  <div className="h-3 w-full rounded bg-[hsl(var(--muted))]" />
                  <div className="h-3 w-5/6 rounded bg-[hsl(var(--muted))]" />
                </div>
              ) : monthlyInsight ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold">{monthlyInsight.headline}</p>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{monthlyInsight.summary}</p>
                  </div>
                  <div className="space-y-2">
                    {monthlyInsight.highlights.map((item) => (
                      <div key={item} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[hsl(var(--primary))]" />
                        <span className="text-[hsl(var(--foreground))]">{item}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{monthlyInsight.note}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Category Trends */}
        {mode === "monthly" && categoryTrends.filter((t) => t.isSignificant).length > 0 && (
          <Card className={sectionCard}>
            <CardHeader className="px-4 pt-4 pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Perubahan Kategori</CardTitle>
                  <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Kategori dengan perubahan signifikan vs rata-rata</p>
                </div>
                <button type="button" onClick={() => setShowTrends((v) => !v)} className={linkButton}>
                  {showTrends ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {showTrends ? "Ringkas" : "Detail"}
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="space-y-2">
                {categoryTrends
                  .filter((t) => t.isSignificant)
                  .slice(0, showTrends ? undefined : 3)
                  .map((trend) => (
                    <div key={trend.categoryId} className="flex items-center gap-2.5 rounded-xl bg-[hsl(var(--surface-2))] p-2.5">
                      <IconTile label={trend.categoryName} color={categories.find((c) => c.id === trend.categoryId)?.color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2 text-xs">
                          <span className="truncate font-medium">{trend.categoryName}</span>
                          <span className={`shrink-0 font-bold tabular-nums ${trend.growthRate > 0 ? "text-danger" : "text-success"}`}>
                            {trend.growthRate > 0 ? "+" : ""}{trend.growthRate}%
                          </span>
                        </div>
                        <p className="text-[10px] tabular-nums text-[hsl(var(--muted-foreground))]">
                          {formatCurrency(trend.previousMonthsAverage, currency)} → {formatCurrency(trend.currentMonth, currency)}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Account balances */}
        {accounts.length > 0 && (
          <Card className={sectionCard}>
            <CardHeader className="px-4 pt-4 pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Saldo per Akun</CardTitle>
                {accounts.filter((a) => !a.isArchived).length > 5 && (
                  <button type="button" onClick={() => setShowAllAccounts((value) => !value)} className={linkButton}>
                    {showAllAccounts ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {showAllAccounts ? "Ringkas" : `Semua ${accounts.filter((a) => !a.isArchived).length}`}
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-1">
              {visibleAccounts.map((acc) => {
                const totalAll = accounts.filter((a) => !a.isArchived).reduce((s, a) => s + Math.abs(a.currentBalance), 0);
                return (
                  <div key={acc.id} className="flex items-center gap-2.5">
                    <IconTile label={acc.name} color={acc.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-xs">
                        <span className="truncate">{acc.name}</span>
                        <span className="max-w-full break-words font-medium tabular-nums">{formatCurrency(acc.currentBalance, currency)}</span>
                      </div>
                      <ProgressBar value={Math.abs(acc.currentBalance)} max={totalAll} label={`Porsi saldo ${acc.name}`} />
                    </div>
                  </div>
                );
              })}
              {!showAllAccounts && accounts.filter((a) => !a.isArchived).length > visibleAccounts.length && (
                <p className="pt-1 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
                  {accounts.filter((a) => !a.isArchived).length - visibleAccounts.length} akun lain disembunyikan
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <BudgetForm
        open={budgetFormOpen}
        onClose={() => setBudgetFormOpen(false)}
        onSaved={() => { void loadChartData(); setBudgetFormOpen(false); }}
        categories={categories}
        month={currentMonth}
        initialCategoryId={budgetCategoryId}
        initialAmount={budgetInitialAmount}
        initialRecurring={budgetFormRecurring}
      />
    </div>
  );
}
