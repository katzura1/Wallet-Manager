import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/components/ui";
import { getMonthlyChartData, getCategoryExpenseData, getMonthlySummary, getTotalBalanceHistory, getSummaryBetween, getCategoryExpenseBetween, getYearToDateSummary, getYearOverYearComparison, getCategoryIncomeData, getCategoryTrends, type YearToDateSummary, type YearOverYearComparison, type CategoryIncomeEntry, type CategoryTrend } from "@/db/transactions";
import { getBudgetsForMonth, getBudgetsForCategoriesWithInheritance, predictBudgetStatus } from "@/db/budgets";
import { BudgetForm } from "@/components/forms/BudgetForm";
import { formatCurrency } from "@/lib/utils";
import { generateMonthlyInsight, type MonthlyInsightResult } from "@/lib/monthlyInsight";
import { LedgerContent } from "@/pages/Ledger";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [chartData, setChartData] = useState<ChartBar[]>([]);
  const [pieData, setPieData] = useState<PieEntry[]>([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [previousSummary, setPreviousSummary] = useState<{ income: number; expense: number; net: number } | null>(null);
  const [balanceHistory, setBalanceHistory] = useState<{ month: string; balance: number }[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [inheritedBudgetIds, setInheritedBudgetIds] = useState<Set<number>>(new Set());
  const [budgetFormOpen, setBudgetFormOpen] = useState(false);
  const [budgetCategoryId, setBudgetCategoryId] = useState<number | undefined>();
  const [budgetInitialAmount, setBudgetInitialAmount] = useState<number>(0);
  const [budgetFormRecurring, setBudgetFormRecurring] = useState<boolean>(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllBudgets, setShowAllBudgets] = useState(false);
  const [showAllAccounts, setShowAllAccounts] = useState(false);
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

    const [bars, catMapM, sumM, prevSumM, history, bdgtList, explicitBdgts, yearSummary, yearComparison, incomeData, trends] = await Promise.all([
      getMonthlyChartData(6),
      getCategoryExpenseData(selectedYear, selectedMonth),
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

    setMonthlyInsightLoading(true);
    try {
      const budgetRows = categories
        .filter((category) => category.type === "expense" || category.type === "both")
        .map((category) => {
          const actual = pie.find((entry) => entry.name === category.name)?.value ?? 0;
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
        summary: sumM,
        previousSummary: prevSumM,
        topCategories: pie.slice(0, 3).map((entry) => ({
          name: entry.name,
          value: entry.value,
          icon: entry.icon,
        })),
        budget: {
          overBudgetCount: budgetRows.filter((row) => row.budget && row.actual > row.budget.amount).length,
          nearLimitCount: budgetRows.filter((row) => row.budget && row.actual <= row.budget.amount && row.pct >= 80).length,
          trackedCategoryCount: budgetRows.filter((row) => !!row.budget).length,
          unusedBudgetCount: budgetRows.filter((row) => row.budget && row.actual === 0).length,
        },
      });
      setMonthlyInsight(insight);
    } finally {
      setMonthlyInsightLoading(false);
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
    setBudgetFormRecurring(existing?.recurring ?? false);
  }

  const currentMonth = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

  function getComparisonMeta(current: number, previous: number, goodWhen: "up" | "down") {
    if (previous === 0) {
      if (current === 0) {
        return {
          label: "Sama seperti bulan lalu",
          className: "text-[hsl(var(--muted-foreground))]",
        };
      }
      return {
        label: "Belum ada data pembanding",
        className: "text-[hsl(var(--muted-foreground))]",
      };
    }

    const diff = current - previous;
    const pct = Math.round((Math.abs(diff) / Math.abs(previous)) * 100);
    if (diff === 0) {
      return {
        label: "Tidak berubah dari bulan lalu",
        className: "text-[hsl(var(--muted-foreground))]",
      };
    }

    const improved = goodWhen === "up" ? diff > 0 : diff < 0;
    return {
      label: `${diff > 0 ? "+" : "-"}${pct}% vs bulan lalu`,
      className: improved ? "text-emerald-500" : "text-red-500",
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
          const pct = budget?.amount ? Math.min(Math.round((actual / budget.amount) * 100), 100) : 0;
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

  function handleReportTabChange(tab: "overview" | "ledger") {
    const nextParams = new URLSearchParams(searchParams);
    if (tab === "ledger") nextParams.set("tab", "ledger");
    else nextParams.delete("tab");
    setSearchParams(nextParams, { replace: true });
  }

  if (isLedgerTab) {
    return <LedgerContent />;
  }

  return (
    <div className="grid grid-cols-1 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[hsl(var(--primary))] [&>div]:min-w-0 items-start gap-4 px-4 pt-5 pb-4 lg:grid-cols-2 lg:space-y-0 lg:px-0 lg:pt-7">
      <Card className="overflow-hidden lg:col-span-2">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">Laporan</h1>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Arus kas, kategori, dan anggaran.</p>
            </div>
            <div className="inline-flex rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-1 text-xs no-print">
                <button
                  type="button"
                  aria-current="page"
                  onClick={() => handleReportTabChange("overview")}
                  className="min-h-9 rounded-lg bg-[hsl(var(--primary))] px-3 font-medium text-[hsl(var(--primary-foreground))] transition-colors"
                >
                  Ikhtisar
                </button>
                <button
                  type="button"
                  onClick={() => handleReportTabChange("ledger")}
                  className="min-h-9 rounded-lg px-3 font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--card))]"
                >
                  Ledger
                </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-1 text-sm sm:w-56 sm:shrink-0">
        <button
          aria-pressed={mode === "monthly"}
          onClick={() => setMode("monthly")}
          className={`min-h-10 flex-1 rounded-lg font-medium transition-colors ${mode === "monthly" ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--card))]"}`}
        >
          📅 Bulanan
        </button>
        <button
          aria-pressed={mode === "range"}
          onClick={() => setMode("range")}
          className={`min-h-10 flex-1 rounded-lg font-medium transition-colors ${mode === "range" ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--card))]"}`}
        >
          📆 Rentang
        </button>
          </div>
          {mode === "monthly" ? (
            <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-[hsl(var(--border))] px-2 sm:w-64">
              <button aria-label="Bulan sebelumnya" onClick={prevMonth} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[hsl(var(--surface-2))]"><ChevronLeft size={18} /></button>
              <p className="font-semibold capitalize text-sm">{monthLabel}</p>
              <button aria-label="Bulan berikutnya" onClick={nextMonth} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[hsl(var(--surface-2))]"><ChevronRight size={18} /></button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-[hsl(var(--border))] p-2 sm:flex-[1.5]">
              <label className="min-w-0 text-[11px] text-[hsl(var(--muted-foreground))]">Dari
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 w-full min-w-0 max-w-full rounded focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] bg-transparent text-sm text-[hsl(var(--foreground))] outline-none" />
              </label>
              <label className="min-w-0 text-[11px] text-[hsl(var(--muted-foreground))]">Sampai
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 w-full min-w-0 max-w-full rounded focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] bg-transparent text-sm text-[hsl(var(--foreground))] outline-none" />
              </label>
            </div>
          )}
          </div>
          <dl className="grid grid-cols-2 gap-3 border-t border-[hsl(var(--border))] pt-3 sm:grid-cols-3">
            {[
              { label: "Pemasukan", value: summary.income, comparison: incomeComparison, tone: "text-emerald-500", annualChange: yoyComparison?.incomeChange },
              { label: "Pengeluaran", value: summary.expense, comparison: expenseComparison, tone: "text-red-500", annualChange: yoyComparison?.expenseChange },
              { label: "Saldo bersih", value: summary.net, comparison: netComparison, tone: summary.net >= 0 ? "text-emerald-500" : "text-red-500", annualChange: yoyComparison?.netChange },
            ].map(({ label, value, comparison, tone, annualChange }, index) => (
              <div key={label} className={`min-w-0 ${index === 2 ? "col-span-2 sm:col-span-1" : ""}`}>
                <dt className="text-xs text-[hsl(var(--muted-foreground))]">{label}</dt>
                <dd className={`mt-1 break-words text-base font-bold tabular-nums sm:text-xl ${tone}`}>{formatCurrency(value, currency)}</dd>
                {mode === "monthly" && comparison && <dd className={`mt-1 text-[11px] ${comparison.className}`}>{comparison.label}</dd>}
                {mode === "monthly" && yoyComparison?.hasPreviousYearData && annualChange !== undefined && (
                  <dd className={`mt-1 text-[11px] ${(label === "Pengeluaran" ? annualChange <= 0 : annualChange >= 0) ? "text-emerald-500" : "text-red-500"}`}>
                    {annualChange > 0 ? "+" : ""}{annualChange}% vs {new Date(yoyComparison.previousYear, yoyComparison.currentMonth - 1, 1).toLocaleString("id-ID", { month: "long", year: "numeric" })}
                  </dd>
                )}
              </div>
            ))}
          </dl>
          {mode === "monthly" && ytdSummary && ytdSummary.totalIncome > 0 && (
            <section aria-label="Ringkasan tahunan" className="border-t border-[hsl(var(--border))] pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <h2 className="font-semibold">YTD {selectedYear} <span className="font-normal text-[hsl(var(--muted-foreground))]">· {ytdSummary.monthsIncluded} bulan berjalan</span></h2>
                <span className={ytdSummary.savingsRate >= 20 ? "text-emerald-600 dark:text-emerald-400" : ytdSummary.savingsRate >= 10 ? "text-amber-600 dark:text-amber-400" : "text-red-500"}>Tingkat tabungan {ytdSummary.savingsRate}%</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: "Total Masuk", value: ytdSummary.totalIncome, tone: "text-emerald-500" },
                  { label: "Total Keluar", value: ytdSummary.totalExpense, tone: "text-red-500" },
                  { label: "Tersisa", value: ytdSummary.netSavings, tone: ytdSummary.netSavings >= 0 ? "text-emerald-500" : "text-red-500" },
                ].map(({ label, value, tone }, index) => (
                  <div key={label} className={`min-w-0 ${index === 2 ? "col-span-2 sm:col-span-1" : ""}`}>
                    <dt className="text-[11px] text-[hsl(var(--muted-foreground))]">{label}</dt>
                    <dd className={`mt-1 break-words text-sm font-semibold tabular-nums ${tone}`}>{formatCurrency(value, currency)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </CardContent>
      </Card>

      {/* Cash Flow Bar Chart — monthly only */}
      {mode === "monthly" && <Card>
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle>Arus Kas 6 Bulan</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(val) => formatCurrency(Number(val), currency)}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="income" name="Pemasukan" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Pengeluaran" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-sm text-[hsl(var(--muted-foreground))] py-8">Belum ada data</p>
          )}
        </CardContent>
      </Card>}

      {/* Balance History — monthly only */}
      {mode === "monthly" && balanceHistory.length > 0 && balanceHistory.some((d) => d.balance !== 0) && (
        <Card className="min-w-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle>Riwayat Total Saldo</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={balanceHistory}>
                <defs>
                  <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(val) => formatCurrency(Number(val), currency)}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                />
                <Area dataKey="balance" name="Total Saldo" stroke="#6366f1" strokeWidth={2} fill="url(#balGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Category breakdown */}
      {(pieData.length > 0 || (mode === "monthly" && incomeCategories.length > 0)) && (
        <Card className="lg:col-span-2">
          <CardHeader className="px-4 pt-4 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Kategori</CardTitle>
              {(pieData.length > 5 || (mode === "monthly" && incomeCategories.length > 5)) && (
                <button type="button" onClick={() => setShowAllCategories((value) => !value)} aria-expanded={showAllCategories} className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-[hsl(var(--primary))]">
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
                  <>
                    <div className="sm:grid sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:items-center sm:gap-3">
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3}>
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val) => formatCurrency(Number(val), currency)}
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "12px",
                            fontSize: "12px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>

                    <div className="mt-2 space-y-2 lg:mt-0">
                      {visiblePieData.map((entry) => {
                        const pct = totalPieValue ? Math.round((entry.value / totalPieValue) * 100) : 0;
                        return (
                          <div key={entry.name} className="flex items-center gap-2.5">
                            <span className="text-sm">{entry.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-xs mb-0.5">
                                <span className="truncate">{entry.name}</span>
                                <span className="max-w-full break-words font-medium tabular-nums">{formatCurrency(entry.value, currency)}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-[hsl(var(--border))]">
                                <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: entry.color }} />
                              </div>
                            </div>
                            <span className="text-[11px] text-[hsl(var(--muted-foreground))] w-7 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                      {!showAllCategories && pieData.length > visiblePieData.length && (
                        <p className="text-[11px] text-[hsl(var(--muted-foreground))] text-center pt-1">
                          {pieData.length - visiblePieData.length} kategori lain disembunyikan
                        </p>
                      )}
                    </div>
                    </div>
                  </>
                ) : (
                  <p className="text-center text-sm text-[hsl(var(--muted-foreground))] py-8">Belum ada data pengeluaran</p>
                )}
              </section>
              {mode === "monthly" && <section aria-label="Sumber Pemasukan" className="min-w-0 lg:border-l lg:border-[hsl(var(--border))] lg:pl-4">
                <h3 className="mb-2 text-sm font-semibold">Sumber Pemasukan</h3>
                {incomeCategories.length > 0 ? (
                  <div className="space-y-2">
                    {incomeCategories.slice(0, showAllCategories ? undefined : 5).map((entry) => {
                      const category = categories.find((c) => c.id === entry.categoryId);
                      const totalIncome = incomeCategories.reduce((s, c) => s + c.amount, 0);
                      const pct = totalIncome > 0 ? Math.round((entry.amount / totalIncome) * 100) : 0;
                      return (
                        <div key={entry.categoryId} className="flex items-center gap-2.5">
                          <span className="text-sm">{category?.icon ?? "💰"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-xs mb-0.5">
                              <span className="truncate">{category?.name ?? "Lainnya"}</span>
                              <span className="max-w-full break-words font-medium tabular-nums text-emerald-500">{formatCurrency(entry.amount, currency)}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-[hsl(var(--border))]">
                              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: category?.color ?? "#22c55e" }} />
                            </div>
                          </div>
                          <span className="text-[11px] text-[hsl(var(--muted-foreground))] w-7 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                    {!showAllCategories && incomeCategories.length > 5 && (
                      <p className="text-[11px] text-[hsl(var(--muted-foreground))] text-center pt-1">
                        {incomeCategories.length - 5} kategori lain disembunyikan
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-sm text-[hsl(var(--muted-foreground))] py-8">Belum ada data pemasukan</p>
                )}
              </section>}
          </CardContent>
        </Card>
      )}

      {/* Budget vs Actuals — monthly only */}
      {mode === "monthly" && budgetRows.length > 0 && (
        <Card className="min-w-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Anggaran Bulan Ini</CardTitle>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">Pemakaian dihitung dari pengeluaran bersih per kategori</p>
              </div>
              <div className="flex items-center gap-2">
                {(activeBudgetRows.length > 5 || unusedBudgetRows.length > 4) && (
                  <button
                    onClick={() => setShowAllBudgets((value) => !value)}
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium"
                  >
                    {showAllBudgets ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {showAllBudgets ? "Ringkas" : "Semua anggaran"}
                  </button>
                )}
                <button
                  onClick={() => { setBudgetCategoryId(undefined); setBudgetInitialAmount(0); setBudgetFormRecurring(false); setBudgetFormOpen(true); }}
                  className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium"
                >
                  <Target size={13} /> + Atur
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-1 space-y-2.5">
            {visibleBudgetRows.map(({ category, actual, budget, isInherited, pct, prediction }) => {
              const over = !!budget && actual > budget.amount;
              return (
                <div key={category.id} className="flex items-center gap-2.5">
                  <span className="text-sm">{category.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-xs mb-0.5">
                      <span className="truncate">{category.name}</span>
                      <span className="max-w-full break-words font-medium tabular-nums">
                        {formatCurrency(actual, currency)}
                        {budget && <span className={`ml-1 ${over ? "text-red-500" : "text-[hsl(var(--muted-foreground))]"}`}>/ {formatCurrency(budget.amount, currency)}</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {budget ? (
                        <div className="h-1.5 rounded-full flex-1 bg-[hsl(var(--border))]">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{ width: `${pct}%`, background: over ? "#ef4444" : pct > 80 ? "#f59e0b" : category.color }}
                          />
                        </div>
                      ) : (
                        <div className="h-1.5 rounded-full flex-1 bg-[hsl(var(--border))] relative">
                          <div className="h-1.5 rounded-full transition-all" style={{ width: "100%", background: `${category.color}44` }} />
                        </div>
                      )}
                      {isInherited && budget && (
                        <Badge className="text-[9px] px-2 py-0.5 h-fit shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                          Inherited
                        </Badge>
                      )}
                      {/* Budget Prediction */}
                      {prediction && !over && prediction.predictedExhaustInDays !== null && prediction.predictedExhaustInDays <= 15 && (
                        <span className="text-[9px] text-amber-500 shrink-0">
                          ~{prediction.predictedExhaustInDays === 0 ? "habis" : `${prediction.predictedExhaustInDays}d`}
                        </span>
                      )}
                    </div>
                    {/* Over-budget warning */}
                    {over && prediction && prediction.projectedOverrun > 0 && (
                      <p className="text-[10px] text-red-500 mt-0.5">
                        Proyeksi over {formatCurrency(prediction.projectedOverrun, currency)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => openBudgetForm(category.id!)}
                    aria-label={`Atur anggaran ${category.name}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                  >
                    <Target size={12} />
                  </button>
                </div>
              );
            })}
            {!showAllBudgets && activeBudgetRows.length > visibleBudgetRows.length && (
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] text-center pt-1">
                {activeBudgetRows.length - visibleBudgetRows.length} kategori budget aktif lain disembunyikan
              </p>
            )}

            {unusedBudgetRows.length > 0 && (
              <div className="pt-2 border-t border-[hsl(var(--border))]">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Belum terpakai bulan ini</p>
                  <span className="text-[11px] text-[hsl(var(--muted-foreground))]">{unusedBudgetRows.length} kategori</span>
                </div>
                <div className="space-y-2">
                  {visibleUnusedBudgetRows.map(({ category, budget, isInherited }) => (
                    <div key={category.id} className="flex items-center gap-2.5">
                      <span className="text-sm">{category.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-xs mb-0.5">
                          <span className="truncate">{category.name}</span>
                          <span className="max-w-full break-words font-medium tabular-nums">0 / {formatCurrency(budget!.amount, currency)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 rounded-full flex-1 bg-[hsl(var(--border))]" />
                          {isInherited && (
                            <Badge className="text-[9px] px-2 py-0.5 h-fit shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                              Inherited
                            </Badge>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => openBudgetForm(category.id!)}
                        aria-label={`Atur anggaran ${category.name}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                      >
                        <Target size={12} />
                      </button>
                    </div>
                  ))}
                  {!showAllBudgets && unusedBudgetRows.length > visibleUnusedBudgetRows.length && (
                    <p className="text-[11px] text-[hsl(var(--muted-foreground))] text-center pt-1">
                      {unusedBudgetRows.length - visibleUnusedBudgetRows.length} budget belum terpakai disembunyikan
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mode === "monthly" && (monthlyInsightLoading || monthlyInsight) && (
        <Card className="min-w-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Insight Bulan Ini</CardTitle>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">Ringkasan cepat dari angka paling penting bulan ini</p>
              </div>
              {monthlyInsight && (
                <Badge className={monthlyInsight.source === "ai" ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"}>
                  {monthlyInsight.source === "ai" ? "AI" : "Lokal"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            {monthlyInsightLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 rounded bg-[hsl(var(--muted))] w-2/3" />
                <div className="h-3 rounded bg-[hsl(var(--muted))] w-full" />
                <div className="h-3 rounded bg-[hsl(var(--muted))] w-5/6" />
              </div>
            ) : monthlyInsight ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">{monthlyInsight.headline}</p>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{monthlyInsight.summary}</p>
                </div>
                <div className="space-y-2">
                  {monthlyInsight.highlights.map((item) => (
                    <div key={item} className="flex items-start gap-2 text-sm">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500 flex-none" />
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
        <Card className="min-w-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Perubahan Kategori</CardTitle>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">Kategori dengan perubahan signifikan vs rata-rata</p>
              </div>
              <button
                onClick={() => setShowTrends((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium"
              >
                {showTrends ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {showTrends ? "Ringkas" : "Detail"}
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="space-y-2">
              {categoryTrends
                .filter((t) => t.isSignificant)
                .slice(0, showTrends ? undefined : 3)
                .map((trend) => (
                  <div key={trend.categoryId} className="flex items-center gap-2.5 p-2 rounded-xl bg-[hsl(var(--surface-2))]">
                    <span className="text-sm">{trend.categoryIcon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="truncate font-medium">{trend.categoryName}</span>
                        <span className={`font-bold shrink-0 ${trend.growthRate > 0 ? "text-red-500" : "text-emerald-500"}`}>
                          {trend.growthRate > 0 ? "+" : ""}{trend.growthRate}%
                        </span>
                      </div>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
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
        <Card className="min-w-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Saldo per Akun</CardTitle>
              {accounts.filter((a) => !a.isArchived).length > 5 && (
                <button
                  onClick={() => setShowAllAccounts((value) => !value)}
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium"
                >
                  {showAllAccounts ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {showAllAccounts ? "Ringkas" : `Semua ${accounts.filter((a) => !a.isArchived).length}`}
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-1 space-y-2.5">
            {visibleAccounts.map((acc) => {
              const totalAll = accounts.filter((a) => !a.isArchived).reduce((s, a) => s + Math.abs(a.currentBalance), 0);
              const pct = totalAll ? Math.round((Math.abs(acc.currentBalance) / totalAll) * 100) : 0;
              return (
                <div key={acc.id} className="flex items-center gap-2.5">
                  <span className="text-sm">{acc.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-xs mb-0.5">
                      <span className="truncate">{acc.name}</span>
                      <span className="max-w-full break-words font-medium tabular-nums">{formatCurrency(acc.currentBalance, currency)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[hsl(var(--border))]">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: acc.color }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {!showAllAccounts && accounts.filter((a) => !a.isArchived).length > visibleAccounts.length && (
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] text-center pt-1">
                {accounts.filter((a) => !a.isArchived).length - visibleAccounts.length} akun lain disembunyikan
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
