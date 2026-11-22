import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, CardTitle, CardContent, Badge, IconTile, PageHeader, ProgressBar, SegmentedControl, Sheet } from "@/components/ui";
import { getTransactions, getMonthlyChartData, getCategoryExpenseData, getMonthlySummary, getTotalBalanceHistory, getSummaryBetween, getCategoryExpenseBetween, getYearToDateSummary, getYearOverYearComparison, getCategoryIncomeData, getCategoryTrends, type YearToDateSummary, type YearOverYearComparison, type CategoryIncomeEntry, type CategoryTrend } from "@/db/transactions";
import { loadMonthBudgets } from "@/lib/budgetRows";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { formatCompactCurrency, formatCurrency, todayISO } from "@/lib/utils";
import { generateMonthlyInsight, type MonthlyInsightResult } from "@/lib/monthlyInsight";
import { useMonth } from "@/lib/useMonth";
import { LedgerContent, ReportTabs } from "@/pages/Ledger";
import { CalendarRange, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";

interface ChartBar {
  month: string;
  income: number;
  expense: number;
}
interface CategoryEntry {
  name: string;
  value: number;
  color: string;
}

/** Category totals as a sorted list; entries sharing a name (e.g. multiple orphan "Lainnya") are merged. */
function toCategoryEntries(
  amounts: Record<number, number>,
  categories: { id?: number; name: string; color?: string }[],
): CategoryEntry[] {
  const map = new Map<string, CategoryEntry>();
  for (const [catId, amount] of Object.entries(amounts)) {
    const cat = categories.find((c) => c.id === Number(catId));
    const name = cat?.name ?? "Lainnya";
    const existing = map.get(name);
    if (existing) existing.value += amount;
    else map.set(name, { name, value: amount, color: cat?.color ?? "" });
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

export default function Reports() {
  const { categories, refreshAll } = useWalletStore();
  const { currency } = useSettingsStore();
  const [searchParams] = useSearchParams();
  const { hash } = useLocation();
  const [chartData, setChartData] = useState<ChartBar[]>([]);
  const [pieData, setPieData] = useState<CategoryEntry[]>([]);
  const [prevCategoryMap, setPrevCategoryMap] = useState<Record<number, number>>({});
  const [summary, setSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [previousSummary, setPreviousSummary] = useState<{ income: number; expense: number; net: number } | null>(null);
  const [balanceHistory, setBalanceHistory] = useState<{ month: string; balance: number }[]>([]);
  const [budgetUsage, setBudgetUsage] = useState<{ spent: number; limit: number } | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [categoryView, setCategoryView] = useState<"expense" | "income">("expense");
  const [periodOpen, setPeriodOpen] = useState(false);
  const insightRequestId = useRef(0);
  const [monthlyInsight, setMonthlyInsight] = useState<MonthlyInsightResult | null>(null);
  const [monthlyInsightLoading, setMonthlyInsightLoading] = useState(false);
  const [ytdSummary, setYtdSummary] = useState<YearToDateSummary | null>(null);
  const [yoyComparison, setYoyComparison] = useState<YearOverYearComparison | null>(null);
  const [incomeCategories, setIncomeCategories] = useState<CategoryIncomeEntry[]>([]);
  const [categoryTrends, setCategoryTrends] = useState<CategoryTrend[]>([]);
  const [showTrends, setShowTrends] = useState(false);

  const monthState = useMonth();
  const { year: selectedYear, month: selectedMonth } = monthState;

  // Range mode
  const [now] = useState(() => new Date());
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
      setBudgetUsage(null);
      setPieData(toCategoryEntries(catMap, categories));
      return;
    }

    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

    const [bars, catMapM, prevCatMap, sumM, prevSumM, history, monthBudgets, yearSummary, yearComparison, incomeData, trends] = await Promise.all([
      getMonthlyChartData(6),
      getCategoryExpenseData(selectedYear, selectedMonth),
      getCategoryExpenseData(prevYear, prevMonth),
      getMonthlySummary(selectedYear, selectedMonth),
      getMonthlySummary(prevYear, prevMonth),
      getTotalBalanceHistory(6),
      loadMonthBudgets(monthStr, categories),
      // New YTD and analysis data
      getYearToDateSummary(selectedYear, selectedMonth),
      getYearOverYearComparison(selectedYear, selectedMonth),
      getCategoryIncomeData(selectedYear, selectedMonth),
      getCategoryTrends(selectedYear, selectedMonth, 3),
    ]);
    const bdgtList = monthBudgets.budgets;
    setBudgetUsage({
      spent: bdgtList.reduce((sum, b) => sum + (catMapM[b.categoryId] ?? 0), 0),
      limit: bdgtList.reduce((sum, b) => sum + b.amount, 0),
    });

    setChartData(bars);
    setPrevCategoryMap(prevCatMap);
    setSummary(sumM);
    setPreviousSummary(prevSumM);
    setBalanceHistory(history);
    // Set new state values
    setYtdSummary(yearSummary);
    setYoyComparison(yearComparison);
    setIncomeCategories(incomeData);
    setCategoryTrends(trends);
    setPieData(toCategoryEntries(catMapM, categories));

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

  const prevMonthDate = new Date(selectedYear, selectedMonth - 2, 1);
  const prevMonthName = prevMonthDate.toLocaleString("id-ID", { month: "long" });
  const prevMonthShort = prevMonthDate.toLocaleString("id-ID", { month: "short" });

  function getComparisonMeta(current: number, previous: number, goodWhen: "up" | "down") {
    if (previous === 0) {
      return {
        label: current === 0 ? `Sama seperti ${prevMonthName}` : "Tanpa pembanding",
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
      label: `${diff > 0 ? "+" : "-"}${pct}% vs ${prevMonthShort}`,
      className: improved ? "text-success" : "text-danger",
    };
  }

  const incomeComparison = previousSummary ? getComparisonMeta(summary.income, previousSummary.income, "up") : null;
  const expenseComparison = previousSummary ? getComparisonMeta(summary.expense, previousSummary.expense, "down") : null;
  const netComparison = previousSummary ? getComparisonMeta(summary.net, previousSummary.net, "up") : null;
  const totalPieValue = pieData.reduce((sum, entry) => sum + entry.value, 0);
  const visiblePieData = showAllCategories ? pieData : pieData.slice(0, 5);
  const incomeTotal = incomeCategories.reduce((s, c) => s + c.amount, 0);
  const hasIncomeView = mode === "monthly" && incomeCategories.length > 0;
  const activeCategoryView = hasIncomeView ? categoryView : "expense";
  const budgetPct = budgetUsage && budgetUsage.limit > 0 ? Math.round((budgetUsage.spent / budgetUsage.limit) * 100) : null;

  const monthLabel = monthState.label;
  const periodLabel = mode === "monthly" ? monthState.shortLabel : `${dateFrom} - ${dateTo}`;

  if (hash === "#anggaran") {
    return <Navigate to="/budgets" replace />;
  }

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
  const savingsStroke = savingsRate >= 20 ? "stroke-success" : savingsRate >= 10 ? "stroke-warning" : "stroke-danger";
  const ringCircumference = 2 * Math.PI * 22;
  const ringFill = (Math.min(100, Math.max(0, savingsRate)) / 100) * ringCircumference;
  const sectionCard = "min-w-0 rounded-[18px]";
  const linkButton = "inline-flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-[hsl(var(--primary))]";
  const periodButton = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

  const summaryCards = [
    { label: "Masuk", value: summary.income, comparison: incomeComparison, tone: "text-success", annualChange: yoyComparison?.incomeChange, expense: false },
    { label: "Keluar", value: summary.expense, comparison: expenseComparison, tone: "text-[hsl(var(--foreground))]", annualChange: yoyComparison?.expenseChange, expense: true },
    { label: "Bersih", value: summary.net, comparison: netComparison, tone: summary.net >= 0 ? "text-[hsl(var(--foreground))]" : "text-danger", annualChange: yoyComparison?.netChange, expense: false },
  ];
  const showRing = mode === "monthly" && ytdSummary && ytdSummary.totalIncome > 0;

  return (
    <div className="space-y-4 px-4 pt-5 pb-4 lg:px-0 lg:pt-7">
      <PageHeader
        title="Laporan"
        actions={
          <div className="no-print flex items-center gap-1">
            {mode === "monthly" ? (
              <MonthSwitcher label={monthLabel} shortLabel={monthState.shortLabel} onPrev={monthState.prev} onNext={monthState.next} />
            ) : (
              <p className="px-1.5 text-xs font-bold tabular-nums">{dateFrom} - {dateTo}</p>
            )}
            <button type="button" aria-label="Periode" onClick={() => setPeriodOpen(true)} className={periodButton}><CalendarRange size={16} /></button>
          </div>
        }
      />
      <p className="hidden text-sm font-medium capitalize print:block">{mode === "monthly" ? monthLabel : periodLabel}</p>
      <ReportTabs value="overview" />

      <Sheet open={periodOpen} onClose={() => setPeriodOpen(false)} title="Periode">
        <div className="space-y-4">
          <SegmentedControl
            label="Mode periode"
            value={mode}
            options={[{ value: "monthly", label: "Bulanan" }, { value: "range", label: "Rentang" }]}
            onChange={setMode}
          />
          {mode === "range" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="min-w-0 text-xs text-[hsl(var(--muted-foreground))]">Dari
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm text-[hsl(var(--foreground))] outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]" />
              </label>
              <label className="min-w-0 text-xs text-[hsl(var(--muted-foreground))]">Sampai
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm text-[hsl(var(--foreground))] outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]" />
              </label>
            </div>
          )}
        </div>
      </Sheet>

      <dl className="grid grid-cols-3 gap-2 lg:grid-cols-4 lg:gap-4">
        {summaryCards.map(({ label, value, comparison, tone, annualChange, expense }) => (
          <Card key={label} className={`${sectionCard} p-3 lg:p-4`}>
            <dt className="text-xs text-[hsl(var(--muted-foreground))] lg:text-[13px]">{label}</dt>
            <dd className={`mt-1 break-words text-[15px] font-extrabold tabular-nums lg:text-2xl ${tone}`}>
              <span className="lg:hidden" aria-hidden="true">{formatCompactCurrency(value, currency)}</span>
              <span className="sr-only lg:not-sr-only">{formatCurrency(value, currency)}</span>
            </dd>
            {mode === "monthly" && comparison && <dd className={`mt-1 text-[11px] font-semibold lg:text-xs ${comparison.className}`}>{comparison.label}</dd>}
            {mode === "monthly" && yoyComparison?.hasPreviousYearData && annualChange !== undefined && (
              <dd className={`mt-0.5 text-[11px] ${(expense ? annualChange <= 0 : annualChange >= 0) ? "text-success" : "text-danger"}`}>
                {annualChange > 0 ? "+" : ""}{annualChange}% vs {new Date(yoyComparison.previousYear, yoyComparison.currentMonth - 1, 1).toLocaleString("id-ID", { month: "short", year: "numeric" })}
              </dd>
            )}
          </Card>
        ))}
        {showRing && ytdSummary && (
          <Card className={`${sectionCard} col-span-3 p-4 lg:col-span-1`}>
            <div className="flex items-center gap-3.5">
              <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`Tingkat tabungan ${savingsRate}%`} className="shrink-0 -rotate-90">
                <circle cx="28" cy="28" r="22" fill="none" strokeWidth="8" className="stroke-[hsl(var(--surface-3))]" />
                <circle cx="28" cy="28" r="22" fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${ringFill} ${ringCircumference}`} className={savingsStroke} />
              </svg>
              <div className="min-w-0">
                <dt className="text-[15px] font-bold">Tabungan <span className={`tabular-nums ${savingsTone}`}>{savingsRate}%</span></dt>
                <dd className="text-xs text-[hsl(var(--muted-foreground))]">Target sehat ≥ 20% · YTD {selectedYear} · {ytdSummary.monthsIncluded} bulan</dd>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-[hsl(var(--border))] pt-3">
              {[
                { label: "Masuk YTD", value: ytdSummary.totalIncome, tone: "text-success" },
                { label: "Keluar YTD", value: ytdSummary.totalExpense, tone: "text-[hsl(var(--foreground))]" },
                { label: "Tersisa", value: ytdSummary.netSavings, tone: ytdSummary.netSavings >= 0 ? "text-[hsl(var(--foreground))]" : "text-danger" },
              ].map(({ label, value, tone }) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] text-[hsl(var(--muted-foreground))]">{label}</dt>
                  <dd className={`mt-0.5 break-words text-xs font-semibold tabular-nums ${tone}`}>{formatCompactCurrency(value, currency)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </dl>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <div className="order-2 space-y-4 lg:order-1">
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
        </div>

        <div className="order-1 space-y-4 lg:order-2">
          {(pieData.length > 0 || hasIncomeView) && (
            <Card className={sectionCard}>
              <CardHeader className="px-4 pt-4 pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{activeCategoryView === "income" ? "Pemasukan per kategori" : "Pengeluaran per kategori"}</CardTitle>
                  <div className="flex items-center gap-1">
                    {(activeCategoryView === "income" ? incomeCategories.length > 5 : pieData.length > 5) && (
                      <button type="button" onClick={() => setShowAllCategories((value) => !value)} aria-expanded={showAllCategories} className={linkButton}>
                        {showAllCategories ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{showAllCategories ? "Ringkas" : "Semua"}
                      </button>
                    )}
                    {mode === "monthly" && <Link to={`/budgets?month=${monthState.key}`} className={linkButton}>Anggaran</Link>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-1">
                {hasIncomeView && (
                  <SegmentedControl
                    label="Jenis kategori"
                    value={activeCategoryView}
                    options={[{ value: "expense", label: "Pengeluaran" }, { value: "income", label: "Pemasukan" }]}
                    onChange={setCategoryView}
                  />
                )}
                {activeCategoryView === "expense" ? (
                  <section aria-label="Kategori Pengeluaran" className="min-w-0 space-y-3">
                    {pieData.length > 0 ? (
                      <>
                        {visiblePieData.map((entry) => {
                          const prev = prevByName.get(entry.name) ?? 0;
                          const delta = mode === "monthly" && prev > 0 ? Math.round(((entry.value - prev) / prev) * 100) : null;
                          const pct = totalPieValue ? Math.round((entry.value / totalPieValue) * 100) : 0;
                          return (
                            <div key={entry.name} className="space-y-1.5">
                              <div className="flex justify-between gap-2 text-[13px]">
                                <span className="truncate font-semibold">{entry.name}</span>
                                <span className="shrink-0 tabular-nums">
                                  {formatCurrency(entry.value, currency)}
                                  {delta !== null && delta !== 0 && (
                                    <span className={`ml-1 font-semibold ${delta > 0 ? "text-danger" : "text-success"}`}>{delta > 0 ? "+" : "−"}{Math.abs(delta)}%</span>
                                  )}
                                </span>
                              </div>
                              <ProgressBar value={entry.value} max={pieData[0].value} label={`${entry.name} ${pct}% dari pengeluaran`} />
                            </div>
                          );
                        })}
                        {!showAllCategories && pieData.length > visiblePieData.length && (
                          <p className="pt-1 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
                            {pieData.length - visiblePieData.length} kategori lain disembunyikan
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Belum ada data pengeluaran</p>
                    )}
                  </section>
                ) : (
                  <section aria-label="Sumber Pemasukan" className="min-w-0 space-y-3">
                    {incomeCategories.slice(0, showAllCategories ? undefined : 5).map((entry) => {
                      const category = categories.find((c) => c.id === entry.categoryId);
                      const pct = incomeTotal > 0 ? Math.round((entry.amount / incomeTotal) * 100) : 0;
                      return (
                        <div key={entry.categoryId} className="space-y-1.5">
                          <div className="flex justify-between gap-2 text-[13px]">
                            <span className="truncate font-semibold">{category?.name ?? "Lainnya"}</span>
                            <span className="shrink-0 tabular-nums text-success">{formatCurrency(entry.amount, currency)}</span>
                          </div>
                          <ProgressBar value={entry.amount} max={incomeCategories[0].amount} tone="success" label={`${category?.name ?? "Lainnya"} ${pct}% dari pemasukan`} />
                        </div>
                      );
                    })}
                    {!showAllCategories && incomeCategories.length > 5 && (
                      <p className="pt-1 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
                        {incomeCategories.length - 5} kategori lain disembunyikan
                      </p>
                    )}
                  </section>
                )}
              </CardContent>
            </Card>
          )}

          {budgetPct !== null && (
            <Link to={`/budgets?month=${monthState.key}`} className={`${sectionCard} flex min-h-11 items-center gap-3 border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]`}>
              <span className="min-w-0 flex-1 text-sm font-semibold">Anggaran · {budgetPct}% terpakai</span>
              <ChevronRight size={16} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
