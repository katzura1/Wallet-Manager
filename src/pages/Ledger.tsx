import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDownToLine, Printer } from "lucide-react";
import { useSettingsStore, useWalletStore } from "@/stores/walletStore";
import { Button, Card, CardContent, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { getAccountLedger, type AccountLedgerResult } from "@/db/transactions";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";

function formatPlainDate(date: string) {
  return formatDate(date, "dd MMM yyyy");
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function LedgerContent({ embedded = false }: { embedded?: boolean }) {
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

  useEffect(() => {
    void refreshAll();
  }, []);

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
        category?.name ?? (row.transaction.type === "transfer" ? "Transfer" : "-"),
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
    return <EmptyState icon="📒" title="Belum ada akun" description="Buat akun terlebih dulu sebelum melihat ledger per akun." />;
  }

  return (
    <div className={embedded ? "px-4 pt-5 pb-4 space-y-5" : "px-4 pt-5 pb-24 space-y-5"}>
      <Card className="overflow-hidden border-transparent bg-[linear-gradient(135deg,hsl(var(--card))_0%,hsl(var(--surface-2))_100%)]">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Report</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight break-words">Ledger per Akun</h1>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))] break-words">Lihat mutasi, saldo awal, dan saldo berjalan setiap akun.</p>
            </div>
            {!embedded && (
              <Link to="/reports" className="inline-flex h-9 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 px-3.5 text-xs font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] no-print">
                Kembali
              </Link>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))] no-print">
            <Select label="Akun" value={selectedAccountId ?? ""} onChange={(e) => handleAccountChange(e.target.value)}>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.isArchived ? "[Arsip] " : ""}{account.name}
                </option>
              ))}
            </Select>
            <Input label="Dari" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input label="Sampai" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-2 no-print">
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!ledger || ledger.rows.length === 0}>
              <ArrowDownToLine size={14} /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={!ledger || ledger.rows.length === 0}>
              <Printer size={14} /> PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Spinner />
      ) : error ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-500">{error}</p>
          </CardContent>
        </Card>
      ) : ledger && selectedAccount ? (
        <>
          <Card>
            <CardContent className="p-5 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Ringkasan Saldo</p>
                  <p className="mt-1 text-sm font-semibold break-words">{selectedAccount.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Saldo Akhir</p>
                  <p className={`mt-1 text-lg font-bold ${ledger.closingBalance >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {formatCurrency(ledger.closingBalance, currency)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[hsl(var(--surface-2))] px-4 py-3">
                  <span className="text-[hsl(var(--muted-foreground))]">Saldo Awal</span>
                  <span className="font-semibold">{formatCurrency(ledger.openingBalance, currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[hsl(var(--surface-2))] px-4 py-3">
                  <span className="text-[hsl(var(--muted-foreground))]">Saldo Masuk</span>
                  <span className="font-semibold text-emerald-500">{formatCurrency(ledger.totalCredit, currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[hsl(var(--surface-2))] px-4 py-3">
                  <span className="text-[hsl(var(--muted-foreground))]">Saldo Keluar</span>
                  <span className="font-semibold text-red-500">{formatCurrency(ledger.totalDebit, currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[hsl(var(--surface-2))] px-4 py-3">
                  <span className="text-[hsl(var(--muted-foreground))]">Saldo Akhir</span>
                  <span className={`font-semibold ${ledger.closingBalance >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {formatCurrency(ledger.closingBalance, currency)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold break-words">{selectedAccount.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {dateFrom || "Awal"} sampai {dateTo || "Hari ini"} • {ledger.rows.length} transaksi
                  </p>
                </div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">
                  Saldo berjalan dihitung setelah setiap mutasi.
                </div>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-[hsl(var(--border))] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[hsl(var(--muted-foreground))] [&::-webkit-scrollbar-thumb]:rounded-full">
                {groupedRows.length === 0 ? (
                  <div className="bg-[hsl(var(--card))] p-5 text-sm text-[hsl(var(--muted-foreground))]">
                    Belum ada transaksi pada rentang ini.
                  </div>
                ) : (
                  <table className="w-full divide-y divide-[hsl(var(--border))] text-xs lg:text-sm">
                    <thead className="bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] sticky top-0">
                      <tr>
                        <th className="px-2 sm:px-2.5 py-2 sm:py-2.5 text-left font-semibold">Keterangan</th>
                        <th className="w-24 sm:w-28 px-2 sm:px-2.5 py-2 sm:py-2.5 text-right font-semibold">Mutasi</th>
                        <th className="w-24 sm:w-28 px-2 sm:px-2.5 py-2 sm:py-2.5 text-right font-semibold">Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--card))]">
                      {groupedRows.map(([date, rows]) => (
                        <Fragment key={date}>
                          <tr key={`${date}-group`} className="bg-[hsl(var(--surface-2))]/70">
                            <td className="px-2 sm:px-2.5 py-2 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]" colSpan={3}>
                              {formatPlainDate(date)}
                            </td>
                          </tr>
                          {rows.map((row) => {
                            const category = categories.find((item) => item.id === row.transaction.categoryId);
                            const sourceAccount = accounts.find((item) => item.id === row.transaction.accountId);
                            const targetAccount = accounts.find((item) => item.id === row.transaction.toAccountId);
                            const description = row.transaction.type === "transfer"
                              ? row.signedAmount > 0
                                ? `Transfer masuk dari ${sourceAccount?.name ?? "akun lain"}`
                                : `Transfer keluar ke ${targetAccount?.name ?? "akun lain"}`
                              : row.transaction.note || "Tanpa catatan";
                            const mutationAmount = row.debit > 0 ? row.debit : row.credit;
                            const mutationTone = row.debit > 0 ? "text-red-500" : "text-emerald-500";
                            const mutationLabel = row.debit > 0 ? "db" : "cr";

                            return (
                              <tr key={row.transaction.id} className="align-top">
                                <td className="px-2 sm:px-2.5 py-2 sm:py-2.5 whitespace-normal break-words">
                                  <div className="space-y-1">
                                    <p className="font-medium leading-5 break-words text-xs sm:text-sm">{category?.name ?? (row.transaction.type === "transfer" ? "Transfer" : "-")}</p>
                                    <p className="text-[10px] sm:text-xs text-[hsl(var(--muted-foreground))] break-words">{description}</p>
                                  </div>
                                </td>
                                <td className={`px-2 sm:px-2.5 py-2 sm:py-2.5 text-right whitespace-nowrap font-semibold text-xs sm:text-sm ${mutationTone}`}>
                                  {mutationAmount > 0 ? `${formatCurrency(mutationAmount, currency)} ${mutationLabel}` : "-"}
                                </td>
                                <td className={`px-2 sm:px-2.5 py-2 sm:py-2.5 text-right whitespace-nowrap font-semibold text-xs sm:text-sm ${row.balanceAfter >= 0 ? "text-[hsl(var(--foreground))]" : "text-red-500"}`}>
                                  {formatCurrency(row.balanceAfter, currency)}
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default function Ledger() {
  return <LedgerContent />;
}