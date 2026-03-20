import { useEffect, useState } from "react";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui";
import { getMonthlyChartData, getCategoryExpenseData, getMonthlySummary, getTotalBalanceHistory, getSummaryBetween, getCategoryExpenseBetween } from "@/db/transactions";
import { getBudgetsForMonth } from "@/db/budgets";
import { BudgetForm } from "@/components/forms/BudgetForm";
import { formatCurrency } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Target } from "lucide-react";
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
  const [chartData, setChartData] = useState<ChartBar[]>([]);
  const [pieData, setPieData] = useState<PieEntry[]>([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [balanceHistory, setBalanceHistory] = useState<{ month: string; balance: number }[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetFormOpen, setBudgetFormOpen] = useState(false);
  const [budgetCategoryId, setBudgetCategoryId] = useState<number | undefined>();
  const [budgetInitialAmount, setBudgetInitialAmount] = useState<number>(0);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  // Range mode
  const [mode, setMode] = useState<"monthly" | "range">("monthly");
  const todayStr = now.toISOString().split("T")[0];
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayStr);

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    void loadChartData();
  }, [selectedYear, selectedMonth, categories, mode, dateFrom, dateTo]);

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
      const pie: PieEntry[] = mergePieEntries(
        Object.entries(catMap).map(([catId, amount]) => {
          const cat = categories.find((c) => c.id === Number(catId));
          return { name: cat?.name ?? "Lainnya", value: amount, color: cat?.color ?? "#6b7280", icon: cat?.icon ?? "📦" };
        })
      ).sort((a, b) => b.value - a.value);
      setPieData(pie);
      return;
    }

    const [bars, catMapM, sumM, history, bdgtList] = await Promise.all([
      getMonthlyChartData(6),
      getCategoryExpenseData(selectedYear, selectedMonth),
      getMonthlySummary(selectedYear, selectedMonth),
      getTotalBalanceHistory(6),
      getBudgetsForMonth(monthStr),
    ]);
    setChartData(bars);
    setSummary(sumM);
    setBalanceHistory(history);
    setBudgets(bdgtList);
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
  }

  function openBudgetForm(catId: number) {
    const existing = budgets.find((b) => b.categoryId === catId);
    setBudgetCategoryId(catId);
    setBudgetInitialAmount(existing?.amount ?? 0);
    setBudgetFormOpen(true);
  }

  const currentMonth = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

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

  return (
    <div className="p-4 space-y-5">
      <div className="pt-2">
        <h1 className="text-xl font-bold">Laporan</h1>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl border border-[hsl(var(--border))] overflow-hidden text-sm">
        <button
          onClick={() => setMode("monthly")}
          className={`flex-1 py-2 font-medium transition-colors ${mode === "monthly" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
        >
          📅 Bulanan
        </button>
        <button
          onClick={() => setMode("range")}
          className={`flex-1 py-2 font-medium transition-colors ${mode === "range" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
        >
          📆 Rentang
        </button>
      </div>

      {/* Month navigator — only in monthly mode */}
      {mode === "monthly" && (
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-[hsl(var(--accent))]"><ChevronLeft size={18} /></button>
          <p className="font-semibold capitalize">{monthLabel}</p>
          <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-[hsl(var(--accent))]"><ChevronRight size={18} /></button>
        </div>
      )}

      {/* Date range picker — only in range mode */}
      {mode === "range" && (
        <div className="flex items-center gap-2">
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
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Pemasukan</p>
            <p className="font-bold text-sm text-emerald-500 mt-0.5">{formatCurrency(summary.income, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Pengeluaran</p>
            <p className="font-bold text-sm text-red-500 mt-0.5">{formatCurrency(summary.expense, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Net</p>
            <p className={`font-bold text-sm mt-0.5 ${summary.net >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {formatCurrency(summary.net, currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow Bar Chart — monthly only */}
      {mode === "monthly" && <Card>
        <CardHeader>
          <CardTitle>Arus Kas 6 Bulan</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
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

      {/* Category Pie Chart */}
      {pieData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pengeluaran per Kategori</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <ResponsiveContainer width="100%" height={220}>
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
                <Legend formatter={(val) => <span style={{ fontSize: 11 }}>{val}</span>} iconSize={8} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>

            {/* Category table */}
            <div className="space-y-2 mt-2">
              {pieData.map((entry) => {
                const total = pieData.reduce((s, e) => s + e.value, 0);
                const pct = total ? Math.round((entry.value / total) * 100) : 0;
                return (
                  <div key={entry.name} className="flex items-center gap-3">
                    <span className="text-base">{entry.icon}</span>
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span>{entry.name}</span>
                        <span className="font-medium">{formatCurrency(entry.value, currency)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[hsl(var(--border))]">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: entry.color }} />
                      </div>
                    </div>
                    <span className="text-xs text-[hsl(var(--muted-foreground))] w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account balances */}
      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Saldo per Akun</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            {accounts
              .filter((a) => !a.isArchived)
              .map((acc) => {
                const totalAll = accounts.filter((a) => !a.isArchived).reduce((s, a) => s + Math.abs(a.currentBalance), 0);
                const pct = totalAll ? Math.round((Math.abs(acc.currentBalance) / totalAll) * 100) : 0;
                return (
                  <div key={acc.id} className="flex items-center gap-3">
                    <span className="text-base">{acc.icon}</span>
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span>{acc.name}</span>
                        <span className="font-medium">{formatCurrency(acc.currentBalance, currency)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[hsl(var(--border))]">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: acc.color }} />
                      </div>
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}

      {/* Budget vs Actuals — monthly only */}
      {mode === "monthly" && pieData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Anggaran Bulan Ini</CardTitle>
              <button
                onClick={() => { setBudgetCategoryId(undefined); setBudgetInitialAmount(0); setBudgetFormOpen(true); }}
                className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium"
              >
                <Target size={13} /> + Atur
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            {pieData.map((entry) => {
              const cat = categories.find((c) => c.name === entry.name);
              const budget = cat ? budgets.find((b) => b.categoryId === cat.id) : undefined;
              const pct = budget ? Math.min(Math.round((entry.value / budget.amount) * 100), 100) : 0;
              const over = budget && entry.value > budget.amount;
              return (
                <div key={entry.name} className="flex items-center gap-3">
                  <span className="text-base">{entry.icon}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span>{entry.name}</span>
                      <span className="font-medium">
                        {formatCurrency(entry.value, currency)}
                        {budget && <span className={`ml-1 ${over ? "text-red-500" : "text-[hsl(var(--muted-foreground))]"}`}>/ {formatCurrency(budget.amount, currency)}</span>}
                      </span>
                    </div>
                    {budget ? (
                      <div className="h-1.5 rounded-full bg-[hsl(var(--border))]">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%`, background: over ? "#ef4444" : pct > 80 ? "#f59e0b" : entry.color }}
                        />
                      </div>
                    ) : (
                      <div className="h-1.5 rounded-full bg-[hsl(var(--border))] relative">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `100%`, background: `${entry.color}44` }} />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => cat && openBudgetForm(cat.id!)}
                    className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                  >
                    <Target size={12} />
                  </button>
                </div>
              );
            })}
            {budgets.length === 0 && (
              <p className="text-xs text-[hsl(var(--muted-foreground))] text-center py-2">
                Tap <Target size={11} className="inline" /> di setiap baris untuk mengatur batas anggaran
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
      />
    </div>
  );
}
