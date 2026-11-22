import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDownToLine, CalendarRange, Printer } from "lucide-react";
import { useSettingsStore, useWalletStore } from "@/stores/walletStore";
import { Button, Card, EmptyState, Input, PageHeader, SegmentedControl, Select, Sheet, Spinner } from "@/components/ui";
import { getAccountLedger, type AccountLedgerResult } from "@/db/transactions";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";

function formatPlainDate(date: string) {
  return formatDate(date, "dd MMM yyyy");
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function ReportTabs({ value }: { value: "overview" | "ledger" }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  function handleChange(tab: "overview" | "ledger") {
    const nextParams = new URLSearchParams(searchParams);
    if (tab === "overview") nextParams.delete("tab");
    else nextParams.set("tab", tab);
    const query = nextParams.toString();
    navigate(`/reports${query ? `?${query}` : ""}`, { replace: true });
  }
  return (
    <div className="no-print sm:max-w-xs">
      <SegmentedControl
        label="Tampilan laporan"
        value={value}
        options={[{ value: "overview", label: "Ringkasan" }, { value: "ledger", label: "Buku besar" }]}
        onChange={handleChange}
      />
    </div>
  );
}

export function LedgerContent() {
  const { accounts, categories, refreshAll } = useWalletStore();
  const { currency } = useSettingsStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(() => {
    const parsed = Number(searchParams.get("account"));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  });
  const [dateFrom, setDateFrom] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`);
  const [dateTo, setDateTo] = useState(() => todayISO());
  const [ledger, setLedger] = useState<AccountLedgerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodOpen, setPeriodOpen] = useState(false);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const accountOptions = useMemo(
    () => [...accounts].sort((a, b) => Number(a.isArchived) - Number(b.isArchived) || a.name.localeCompare(b.name)),
    [accounts],
  );
  const selectedAccount = selectedAccountId ? accountOptions.find((account) => account.id === selectedAccountId) ?? null : null;

  useEffect(() => {
    if (accountOptions.length === 0) {
      setSelectedAccountId(null);
      return;
    }

    const queryAccountId = Number(searchParams.get("account"));
    const queryAccountExists = Number.isFinite(queryAccountId) && accountOptions.some((account) => account.id === queryAccountId);

    if (selectedAccountId && accountOptions.some((account) => account.id === selectedAccountId)) {
      return;
    }

    setSelectedAccountId(queryAccountExists ? queryAccountId : accountOptions[0].id ?? null);
  }, [accountOptions, searchParams, selectedAccountId]);

  useEffect(() => {
    if (selectedAccountId === null) {
      setLedger(null);
      setLoading(false);
      return;
    }
    const accountId: number = selectedAccountId;

    let cancelled = false;

    async function loadLedger() {
      setLoading(true);
      setError(null);
      try {
        const result = await getAccountLedger(accountId, dateFrom || undefined, dateTo || undefined);
        if (!cancelled) {
          setLedger(result);
        }
      } catch {
        if (!cancelled) {
          setError("Gagal memuat ledger akun.");
          setLedger(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadLedger();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, selectedAccountId]);

  function handleAccountChange(value: string) {
    const nextId = Number(value);
    if (!Number.isFinite(nextId)) return;
    setSelectedAccountId(nextId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("account", String(nextId));
    setSearchParams(nextParams);
  }

  function handleExportCsv() {
    if (!ledger || ledger.rows.length === 0) return;

    const accountName = ledger.account.name.replace(/[^\w-]+/g, "_");
    const header = ["Tanggal", "Deskripsi", "Kategori", "Debit", "Kredit", "Saldo"];
    const rows = ledger.rows.map((row) => {
      const category = categories.find((item) => item.id === row.transaction.categoryId);
      const sourceAccount = accounts.find((account) => account.id === row.transaction.accountId);
      const targetAccount = accounts.find((account) => account.id === row.transaction.toAccountId);
      const description = row.transaction.type === "transfer"
        ? row.signedAmount > 0
          ? `Transfer masuk dari ${sourceAccount?.name ?? "akun lain"}`
          : `Transfer keluar ke ${targetAccount?.name ?? "akun lain"}`
        : row.transaction.note || "Tanpa catatan";

      return [
        row.transaction.date,
        description,
        row.transaction.isAdjustment ? "Penyesuaian saldo" : category?.name ?? (row.transaction.type === "transfer" ? "Transfer" : "-"),
        row.debit ? String(row.debit) : "",
        row.credit ? String(row.credit) : "",
        String(row.balanceAfter),
      ].map(csvEscape).join(",");
    });

    const content = [header.map(csvEscape).join(","), ...rows].join("\n");
    const blob = new Blob([`\ufeff${content}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ledger-${accountName}-${dateFrom || "all"}-${dateTo || "all"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleExportPdf() {
    window.print();
  }

  const groupedRows = useMemo(() => {
    const groups = new Map<string, AccountLedgerResult["rows"]>();
    for (const row of ledger?.rows ?? []) {
      const items = groups.get(row.transaction.date) ?? [];
      items.push(row);
      groups.set(row.transaction.date, items);
    }

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [ledger]);

  if (accounts.length === 0) {
    return <EmptyState icon="📒" title="Belum ada akun" description="Buat akun terlebih dulu sebelum melihat buku besar per akun." />;
  }

  const summaryCards = ledger ? [
    { label: "Saldo awal", value: ledger.openingBalance, tone: "text-[hsl(var(--foreground))]" },
    { label: "Total masuk", value: ledger.totalCredit, tone: "text-success" },
    { label: "Total keluar", value: ledger.totalDebit, tone: "text-[hsl(var(--foreground))]" },
    { label: "Saldo akhir", value: ledger.closingBalance, tone: ledger.closingBalance >= 0 ? "text-[hsl(var(--foreground))]" : "text-danger" },
  ] : [];

  const periodLabel = `${dateFrom ? formatDate(dateFrom, "d MMM") : "Awal"} – ${dateTo ? formatDate(dateTo, "d MMM yyyy") : "Hari ini"}`;

  function describe(row: AccountLedgerResult["rows"][number]) {
    const sourceAccount = accounts.find((item) => item.id === row.transaction.accountId);
    const targetAccount = accounts.find((item) => item.id === row.transaction.toAccountId);
    return row.transaction.type === "transfer"
      ? row.signedAmount > 0
        ? `Transfer masuk dari ${sourceAccount?.name ?? "akun lain"}`
        : `Transfer keluar ke ${targetAccount?.name ?? "akun lain"}`
      : row.transaction.note || "Tanpa catatan";
  }

  function categoryLabel(row: AccountLedgerResult["rows"][number]) {
    const category = categories.find((item) => item.id === row.transaction.categoryId);
    return row.transaction.isAdjustment ? "Penyesuaian saldo" : category?.name ?? (row.transaction.type === "transfer" ? "Transfer" : "-");
  }

  return (
    <div className="space-y-4 px-4 pt-5 pb-4 lg:px-0 lg:pt-7">
      <PageHeader
        title="Laporan"
        actions={
          <div className="flex gap-2 no-print">
            <Button variant="outline" aria-label="Ekspor CSV" className="h-11 w-11 px-0 sm:w-auto sm:px-4" onClick={handleExportCsv} disabled={!ledger || ledger.rows.length === 0}>
              <ArrowDownToLine size={16} /> <span className="hidden sm:inline">Ekspor CSV</span>
            </Button>
            <Button variant="outline" aria-label="Cetak / PDF" className="h-11 w-11 px-0 sm:w-auto sm:px-4" onClick={handleExportPdf} disabled={!ledger || ledger.rows.length === 0}>
              <Printer size={16} /> <span className="hidden sm:inline">Cetak / PDF</span>
            </Button>
          </div>
        }
      />
      <ReportTabs value="ledger" />

      <div className="grid grid-cols-2 items-end gap-2 no-print lg:flex lg:justify-start lg:gap-3 [&>div]:min-w-0">
        <Select aria-label="Akun" className="min-h-12 rounded-[14px] px-3 py-2 text-sm font-bold lg:min-w-48" label="Akun" value={selectedAccountId ?? ""} onChange={(e) => handleAccountChange(e.target.value)}>
          {accountOptions.map((account) => (
            <option key={account.id} value={account.id}>
              {account.isArchived ? "[Arsip] " : ""}{account.name}
            </option>
          ))}
        </Select>
        <div className="space-y-1">
          <p className="text-sm font-medium">Periode</p>
          <button
            type="button"
            onClick={() => setPeriodOpen(true)}
            aria-label={`Periode ${periodLabel}`}
            className="flex min-h-12 w-full items-center justify-between gap-2 rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-left text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] lg:min-w-52"
          >
            <span className="truncate">{periodLabel}</span><CalendarRange size={16} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
          </button>
        </div>
      </div>
      <Sheet open={periodOpen} onClose={() => setPeriodOpen(false)} title="Periode">
        <div className="grid grid-cols-2 gap-3">
          <Input aria-label="Dari" className="min-h-11 rounded-xl px-3 py-2" label="Dari" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input aria-label="Sampai" className="min-h-11 rounded-xl px-3 py-2" label="Sampai" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </Sheet>

      {loading ? (
        <Spinner />
      ) : error ? (
        <Card className="p-4">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      ) : ledger && selectedAccount ? (
        <>
          <section aria-label="Ringkasan Saldo" className="space-y-2">
            <h2 className="px-1 text-sm font-semibold break-words">{selectedAccount.name}</h2>
            <dl className="grid grid-cols-2 gap-3 rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 lg:grid-cols-4 lg:gap-4 lg:border-0 lg:bg-transparent lg:p-0">
              {summaryCards.map(({ label, value, tone }) => (
                <div key={label} className="min-w-0 lg:rounded-[18px] lg:border lg:border-[hsl(var(--border))] lg:bg-[hsl(var(--card))] lg:p-4">
                  <dt className="text-xs text-[hsl(var(--muted-foreground))] lg:text-[13px]">{label}</dt>
                  <dd className={`mt-0.5 break-words text-base font-bold tabular-nums lg:text-[22px] lg:font-extrabold ${tone}`}>{formatCurrency(value, currency)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <Card className="space-y-3 overflow-hidden rounded-[18px] p-0">
            <div className="flex flex-col gap-1 px-4 pt-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {dateFrom || "Awal"} sampai {dateTo || "Hari ini"} • {ledger.rows.length} transaksi
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Saldo berjalan dihitung setelah setiap mutasi.</p>
            </div>

            {groupedRows.length === 0 ? (
              <div className="m-4 mt-0 rounded-xl border border-[hsl(var(--border))] p-5 text-sm text-[hsl(var(--muted-foreground))]">
                Belum ada transaksi pada rentang ini.
              </div>
            ) : (
              <>
                <div className="sm:hidden">
                  {[...groupedRows].reverse().map(([date, rows]) => (
                    <section key={date} aria-label={formatPlainDate(date)}>
                      <h3 className="bg-[hsl(var(--surface-2))] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{formatPlainDate(date)}</h3>
                      {[...rows].reverse().map((row) => {
                        const mutationAmount = row.debit > 0 ? row.debit : row.credit;
                        const mutationTone = row.debit > 0 ? "text-[hsl(var(--foreground))]" : "text-success";
                        return (
                          <div key={row.transaction.id} className="flex items-start justify-between gap-3 border-t border-[hsl(var(--border))] px-4 py-2.5">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{categoryLabel(row)}</p>
                              <p className="mt-0.5 break-words text-xs text-[hsl(var(--muted-foreground))]">{describe(row)}</p>
                            </div>
                            <div className="shrink-0 text-right tabular-nums">
                              <p className={`text-sm font-semibold ${mutationTone}`}>{mutationAmount > 0 ? `${row.debit > 0 ? "−" : "+"}${formatCurrency(mutationAmount, currency)}` : "—"}</p>
                              <p className={`mt-0.5 text-xs ${row.balanceAfter < 0 ? "text-danger" : "text-[hsl(var(--muted-foreground))]"}`}>Saldo {formatCurrency(row.balanceAfter, currency)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  ))}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full divide-y divide-[hsl(var(--border))] text-sm">
                    <thead className="bg-[hsl(var(--surface-2))] text-xs text-[hsl(var(--muted-foreground))]">
                      <tr>
                        <th scope="col" className="px-5 py-2.5 text-left font-semibold">Tanggal</th>
                        <th scope="col" className="px-3 py-2.5 text-left font-semibold">Keterangan</th>
                        <th scope="col" className="px-3 py-2.5 text-left font-semibold">Kategori</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-semibold">Masuk</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-semibold">Keluar</th>
                        <th scope="col" className="px-5 py-2.5 text-right font-semibold">Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--card))]">
                      {ledger.rows.map((row) => (
                        <tr key={row.transaction.id} className="align-top">
                          <td className="whitespace-nowrap px-5 py-3 text-[hsl(var(--muted-foreground))]">{formatPlainDate(row.transaction.date)}</td>
                          <td className="min-w-40 break-words px-3 py-3 font-semibold">{describe(row)}</td>
                          <td className="px-3 py-3 text-[hsl(var(--foreground))]">{categoryLabel(row)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-success">{row.credit > 0 ? formatCurrency(row.credit, currency) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{row.debit > 0 ? formatCurrency(row.debit, currency) : "—"}</td>
                          <td className={`whitespace-nowrap px-5 py-3 text-right font-bold tabular-nums ${row.balanceAfter >= 0 ? "text-[hsl(var(--foreground))]" : "text-danger"}`}>{formatCurrency(row.balanceAfter, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default function Ledger() {
  return <LedgerContent />;
}
