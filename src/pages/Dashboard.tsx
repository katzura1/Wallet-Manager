import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useWalletStore, useSettingsStore } from "@/stores/walletStore";
import { Card, CardContent, Modal, Button, Badge } from "@/components/ui";
import { TransactionForm } from "@/components/forms/TransactionForm";
import { AITransactionForm } from "@/components/forms/AITransactionForm";
import { TransactionCard } from "@/components/TransactionCard";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deleteTransaction } from "@/db/transactions";
import { getUpcomingRecurringTransactions } from "@/db/recurring";
import { getBudgetsForMonth } from "@/db/budgets";
import { getCategoryExpenseData } from "@/db/transactions";
import { getCategories } from "@/db/categories";
import { db } from "@/db/db";
import { Plus, Settings, CreditCard, Eye, EyeOff, AlertTriangle, Target, ChevronDown, ChevronUp } from "lucide-react";
import type { RecurringTransaction, Transaction } from "@/types";

interface BudgetAlertItem {
  categoryId: number;
  categoryName: string;
  categoryIcon: string;
  spent: number;
  budget: number;
  percentage: number;
  level: "warning" | "danger";
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
  const [accountsCollapsed, setAccountsCollapsed] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(false);

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
    const [recurring, budgets, expenseByCategory, allCategories] = await Promise.all([
      getUpcomingRecurringTransactions(),
      getBudgetsForMonth(monthKey),
      getCategoryExpenseData(now.getFullYear(), now.getMonth() + 1),
      getCategories(),
    ]);
    setRecurringItems(recurring);
    const alerts = budgets
      .map((budget) => {
        const spent = expenseByCategory[budget.categoryId] ?? 0;
        const percentage = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0;
        if (percentage < 80) return null;
        const category = allCategories.find((item) => item.id === budget.categoryId);
        return {
          categoryId: budget.categoryId,
          categoryName: category?.name ?? "Kategori",
          categoryIcon: category?.icon ?? "📦",
          spent,
          budget: budget.amount,
          percentage,
          level: percentage >= 100 ? "danger" : "warning",
        } satisfies BudgetAlertItem;
      })
      .filter((item): item is BudgetAlertItem => item !== null)
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3);
    setBudgetAlerts(alerts);
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

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="pt-2 pb-1 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Total Saldo</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {balanceHidden ? <span className="tracking-widest text-2xl">••••••</span> : formatCurrency(totalBalance, currency)}
          </h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{formatDate(now.toISOString(), "EEEE, dd MMMM yyyy")}</p>
        </div>
        <div className="flex items-center gap-1 pt-1">
          <button onClick={toggleBalanceHidden} className="p-2 rounded-xl hover:bg-[hsl(var(--accent))] transition-colors text-[hsl(var(--muted-foreground))]">
            {balanceHidden ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
          <Link to="/accounts" className="p-2 rounded-xl hover:bg-[hsl(var(--accent))] transition-colors text-[hsl(var(--muted-foreground))]">
            <CreditCard size={20} />
          </Link>
          <Link to="/settings" className="p-2 rounded-xl hover:bg-[hsl(var(--accent))] transition-colors text-[hsl(var(--muted-foreground))]">
            <Settings size={20} />
          </Link>
        </div>
      </div>

      {/* Monthly Summary */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Pemasukan</span>
            </div>
            <p className="font-bold text-emerald-500 text-sm leading-tight">{formatCurrency(monthIncome, currency)}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">bulan ini</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Pengeluaran</span>
            </div>
            <p className="font-bold text-amber-500 text-sm leading-tight">{formatCurrency(monthExpense, currency)}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">bulan ini</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full inline-block ${monthIncome - monthExpense >= 0 ? "bg-indigo-500" : "bg-red-500"}`} />
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Net</span>
            </div>
            <p className={`font-bold text-sm leading-tight ${monthIncome - monthExpense >= 0 ? "text-indigo-600 dark:text-indigo-400" : "text-red-600 dark:text-red-400"}`}>
              {formatCurrency(Math.abs(monthIncome - monthExpense), currency)}
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">bulan ini</p>
          </CardContent>
        </Card>
      </div>

      {accounts.length > 0 && (nextBill || topBudgetAlert) && (
        <Card className="overflow-hidden">
          <CardContent className="p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Perlu Perhatian</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  {upcomingBills.length > 0 && budgetAlerts.length > 0
                    ? `${upcomingBills.length} tagihan dan ${budgetAlerts.length} alert budget aktif`
                    : upcomingBills.length > 0
                      ? `${upcomingBills.length} tagihan terdekat senilai ${formatCurrency(upcomingBillsTotal, currency)}`
                      : `${budgetAlerts.length} kategori mendekati limit bulan ini`}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
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
              </div>
            </div>

            <div className="grid gap-2">
              {nextBill && (() => {
                const dueStatus = getDueStatus(nextBill.nextDate);
                const categoryLabel = getCategoryName(nextBill.categoryId);
                return (
                  <Link
                    to="/transactions?tab=recurring"
                    className="rounded-2xl border border-[hsl(var(--border))] px-3 py-2.5 hover:bg-[hsl(var(--accent))] transition-colors"
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
                return (
                  <Link
                    to="/reports"
                    className="rounded-2xl border border-[hsl(var(--border))] px-3 py-2.5 hover:bg-[hsl(var(--accent))] transition-colors"
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account Cards */}
      {accounts.length > 0 && (
        <div>
          <button
            onClick={() => setAccountsCollapsed((value) => !value)}
            className="w-full flex items-center justify-between gap-3 mb-2"
          >
            <div>
              <p className="text-sm font-semibold text-left">Akun Kamu</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] text-left">
                {accounts.length} akun aktif
              </p>
            </div>
            <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
              <span className="text-xs">{accountsCollapsed ? "Buka" : "Tutup"}</span>
              {accountsCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>
          </button>

          {!accountsCollapsed && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex-none w-36 rounded-2xl p-3 text-white relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${account.color}, ${account.color}cc)` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xl">{account.icon}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/15 uppercase tracking-wide">{account.type}</span>
                  </div>
                  <p className="text-xs opacity-80 mt-3 truncate">{account.name}</p>
                  <p className="font-bold text-sm mt-0.5 leading-tight">{formatCurrency(account.currentBalance, currency)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Pengeluaran", type: "expense" as const, emoji: "💸", bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-600" },
          { label: "Pemasukan", type: "income" as const, emoji: "💰", bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600" },
          { label: "Transfer", type: "transfer" as const, emoji: "↔️", bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-600" },
          { label: "AI", type: "ai" as const, emoji: "✨", bg: "bg-indigo-50 dark:bg-indigo-900/20", text: "text-indigo-600 dark:text-indigo-400" },
        ].map(({ label, type, emoji, bg, text }) => (
          <button
            key={type}
            onClick={() => {
              if (type === "ai") {
                setAiOpen(true);
                return;
              }
              setDefaultType(type);
              setAddOpen(true);
            }}
            className={`${bg} rounded-2xl p-2.5 flex flex-col items-center gap-1 transition-transform active:scale-95 min-h-20 justify-center`}
          >
            <span className="text-xl">{emoji}</span>
            <span className={`text-xs font-medium ${text}`}>{label}</span>
          </button>
        ))}
      </div>

      {/* Recent Transactions */}
      {recentTxs.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-semibold">Transaksi Terbaru</p>
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


