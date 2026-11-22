import { Fragment, useCallback, useEffect, useState } from "react";
import { Target } from "lucide-react";
import { useSettingsStore, useWalletStore } from "@/stores/walletStore";
import { Button, EmptyState, IconTile, PageHeader, ProgressBar, Switch } from "@/components/ui";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { BudgetForm } from "@/components/forms/BudgetForm";
import { getCategoryExpenseData } from "@/db/transactions";
import { setBudget } from "@/db/budgets";
import { buildBudgetRows, loadMonthBudgets, type BudgetRow, type MonthBudgets } from "@/lib/budgetRows";
import { useMonth } from "@/lib/useMonth";
import { formatCurrency } from "@/lib/utils";

type Tone = "primary" | "warning" | "danger";
const toneFor = (pct: number): Tone => (pct >= 100 ? "danger" : pct >= 80 ? "warning" : "primary");
const pctClass: Record<Tone, string> = { primary: "text-[hsl(var(--foreground))]", warning: "text-warning", danger: "text-danger" };

export default function Budgets() {
  const { categories, refreshAll } = useWalletStore();
  const { currency } = useSettingsStore();
  const m = useMonth();
  const [data, setData] = useState<MonthBudgets>({ budgets: [], inheritedIds: new Set() });
  const [actuals, setActuals] = useState<Record<number, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formCategoryId, setFormCategoryId] = useState<number | undefined>();
  const [formAmount, setFormAmount] = useState(0);
  const [formRecurring, setFormRecurring] = useState(true);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const { year, month, key } = m;
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [budgets, expense] = await Promise.all([loadMonthBudgets(key, categories), getCategoryExpenseData(year, month)]);
      if (cancelled) return;
      setData(budgets);
      setActuals(expense);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [key, year, month, categories, reloadTick]);

  function openForm(categoryId?: number) {
    const existing = categoryId === undefined ? undefined : data.budgets.find((b) => b.categoryId === categoryId);
    setFormCategoryId(categoryId);
    setFormAmount(existing?.amount ?? 0);
    setFormRecurring(existing?.recurring ?? true);
    setFormOpen(true);
  }

  const rows = buildBudgetRows(categories, data.budgets, data.inheritedIds, actuals, year, month);
  const activeRows = rows.filter((row) => row.actual > 0 || !row.budget);
  const unusedRows = rows.filter((row) => row.budget && row.actual === 0);
  const totals = rows.reduce((acc, row) => (row.budget ? { spent: acc.spent + row.actual, limit: acc.limit + row.budget.amount } : acc), { spent: 0, limit: 0 });
  const remaining = totals.limit - totals.spent;
  const totalPct = totals.limit > 0 ? Math.round((totals.spent / totals.limit) * 100) : 0;
  const totalTone = toneFor(totalPct);

  const today = new Date();
  const daysInMonth = new Date(year, month, 0).getDate();
  const isCurrent = month === today.getMonth() + 1 && year === today.getFullYear();
  const daysLeft = isCurrent ? daysInMonth - today.getDate() : null;
  const usageText = `${totalPct}% terpakai${daysLeft !== null ? ` · ${daysLeft} hari lagi` : ""}`;

  // "Ulangi tiap bulan" mirrors the per-budget recurring flag across this month's explicit budgets.
  const explicit = data.budgets.filter((b) => !data.inheritedIds.has(b.id ?? 0));
  const repeatOn = explicit.every((b) => b.recurring !== false);
  const nextMonthName = new Date(year, month, 1).toLocaleString("id-ID", { month: "long" });
  async function toggleRepeat(value: boolean) {
    await Promise.all(explicit.map((b) => setBudget(b.categoryId, key, b.amount, value)));
    reload();
  }

  const hasRows = rows.length > 0;

  function renderRow(row: BudgetRow) {
    const { category, actual, budget, isInherited, pct, prediction } = row;
    const tone = toneFor(pct);
    const over = !!budget && actual > budget.amount;
    const aturButton = (
      <button
        type="button"
        onClick={() => openForm(category.id!)}
        aria-label={`Atur anggaran ${category.name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      >
        <Target size={16} />
      </button>
    );
    const note = (
      <>
        {isInherited && <span className="rounded-full bg-[hsl(var(--surface-2))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">Inherited</span>}
        {budget && prediction && !over && prediction.predictedExhaustInDays !== null && prediction.predictedExhaustInDays <= 15 && (
          <span className="text-[10px] text-warning">~{prediction.predictedExhaustInDays === 0 ? "habis" : `${prediction.predictedExhaustInDays}d`}</span>
        )}
        {over && prediction && prediction.projectedOverrun > 0 && (
          <span className="text-[10px] text-danger">Proyeksi over {formatCurrency(prediction.projectedOverrun, currency)}</span>
        )}
      </>
    );
    return (
      <>
        {/* Mobile: tile, name, used / limit and a bar */}
        <div className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-4 py-3 last:border-b-0 lg:hidden">
          <IconTile label={category.name} color={category.color} size="sm" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
              <span className="truncate font-semibold">{category.name}</span>
              <span className="tabular-nums text-[hsl(var(--foreground))]">
                {formatCurrency(actual, currency)}
                {budget && <span className={over ? "text-danger" : "text-[hsl(var(--muted-foreground))]"}> / {formatCurrency(budget.amount, currency)}</span>}
              </span>
            </div>
            {budget && <ProgressBar value={actual} max={budget.amount} tone={tone} label={`Anggaran ${category.name}`} />}
            <div className="flex flex-wrap items-center gap-x-2 empty:hidden">{note}</div>
          </div>
          {aturButton}
        </div>
        {/* Desktop: table row */}
        <div className="hidden min-h-[54px] grid-cols-[1.4fr_1fr_1fr_2fr_70px_44px] items-center gap-4 border-b border-[hsl(var(--border))] px-5 text-sm tabular-nums last:border-b-0 lg:grid">
          <span className="flex min-w-0 items-center gap-2.5">
            <IconTile label={category.name} color={category.color} size="sm" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{category.name}</span>
              <span className="flex flex-wrap items-center gap-x-2 empty:hidden">{note}</span>
            </span>
          </span>
          <span className="text-right font-semibold">{formatCurrency(actual, currency)}</span>
          <span className={`text-right ${over ? "text-danger" : "text-[hsl(var(--muted-foreground))]"}`}>{budget ? formatCurrency(budget.amount, currency) : "—"}</span>
          {budget ? <ProgressBar value={actual} max={budget.amount} tone={tone} label={`Anggaran ${category.name}`} /> : <span />}
          <span className={`text-right font-bold ${pctClass[tone]}`}>{budget ? `${pct}%` : ""}</span>
          {aturButton}
        </div>
      </>
    );
  }

  const listCard = "overflow-hidden rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]";

  return (
    <div className="space-y-4 px-4 pt-5 pb-4 lg:px-0 lg:pt-7">
      <PageHeader
        title={<>Anggaran<span className="hidden lg:inline"> {m.monthName}</span></>}
        back="/reports"
        actions={
          <>
            <div className="hidden items-center gap-2 lg:flex">
              <span className="text-[13px] text-[hsl(var(--muted-foreground))]">Ulangi tiap bulan</span>
              <Switch label="Ulangi anggaran tiap bulan" checked={repeatOn} onChange={(v) => void toggleRepeat(v)} disabled={explicit.length === 0} />
            </div>
            <Button className="h-11" onClick={() => openForm()}>+ Atur</Button>
          </>
        }
      />
      <div className="flex justify-center lg:justify-start"><MonthSwitcher label={m.label} shortLabel={m.shortLabel} onPrev={m.prev} onNext={m.next} /></div>

      <section aria-label="Anggaran" className="space-y-4">
        {loaded && !hasRows ? (
          <EmptyState icon="🎯" title="Belum ada anggaran" description="Atur batas pengeluaran per kategori untuk bulan ini." />
        ) : (
          <>
            <section aria-label="Total anggaran" className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <div className="space-y-2.5 lg:hidden">
                <div className="flex items-baseline justify-between text-[13px] text-[hsl(var(--muted-foreground))]">
                  <span>Terpakai</span><span className="tabular-nums">dari {formatCurrency(totals.limit, currency)}</span>
                </div>
                <p className="break-words text-3xl font-extrabold tabular-nums tracking-tight">{formatCurrency(totals.spent, currency)}</p>
                <ProgressBar value={totals.spent} max={totals.limit} tone={totalTone} label="Total anggaran terpakai" />
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  <span className={remaining < 0 ? "text-danger" : ""}>Sisa {formatCurrency(remaining, currency)}</span> · {usageText}
                </p>
              </div>
              <dl className="hidden items-center gap-5 lg:grid lg:grid-cols-[repeat(3,minmax(0,1fr))_2fr]">
                <div><dt className="text-[13px] text-[hsl(var(--muted-foreground))]">Terpakai</dt><dd className="mt-0.5 break-words text-2xl font-extrabold tabular-nums">{formatCurrency(totals.spent, currency)}</dd></div>
                <div><dt className="text-[13px] text-[hsl(var(--muted-foreground))]">Batas</dt><dd className="mt-0.5 break-words text-2xl font-extrabold tabular-nums">{formatCurrency(totals.limit, currency)}</dd></div>
                <div><dt className="text-[13px] text-[hsl(var(--muted-foreground))]">Sisa</dt><dd className={`mt-0.5 break-words text-2xl font-extrabold tabular-nums ${remaining < 0 ? "text-danger" : "text-success"}`}>{formatCurrency(remaining, currency)}</dd></div>
                <div className="space-y-1.5">
                  <ProgressBar value={totals.spent} max={totals.limit} tone={totalTone} label="Total anggaran terpakai" />
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{usageText}</p>
                </div>
              </dl>
            </section>

            <div className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-1 pl-4 pr-2 lg:hidden">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Ulangi tiap bulan</span>
                <span className="block text-xs text-[hsl(var(--muted-foreground))]">Anggaran otomatis dibawa ke {nextMonthName}</span>
              </span>
              <Switch label="Ulangi anggaran tiap bulan" checked={repeatOn} onChange={(v) => void toggleRepeat(v)} disabled={explicit.length === 0} />
            </div>

            <section aria-label="Anggaran per kategori" className={listCard}>
              <div className="hidden grid-cols-[1.4fr_1fr_1fr_2fr_70px_44px] gap-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-5 py-2.5 text-xs font-semibold text-[hsl(var(--muted-foreground))] lg:grid">
                <span>Kategori</span><span className="text-right">Terpakai</span><span className="text-right">Batas</span><span>Progres</span><span className="text-right">%</span><span />
              </div>
              {activeRows.map((row) => <Fragment key={row.category.id}>{renderRow(row)}</Fragment>)}
              {unusedRows.length > 0 && (
                <>
                  <div className="flex items-center justify-between gap-3 bg-[hsl(var(--surface-2))] px-4 py-2 text-xs font-medium text-[hsl(var(--muted-foreground))] lg:px-5">
                    <p>Belum terpakai bulan ini</p><span>{unusedRows.length} kategori</span>
                  </div>
                  {unusedRows.map((row) => <Fragment key={row.category.id}>{renderRow(row)}</Fragment>)}
                </>
              )}
            </section>
            <p className="hidden text-xs text-[hsl(var(--muted-foreground))] lg:block">Anggaran dengan &ldquo;Ulangi tiap bulan&rdquo; otomatis berlaku untuk bulan berikutnya sampai diubah.</p>
          </>
        )}
      </section>

      <BudgetForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { reload(); setFormOpen(false); }}
        categories={categories}
        month={key}
        initialCategoryId={formCategoryId}
        initialAmount={formAmount}
        initialRecurring={formRecurring}
      />
    </div>
  );
}
