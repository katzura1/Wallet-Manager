import { useEffect, useState } from "react";
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
  const [activeIncomeTab, setActiveIncomeTab] = useState<"expense" | "income">("expense");
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
  }, []);

  useEffect(() => {
    void loadChartData();
  }, [selectedYear, selectedMonth, categories, mode, dateFrom, dateTo, currency]);

  async function loadChartData() {
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

    const [bars, catMapM, sumM, prevSumM, history, bdgtList, explicitBdgts] = await Promise.all([
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
    setYtdSummary(ytdSummary);
    setYoyComparison(yoyComparison);
    setIncomeCategories(incomeCategories);
    setCategoryTrends(categoryTrends);
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
  }

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
    return <LedgerContent embedded />;
  }

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
      <Card className="overflow-hidden border-transparent bg-[linear-gradient(135deg,hsl(var(--card))_0%,hsl(var(--surface-2))_100%)]">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Analytics</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">Laporan</h1>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Baca pola cashflow, kategori, budget, dan perubahan performa bulanan.</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="inline-flex rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 p-1 text-xs no-print">
                <button
                  type="button"
                  onClick={() => handleReportTabChange("overview")}
                  className="rounded-xl bg-[hsl(var(--primary))] px-3 py-2 font-medium text-[hsl(var(--primary-foreground))] transition-colors"
                >
                  Ikhtisar
                </button>
                <button
                  type="button"
                  onClick={() => handleReportTabChange("ledger")}
                  className="rounded-xl px-3 py-2 font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))]"
                >
                  Ledger
                </button>
              </div>
              <div className="rounded-[24px] bg-[hsl(var(--card))]/75 px-4 py-3 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Mode</p>
                <p className="mt-2 text-sm font-semibold capitalize">{mode === "monthly" ? "Bulanan" : "Rentang"}</p>
              </div>
            </div>
          </div>

          <div className="flex rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/70 p-1 text-sm">
        <button
          onClick={() => setMode("monthly")}
          className={`flex-1 rounded-[18px] py-2.5 font-medium transition-colors ${mode === "monthly" ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]"}`}
        >
          📅 Bulanan
        </button>
        <button
          onClick={() => setMode("range")}
          className={`flex-1 rounded-[18px] py-2.5 font-medium transition-colors ${mode === "range" ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]"}`}
        >
          📆 Rentang
        </button>
          </div>
        </CardContent>
      </Card>

      {/* Month navigator — only in monthly mode */}
      {mode === "monthly" && (
        <div className="flex items-center justify-between rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2">
          <button onClick={prevMonth} className="p-2 rounded-2xl hover:bg-[hsl(var(--surface-2))]"><ChevronLeft size={18} /></button>
          <p className="font-semibold capitalize text-sm">{monthLabel}</p>
          <button onClick={nextMonth} className="p-2 rounded-2xl hover:bg-[hsl(var(--surface-2))]"><ChevronRight size={18} /></button>
        </div>
      )}

      {/* Date range picker — only in range mode */}
      {mode === "range" && (
        <div className="flex items-center gap-2 rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <div className="flex-1">
            <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Dari</p>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex-1">
            <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Sampai</p>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}

      {/* Monthly summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Pemasukan</p>
            <p className="font-bold text-lg text-emerald-500 mt-3">{formatCurrency(summary.income, currency)}</p>
            {mode === "monthly" && incomeComparison && (
              <p className={`text-[11px] mt-2 ${incomeComparison.className}`}>{incomeComparison.label}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Pengeluaran</p>
            <p className="font-bold text-lg text-red-500 mt-3">{formatCurrency(summary.expense, currency)}</p>
            {mode === "monthly" && expenseComparison && (
              <p className={`text-[11px] mt-2 ${expenseComparison.className}`}>{expenseComparison.label}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Net</p>
            <p className={`font-bold text-lg mt-3 ${summary.net >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {formatCurrency(summary.net, currency)}
            </p>
            {mode === "monthly" && netComparison && (
              <p className={`text-[11px] mt-2 ${netComparison.className}`}>{netComparison.label}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Year-to-Date Summary */}
      {mode === "monthly" && ytdSummary && ytdSummary.totalIncome > 0 && (
        <Card className="overflow-hidden border-transparent bg-[linear-gradient(135deg,hsl(var(--emerald-500\/5))_0%,hsl(var(--surface-2))_100%)]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">YTD {selectedYear}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{ytdSummary.monthsIncluded} bulan berjalan</p>
              </div>
              <div className="text-right">
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  ytdSummary.savingsRate >= 20
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : ytdSummary.savingsRate >= 10
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "bg-red-500/10 text-red-600 dark:text-red-400"
                }`}>
                  <span>{ytdSummary.savingsRate >= 20 ? "✅" : ytdSummary.savingsRate >= 10 ? "⚠️" : "❌"}</span>
                  Savings Rate {ytdSummary.savingsRate}%
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 rounded-xl bg-[hsl(var(--card))]/60">
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Total Masuk</p>
                <p className="font-bold text-sm text-emerald-500 mt-1">{formatCurrency(ytdSummary.totalIncome, currency)}</p>
              </div>
              <div className="text-center p-2 rounded-xl bg-[hsl(var(--card))]/60">
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Total Keluar</p>
                <p className="font-bold text-sm text-red-500 mt-1">{formatCurrency(ytdSummary.totalExpense, currency)}</p>
              </div>
              <div className="text-center p-2 rounded-xl bg-[hsl(var(--card))]/60">
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Tersisa</p>
                <p className={`font-bold text-sm mt-1 ${ytdSummary.netSavings >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {formatCurrency(ytdSummary.netSavings, currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Year-over-Year Comparison */}
      {mode === "monthly" && yoyComparison && yoyComparison.hasPreviousYearData && (
        <Card>
          <CardHeader>
            <CardTitle>vs {new Date(yoyComparison.previousYear, yoyComparison.currentMonth - 1, 1).toLocaleString("id-ID", { month: "long" })} {yoyComparison.previousYear}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-2 p-2 rounded-xl bg-emerald-500/5">
                <span className={`text-lg ${yoyComparison.incomeChange >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {yoyComparison.incomeChange >= 0 ? "↑" : "↓"}
                </span>
                <div>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Income</p>
                  <p className={`text-sm font-bold ${yoyComparison.incomeChange >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {yoyComparison.incomeChange > 0 ? "+" : ""}{yoyComparison.incomeChange}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-red-500/5">
                <span className={`text-lg ${yoyComparison.expenseChange <= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {yoyComparison.expenseChange > 0 ? "↑" : "↓"}
                </span>
                <div>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Expense</p>
                  <p className={`text-sm font-bold ${yoyComparison.expenseChange <= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {yoyComparison.expenseChange > 0 ? "+" : ""}{yoyComparison.expenseChange}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-indigo-500/5">
                <span className={`text-lg ${yoyComparison.netChange >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {yoyComparison.netChange >= 0 ? "↑" : "↓"}
                </span>
                <div>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Net</p>
                  <p className={`text-sm font-bold ${yoyComparison.netChange >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {yoyComparison.netChange > 0 ? "+" : ""}{yoyComparison.netChange}%
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "monthly" && (monthlyInsightLoading || monthlyInsight) && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
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

      {/* Cash Flow Bar Chart — monthly only */}
      {mode === "monthly" && <Card>
        <CardHeader>
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

      {/* Category Breakdown - Expense/Income tabs */}
      {mode === "monthly" && (pieData.length > 0 || incomeCategories.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{activeIncomeTab === "expense" ? "Kategori Pengeluaran" : "Sumber Pemasukan"}</CardTitle>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">
                  {activeIncomeTab === "expense" ? "Expense dikurangi pemasukan pada kategori yang sama" : "Breakdown sumber pemasukan utama"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(activeIncomeTab === "expense" ? pieData.length : incomeCategories.length) > 5 && (
                  <button
                    onClick={() => setShowAllCategories((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium"
                  >
                    {showAllCategories ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {showAllCategories ? "Ringkas" : "Semua"}
                  </button>
                )}
                <div className="flex rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-0.5 text-xs">
                  <button
                    onClick={() => setActiveIncomeTab("expense")}
                    className={`px-3 py-1.5 rounded-md transition-colors ${activeIncomeTab === "expense" ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "text-[hsl(var(--muted-foreground))]"}`}
                  >
                    Pengeluaran
                  </button>
                  <button
                    onClick={() => setActiveIncomeTab("income")}
                    className={`px-3 py-1.5 rounded-md transition-colors ${activeIncomeTab === "income" ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "text-[hsl(var(--muted-foreground))]"}`}
                  >
                    Pemasukan
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            {activeIncomeTab === "expense" ? (
              <>
                {pieData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
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

                    <div className="space-y-2 mt-2">
                      {visiblePieData.map((entry) => {
                        const pct = totalPieValue ? Math.round((entry.value / totalPieValue) * 100) : 0;
                        return (
                          <div key={entry.name} className="flex items-center gap-2.5">
                            <span className="text-sm">{entry.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between gap-2 text-xs mb-0.5">
                                <span className="truncate">{entry.name}</span>
                                <span className="font-medium shrink-0">{formatCurrency(entry.value, currency)}</span>
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
                  </>
                ) : (
                  <p className="text-center text-sm text-[hsl(var(--muted-foreground))] py-8">Belum ada data pengeluaran</p>
                )}
              </>
            ) : (
              <>
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
                            <div className="flex justify-between gap-2 text-xs mb-0.5">
                              <span className="truncate">{category?.name ?? "Lainnya"}</span>
                              <span className="font-medium shrink-0 text-emerald-500">{formatCurrency(entry.amount, currency)}</span>
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
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Category Trends */}
      {mode === "monthly" && categoryTrends.filter((t) => t.isSignificant).length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
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

      {/* Budget vs Actuals — monthly only */}
      {mode === "monthly" && budgetRows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Anggaran Bulan Ini</CardTitle>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">Pemakaian dihitung dari pengeluaran bersih per kategori</p>
              </div>
              <div className="flex items-center gap-2">
                {activeBudgetRows.length > 5 && (
                  <button
                    onClick={() => setShowAllBudgets((value) => !value)}
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium"
                  >
                    {showAllBudgets ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {showAllBudgets ? "Ringkas" : `Semua ${activeBudgetRows.length}`}
                  </button>
                )}
                <button
                  onClick={() => { setBudgetCategoryId(undefined); setBudgetInitialAmount(0); setBudgetFormOpen(true); }}
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
                    <div className="flex justify-between gap-2 text-xs mb-0.5">
                      <span className="truncate">{category.name}</span>
                      <span className="font-medium shrink-0">
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
                    className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
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
                        <div className="flex justify-between gap-2 text-xs mb-0.5">
                          <span className="truncate">{category.name}</span>
                          <span className="font-medium shrink-0">0 / {formatCurrency(budget!.amount, currency)}</span>
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
                        className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
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

      {/* Account balances */}
      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
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
                    <div className="flex justify-between gap-2 text-xs mb-0.5">
                      <span className="truncate">{acc.name}</span>
                      <span className="font-medium shrink-0">{formatCurrency(acc.currentBalance, currency)}</span>
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

      {/* Balance History — monthly only */}
      {mode === "monthly" && balanceHistory.length > 0 && balanceHistory.some((d) => d.balance !== 0) && (
        <Card>
          <CardHeader>
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
