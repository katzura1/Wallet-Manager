import { useCallback, useEffect, useRef, useState } from "react";
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ConfirmDialog, Modal, Sheet, Spinner, PageHeader } from "@/components/ui";
import { FieldRow, NoteLine, RowsCard, SubmitButton } from "@/components/forms/formParts";
import { dateInputCls, openDatePicker, rowLabelCls, textInputCls } from "@/components/forms/formStyles";
import { cn, formatCurrency, formatNumberWithSeparator } from "@/lib/utils";
import { getAssets, addAsset, updateAsset, deleteAsset, savePortfolioSnapshot, getPortfolioHistory, saveSyncLog, getAssetPriceHistory, backfillPortfolioHistoryUsd, FOREIGN_CURRENCIES } from "@/db/assets";
import { syncAllPrices, searchCoins, anyPriceStale, getUsdIdr, type CoinSearchResult } from "@/services/priceSync";
import { db } from "@/db/db";
import { Plus, Search, Eye, EyeOff, Clock, ChevronDown, ChevronUp, Pencil, Trash2, RefreshCw, X } from "lucide-react";
import type { Asset, AssetPrice, AssetType, PortfolioHistory } from "@/types";
import { usePageAction } from "@/components/layout/appLayoutContext";
import { getPortfolioMetrics } from "@/lib/portfolioMetrics";

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PORTFOLIO_CURRENCY = "IDR";
const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  crypto: "₿ Kripto", stock_us: "🇺🇸 Saham AS", stock_idx: "🇮🇩 Saham IDX", stock: "🇺🇸 Saham AS",
  gold_physical: "🥇 Emas Fisik", gold_digital: "🥇 Emas Digital", mutual_fund: "📈 Reksa Dana",
  deposito: "🏦 Deposito", foreign_currency: "💱 Mata Uang Asing",
};

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "crypto", label: "Kripto" },
  { value: "stock_us", label: "Saham AS" },
  { value: "stock_idx", label: "Saham IDX" },
  { value: "gold_physical", label: "Emas fisik" },
  { value: "gold_digital", label: "Emas digital" },
  { value: "mutual_fund", label: "Reksa dana" },
  { value: "deposito", label: "Deposito" },
  { value: "foreign_currency", label: "Valas" },
];

function quantityUnit(type: AssetType, symbol: string): string {
  if (type === "gold_physical" || type === "gold_digital") return "g";
  if (type === "stock_us" || type === "stock_idx" || type === "stock") return "lembar";
  if (type === "mutual_fund") return "unit penyertaan";
  if (type === "foreign_currency") return symbol || "unit";
  if (type === "deposito") return "deposito";
  return "unit";
}

function quantityLabel(type: AssetType, symbol: string): string {
  return `Jumlah (${quantityUnit(type, symbol)})`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function gainCls(n: number): string {
  return n >= 0 ? "text-success" : "text-danger";
}
function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} mnt`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam`;
  return `${Math.floor(h / 24)} hari`;
}

// ─── Asset Form ───────────────────────────────────────────────────────────────

interface AssetFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  existing?: Asset;
  hidden?: boolean;
}

function AssetForm({ open, onClose, onSaved, existing, hidden }: AssetFormProps) {
  const [type, setType] = useState<AssetType>(existing?.type ?? "crypto");
  const [name, setName] = useState(existing?.name ?? "");
  const [symbol, setSymbol] = useState(existing?.symbol ?? "");
  const [coinGeckoId, setCoinGeckoId] = useState(existing?.coinGeckoId ?? "");
  const [quantity, setQuantity] = useState(String(existing?.quantity ?? ""));
  const [avgBuyPrice, setAvgBuyPrice] = useState(String(existing?.avgBuyPrice ?? ""));
  const [manualPrice, setManualPrice] = useState(String(existing?.manualPriceIdr ?? ""));

  // Deposito fields
  const [depositInitial, setDepositInitial] = useState(String(existing?.avgBuyPrice ?? ""));
  const [interestRate, setInterestRate] = useState(String(existing?.interestRatePerYear ?? ""));
  const [depositStartDate, setDepositStartDate] = useState(existing?.depositStartDate ?? "");
  const [depositEndDate, setDepositEndDate] = useState(existing?.depositEndDate ?? "");

  // Foreign currency field
  const [selectedCurrency, setSelectedCurrency] = useState(existing?.symbol ?? "");

  // Coin search (crypto only)
  const [coinSearch, setCoinSearch] = useState(existing?.name ?? "");
  const [coinResults, setCoinResults] = useState<CoinSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Debounced coin search
  useEffect(() => {
    if (type !== "crypto" || existing) {
      setCoinResults([]);
      return;
    }
    if (!coinSearch.trim()) {
      setCoinResults([]);
      return;
    }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchCoins(coinSearch);
        setCoinResults(results);
        setShowResults(true);
      } catch {
        setCoinResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => {
      if (searchRef.current) clearTimeout(searchRef.current);
    };
  }, [coinSearch, type, existing]);

  function selectCoin(coin: CoinSearchResult) {
    setName(coin.name);
    setSymbol(coin.symbol);
    setCoinGeckoId(coin.id);
    setCoinSearch(coin.name);
    setCoinResults([]);
    setShowResults(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !symbol.trim()) { setError("Nama dan simbol wajib diisi"); return; }
    // For deposito, quantity is always 1 and locked, skip check
    if (type !== "deposito" && (!Number(quantity) || Number(quantity) <= 0)) { setError("Jumlah harus > 0"); return; }

    // For deposito, validate the auto-calculation fields
    if (type === "deposito") {
      if (!Number(depositInitial) || Number(depositInitial) <= 0) { setError("Pokok deposito harus > 0"); return; }
      if (!interestRate.trim() || !Number.isFinite(Number(interestRate)) || Number(interestRate) < 0) { setError("Bunga per tahun harus >= 0"); return; }
      if (!depositStartDate) { setError("Tanggal mulai wajib diisi"); return; }
      if (!depositEndDate) { setError("Tanggal akhir wajib diisi"); return; }
      if (depositEndDate < depositStartDate) { setError("Tanggal akhir tidak boleh sebelum tanggal mulai"); return; }
    } else if (!Number(avgBuyPrice) || Number(avgBuyPrice) <= 0) {
      setError("Harga beli rata-rata harus > 0"); return;
    }

    setLoading(true);
    try {
      // Build data object ensuring required fields are present
      const baseData = {
        type,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        quantity: type === "deposito" ? 1 : Number(quantity),
        coinGeckoId: coinGeckoId.trim() || undefined,
        avgBuyPrice: type === "deposito" ? Number(depositInitial) : Number(avgBuyPrice),
        manualPriceIdr: type === "deposito" ? undefined : (manualPrice ? Number(manualPrice) : undefined),
      };

      const data: Omit<Asset, "id" | "createdAt" | "updatedAt"> = {
        ...baseData,
        ...(type === "deposito" ? {
          interestRatePerYear: Number(interestRate),
          depositStartDate,
          depositEndDate,
        } : {}),
      };

      if (existing?.id) {
        await updateAsset(existing.id, data);
      } else {
        await addAsset(data);
      }
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  function resetForType(next: AssetType) {
    setType(next);
    setName("");
    setSymbol("");
    setCoinGeckoId("");
    setCoinSearch("");
    setQuantity("");
    setAvgBuyPrice("");
    setManualPrice("");
    setDepositInitial("");
    setInterestRate("");
    setDepositStartDate("");
    setDepositEndDate("");
    setSelectedCurrency("");
    setCoinResults([]);
    setError("");
  }

  const textRow = (label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
    <FieldRow label={label}>
      <input type="text" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => { onChange(e.target.value); setError(""); }} className={textInputCls} />
    </FieldRow>
  );
  const moneyRow = (label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
    <FieldRow label={label}>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        placeholder={placeholder}
        value={formatNumberWithSeparator(value)}
        onChange={(e) => { onChange(e.target.value.replace(/\D/g, "")); setError(""); }}
        className={`${textInputCls} tabular-nums`}
      />
    </FieldRow>
  );

  const showStockUs = (type === "stock_us" || type === "stock") && !existing;
  const showStockIdx = type === "stock_idx" && !existing;
  const showGold = (type === "gold_physical" || type === "gold_digital") && !existing;
  const showFund = type === "mutual_fund" && !existing;
  const showForex = type === "foreign_currency" && !existing;
  const showCryptoPicked = type === "crypto" && !existing && (name || symbol);
  const quantityNum = Number(quantity) || 0;
  const costBasisPreview = type === "deposito" ? Number(depositInitial) || 0 : quantityNum * (Number(avgBuyPrice) || 0);
  const valuePreview = type === "mutual_fund" && manualPrice ? quantityNum * Number(manualPrice) : undefined;
  const showPreview = costBasisPreview > 0;
  const mask = (value: number) => (hidden ? "•••" : formatCurrency(value, PORTFOLIO_CURRENCY));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? "Edit aset" : "Tambah aset"}
      closePosition="left"
      footer={<SubmitButton form="asset-form" disabled={loading}>{loading ? "Menyimpan…" : existing ? "Simpan perubahan" : "Tambah ke portofolio"}</SubmitButton>}
    >
      <form id="asset-form" onSubmit={handleSubmit} className="space-y-3.5">
        {/* Type selector (locked when editing) */}
        {!existing ? (
          <div role="radiogroup" aria-label="Jenis aset" className="flex flex-wrap gap-1.5">
            {ASSET_TYPE_OPTIONS.map((o) => {
              const checked = type === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => { if (!checked) resetForType(o.value); }}
                  className={cn(
                    "min-h-11 rounded-full px-3.5 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                    checked ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : "border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm">
            <span className="font-semibold">{existing.symbol}</span>
            <span className="min-w-0 truncate text-[hsl(var(--muted-foreground))]">{existing.name}</span>
            <span className="ml-auto shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{ASSET_TYPE_LABELS[existing.type]}</span>
          </div>
        )}

        {/* Crypto: coin search */}
        {type === "crypto" && !existing && (
          <div className="flex flex-col gap-1.5">
            <label className="flex h-12 items-center gap-2.5 rounded-[14px] border-2 border-[hsl(var(--primary))] bg-[hsl(var(--card))] px-3.5">
              <Search size={18} aria-hidden="true" className="shrink-0 text-[hsl(var(--muted-foreground))]" />
              <input
                type="text"
                aria-label="Cari koin"
                placeholder="Cari nama koin (mis. Bitcoin, Ethereum…)"
                value={coinSearch}
                onChange={(e) => { setCoinSearch(e.target.value); setShowResults(true); }}
                onFocus={() => setShowResults(true)}
                className="min-w-0 flex-1 bg-transparent p-0 text-[15px] font-semibold placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none"
              />
              {searching && <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))] animate-pulse">Cari…</span>}
            </label>
            {showResults && coinResults.length > 0 && (
              <ul className="max-h-52 divide-y divide-[hsl(var(--border))] overflow-y-auto rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                {coinResults.map((coin) => (
                  <li key={coin.id}>
                    <button type="button" onClick={() => selectCoin(coin)} className="flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]">
                      <img src={coin.thumb} alt="" className="h-5 w-5 rounded-full" />
                      <span className="flex-1 truncate font-semibold">{coin.name}</span>
                      <span className="shrink-0 font-bold text-[hsl(var(--muted-foreground))]">{coin.symbol}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <RowsCard>
          {showCryptoPicked && (
            <div className="flex min-h-[52px] items-center gap-3 px-4 text-sm">
              <span className={rowLabelCls}>Terpilih</span>
              <span className="min-w-0 flex-1 truncate text-right"><span className="font-bold">{symbol}</span> <span className="text-[hsl(var(--muted-foreground))]">{name}</span></span>
            </div>
          )}
          {showStockUs && (
            <>
              {textRow("Kode ticker AS", symbol, (v) => setSymbol(v.toUpperCase()), "AAPL")}
              {textRow("Nama perusahaan", name, setName, "Apple Inc")}
            </>
          )}
          {showStockIdx && (
            <>
              {textRow("Kode saham IDX", symbol, (v) => setSymbol(v.toUpperCase()), "BBCA")}
              {textRow("Nama perusahaan", name, setName, "Bank Central Asia")}
            </>
          )}
          {showGold && textRow("Nama / label", name, (v) => { setName(v); setSymbol(v.replace(/\s+/g, "_").toUpperCase()); }, type === "gold_physical" ? "Emas Antam 10g" : "Pluang Gold")}
          {showFund && (
            <>
              {textRow("Nama reksa dana", name, setName, "Schroder Dana Prestasi Plus")}
              {textRow("Kode (bebas)", symbol, (v) => setSymbol(v.toUpperCase()), "SDP")}
            </>
          )}
          {type === "deposito" && (
            <>
              {textRow("Nama bank / label", name, setName, "BCA Deposito 12 Bulan")}
              {textRow("Kode (bebas)", symbol, (v) => setSymbol(v.toUpperCase()), "DEP_BCA")}
              {moneyRow(`Pokok deposito (${PORTFOLIO_CURRENCY})`, depositInitial, setDepositInitial, "10.000.000")}
              <FieldRow label="Bunga per tahun (%)">
                <input type="number" inputMode="decimal" step="0.1" aria-label="Bunga per tahun (%)" placeholder="4.5" value={interestRate} onChange={(e) => { setInterestRate(e.target.value); setError(""); }} className={`${textInputCls} tabular-nums`} />
              </FieldRow>
              <FieldRow label="Tanggal mulai">
                <input type="date" aria-label="Tanggal mulai" value={depositStartDate} onChange={(e) => { setDepositStartDate(e.target.value); setError(""); }} onClick={openDatePicker} className={dateInputCls} />
              </FieldRow>
              <FieldRow label="Tanggal akhir">
                <input type="date" aria-label="Tanggal akhir" value={depositEndDate} onChange={(e) => { setDepositEndDate(e.target.value); setError(""); }} onClick={openDatePicker} className={dateInputCls} />
              </FieldRow>
            </>
          )}
          {showForex && (
            <FieldRow label="Mata uang">
              <select
                aria-label="Pilih negara / mata uang"
                value={selectedCurrency}
                onChange={(e) => {
                  const code = e.target.value;
                  setSelectedCurrency(code);
                  setSymbol(code);
                  const curr = FOREIGN_CURRENCIES.find((c) => c.code === code);
                  if (curr) setName(curr.name);
                  setError("");
                }}
                className="min-h-11 min-w-0 flex-1 bg-transparent text-right text-sm font-semibold focus:outline-none"
              >
                <option value="">Pilih mata uang</option>
                {FOREIGN_CURRENCIES.map((curr) => (
                  <option key={curr.code} value={curr.code}>{curr.name} ({curr.code})</option>
                ))}
              </select>
            </FieldRow>
          )}
          {/* Jumlah deposito tersimpan sebagai satu unit. */}
          {type !== "deposito" && (
            <FieldRow label={quantityLabel(type, selectedCurrency || symbol)}>
              <input
                type="number"
                inputMode="decimal"
                step={type === "stock_idx" ? "1" : "any"}
                min="0"
                aria-label={quantityLabel(type, selectedCurrency || symbol)}
                placeholder={type === "gold_physical" || type === "gold_digital" ? "10" : "0.001"}
                value={quantity}
                onChange={(e) => { setQuantity(e.target.value); setError(""); }}
                className={`${textInputCls} tabular-nums`}
              />
            </FieldRow>
          )}
          {type !== "deposito" && type !== "foreign_currency" && moneyRow(`Harga beli rata-rata (${PORTFOLIO_CURRENCY})`, avgBuyPrice, setAvgBuyPrice, "0")}
          {type === "foreign_currency" && moneyRow(`Harga beli rata-rata (${PORTFOLIO_CURRENCY} per ${selectedCurrency || "unit"})`, avgBuyPrice, setAvgBuyPrice, "10.500")}
          {type === "mutual_fund" && moneyRow(`Harga NAV (${PORTFOLIO_CURRENCY} per unit)`, manualPrice, setManualPrice, "0")}
        </RowsCard>

        {error && <p role="alert" className="px-1 text-sm text-danger">{error}</p>}

        {showPreview && (
          <section aria-label="Pratinjau" className="grid grid-cols-2 gap-2.5 rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Modal</span>
              <span className="text-base font-bold tabular-nums">{mask(costBasisPreview)}</span>
            </div>
            {valuePreview !== undefined && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-[hsl(var(--muted-foreground))]">Nilai sekarang</span>
                <span className={cn("text-base font-bold tabular-nums", valuePreview >= costBasisPreview ? "text-success" : "text-danger")}>{mask(valuePreview)}</span>
              </div>
            )}
            {type !== "deposito" && type !== "mutual_fund" && <span className="col-span-2 text-xs text-[hsl(var(--muted-foreground))]">Nilai sekarang diisi otomatis setelah harga disinkronkan.</span>}
          </section>
        )}

        {showStockUs && <NoteLine>Harga saham AS disinkronkan dari Yahoo Finance.</NoteLine>}
        {showGold && <NoteLine>Harga estimasi IDR/gram memakai kontrak berjangka emas GC=F dan kurs USD/IDR, sehingga dapat berbeda dari harga emas fisik atau digital.</NoteLine>}
        {showFund && <NoteLine>NAV reksa dana diinput manual. Gunakan unit penyertaan dan perbarui harga secara berkala.</NoteLine>}
        {type === "deposito" && <NoteLine>Nilai dihitung lokal dari pokok dan bunga sederhana setelah pajak bunga 20%. Jumlah deposito = 1.</NoteLine>}
        {showForex && (
          <NoteLine>
            {selectedCurrency ? <><b>{selectedCurrency}IDR=X</b> (ticker Yahoo Finance). </> : null}
            Harga disinkronkan dari Yahoo Finance dalam IDR per unit mata uang.
          </NoteLine>
        )}
      </form>
    </Modal>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

function DeleteModal({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <ConfirmDialog
      open
      title="Hapus aset ini?"
      description={<><span className="font-semibold text-[hsl(var(--foreground))]">{name}</span> akan dihapus dari portofolio.</>}
      confirmLabel="Hapus"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

// ─── Asset Entry ───────────────────────────────────────────────────────────────

function typeName(type: AssetType): string {
  // Labels carry a leading emoji for the form; list views show the plain name.
  return ASSET_TYPE_LABELS[type].replace(/^\S+\s/, "");
}

function assetFigures(asset: Asset, price: AssetPrice | undefined) {
  const currentPrice = price?.priceIdr ?? asset.manualPriceIdr ?? null;
  const currentValue = currentPrice !== null ? asset.quantity * currentPrice : null;
  const costBasis = asset.quantity * asset.avgBuyPrice;
  const gain = currentValue !== null ? currentValue - costBasis : null;
  const gainPct = gain !== null && costBasis > 0 ? (gain / costBasis) * 100 : null;
  const status = price?.lastSynced ? `Diperbarui ${fmtAge(price.lastSynced)} lalu` : asset.manualPriceIdr !== undefined ? "Harga manual" : "Belum ada harga";
  return { currentPrice, currentValue, costBasis, gain, gainPct, status, change: price?.changePercent24h };
}

function SymbolTile({ symbol, size = "md" }: { symbol: string; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 select-none items-center justify-center font-bold leading-none", size === "lg" ? "h-11 w-11 rounded-[13px] text-[11px]" : "h-[38px] w-[38px] rounded-xl text-[10px]")}
      style={{ background: "color-mix(in srgb, hsl(var(--primary)) 14%, transparent)", color: "color-mix(in srgb, hsl(var(--primary)) 70%, hsl(var(--foreground)))" }}
    >
      {symbol.slice(0, 4)}
    </span>
  );
}

interface AssetEntryProps {
  asset: Asset;
  price: AssetPrice | undefined;
  hidden: boolean;
  desktop: boolean;
  onOpen: () => void;
}

function AssetEntry({ asset, price, hidden, desktop, onOpen }: AssetEntryProps) {
  const { currentValue, costBasis, gain, gainPct, change } = assetFigures(asset, price);
  const money = (value: number | null) => hidden ? "•••" : value === null ? "—" : formatCurrency(value, PORTFOLIO_CURRENCY);
  const quantity = hidden ? "•••" : `${asset.quantity.toLocaleString("id-ID")} ${quantityUnit(asset.type, asset.symbol)}`;
  const changeCls = hidden || change === undefined ? "text-[hsl(var(--muted-foreground))]" : gainCls(change);
  const changeText = hidden ? "•••" : change === undefined ? "—" : fmtPct(change);
  const openCls = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]";

  if (desktop) {
    const gainText = hidden ? "•••" : gain === null ? "—" : `${gain >= 0 ? "+" : ""}${formatCurrency(gain, PORTFOLIO_CURRENCY)}${gainPct === null ? "" : ` (${fmtPct(gainPct)})`}`;
    return (
      <tr className="hover:bg-[hsl(var(--surface-2))]/50">
        <th scope="row" className="min-w-48 p-0 text-left font-normal">
          <button type="button" onClick={onOpen} aria-label={`Lihat detail ${asset.symbol}`} className={cn("flex min-h-[58px] w-full items-center gap-2.5 px-5 text-left", openCls)}>
            <SymbolTile symbol={asset.symbol} size="lg" />
            <span className="min-w-0 break-words">
              <span className="block text-sm font-semibold text-[hsl(var(--foreground))]">{asset.symbol}</span>
              <span className="block text-xs font-normal text-[hsl(var(--muted-foreground))]">{asset.name}</span>
            </span>
          </button>
        </th>
        <td className="px-3 py-3 text-left whitespace-nowrap text-[hsl(var(--foreground))]">{typeName(asset.type)}</td>
        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{quantity}</td>
        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-[hsl(var(--muted-foreground))]">{money(costBasis)}</td>
        <td className="px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap">{money(currentValue)}</td>
        <td className={cn("px-3 py-3 text-right font-semibold tabular-nums whitespace-nowrap", hidden || gain === null ? "text-[hsl(var(--muted-foreground))]" : gainCls(gain))}>{gainText}</td>
        <td className={cn("px-5 py-3 text-right font-semibold tabular-nums whitespace-nowrap", changeCls)}>{changeText}</td>
      </tr>
    );
  }

  return (
    <button type="button" onClick={onOpen} aria-label={`Lihat detail ${asset.symbol}`} className={cn("flex min-h-[62px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-[hsl(var(--surface-2))]", openCls)}>
      <SymbolTile symbol={asset.symbol} />
      <span className="min-w-0 flex-1 break-words">
        <span className="block text-sm font-semibold text-[hsl(var(--foreground))]">{asset.name}</span>
        <span className="block text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{quantity}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums">{money(currentValue)}</span>
        <span className={cn("block text-xs font-semibold tabular-nums", changeCls)}>{changeText}</span>
      </span>
    </button>
  );
}

// ─── Asset Detail Sheet ───────────────────────────────────────────────────────

interface AssetDetailSheetProps {
  asset: Asset | null;
  price: AssetPrice | undefined;
  hidden: boolean;
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
  onHistory: (asset: Asset) => void;
}

function AssetDetailSheet({ asset, price, hidden, onClose, onEdit, onDelete, onHistory }: AssetDetailSheetProps) {
  const figures = asset ? assetFigures(asset, price) : null;
  const money = (value: number | null) => hidden ? "•••" : value === null ? "—" : formatCurrency(value, PORTFOLIO_CURRENCY);
  const btn = "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--border))] px-3 text-sm font-medium hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";
  return (
    <Sheet open={asset !== null} onClose={onClose} title={asset ? `${asset.symbol} · ${asset.name}` : "Detail aset"}>
      {asset && figures && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <SymbolTile symbol={asset.symbol} size="lg" />
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold">{asset.name}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{typeName(asset.type)} · <span className="tabular-nums">{hidden ? "•••" : `${asset.quantity.toLocaleString("id-ID")} ${quantityUnit(asset.type, asset.symbol)}`}</span></p>
            </div>
          </div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{money(figures.currentValue)}</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl bg-[hsl(var(--surface-2))] p-4 text-xs [&_dd]:mt-0.5 [&_dd]:break-words [&_dd]:text-sm [&_dd]:font-semibold [&_dd]:tabular-nums [&_dt]:text-[hsl(var(--muted-foreground))]">
            <div><dt>Modal</dt><dd>{money(figures.costBasis)}</dd></div>
            <div><dt>Nilai sekarang</dt><dd>{money(figures.currentValue)}</dd></div>
            <div>
              <dt>Untung/rugi</dt>
              <dd className={hidden || figures.gain === null ? "" : gainCls(figures.gain)}>{hidden ? "•••" : figures.gain === null ? "—" : `${figures.gain >= 0 ? "+" : ""}${formatCurrency(figures.gain, PORTFOLIO_CURRENCY)}`}</dd>
            </div>
            <div>
              <dt>ROI</dt>
              <dd className={hidden || figures.gainPct === null ? "" : gainCls(figures.gainPct)}>{hidden ? "•••" : figures.gainPct === null ? "—" : fmtPct(figures.gainPct)}</dd>
            </div>
            <div>
              <dt>Harga/unit</dt>
              <dd>{money(figures.currentPrice)}</dd>
              <dd className={cn("!text-[11px] !font-normal", figures.currentPrice === null ? "text-warning" : "text-[hsl(var(--muted-foreground))]")}>{figures.status}</dd>
            </div>
            <div>
              <dt>24 jam</dt>
              <dd className={hidden || figures.change === undefined ? "" : gainCls(figures.change)}>{hidden ? "•••" : figures.change === undefined ? "—" : fmtPct(figures.change)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {asset.type !== "mutual_fund" && asset.type !== "deposito" && (
              <button type="button" onClick={() => onHistory(asset)} aria-label={`Riwayat harga ${asset.symbol}`} className={btn}><Clock size={16} aria-hidden="true" />Riwayat harga</button>
            )}
            <button type="button" onClick={() => onEdit(asset)} aria-label={`Edit ${asset.symbol}`} className={btn}><Pencil size={16} aria-hidden="true" />Edit</button>
            <button type="button" onClick={() => onDelete(asset)} aria-label={`Hapus ${asset.symbol}`} className={cn(btn, "text-danger")}><Trash2 size={16} aria-hidden="true" />Hapus</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ─── Sync Progress Banner ──────────────────────────────────────────────────────

type SyncStatus = "pending" | "syncing" | "done" | "failed" | "skipped";

interface SyncProgressBannerProps {
  onDismiss: () => void;
  assets: Asset[];
  progress: Record<string, SyncStatus>;
  errors: Record<string, string>;
  syncing: boolean;
}

function SyncProgressBanner({ assets, progress, errors, syncing, onDismiss }: SyncProgressBannerProps) {
  if (Object.keys(progress).length === 0) return null;

  // Reksa dana menggunakan harga manual; deposito dihitung lokal dan tetap tampil di progres.
  const syncableSymbols = assets
    .filter((a) => a.type !== "mutual_fund")
    .map((a) => a.symbol);

  const total = syncableSymbols.length || 1;
  const doneCount = syncableSymbols.filter((s) => {
    const st = progress[s];
    return st === "done" || st === "failed" || st === "skipped";
  }).length;
  const successCount = syncableSymbols.filter((s) => progress[s] === "done").length;
  const failedCount = syncableSymbols.filter((s) => progress[s] === "failed").length;
  const skippedCount = syncableSymbols.filter((s) => progress[s] === "skipped").length;
  const pct = Math.round((doneCount / total) * 100);

  // Find the asset currently being synced
  const currentlySyncing = assets.find((a) => progress[a.symbol] === "syncing");

  const allDone = !syncing && doneCount >= total;

  return (
    <div role="status" aria-label="Hasil sinkronisasi harga">
      <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {/* Progress bar */}
        <div className="h-1 bg-[hsl(var(--muted))]">
          <div
            className={`h-full transition-all duration-500 ${allDone && failedCount > 0 ? "bg-amber-500" : allDone ? "bg-emerald-500" : "bg-indigo-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="p-3 space-y-1.5">
          {/* Header row: status text + percentage */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[hsl(var(--foreground))]">
              {allDone
                ? failedCount > 0
                  ? `✅ Selesai · ${successCount} berhasil, ${skippedCount} dilewati, ${failedCount} gagal`
                  : `✅ ${successCount} harga disinkronkan · ${skippedCount} dilewati`
                : currentlySyncing
                ? `🔄 Menyinkronkan ${currentlySyncing.symbol}…`
                : "🔄 Menyinkronkan harga…"}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-xs font-bold tabular-nums text-[hsl(var(--muted-foreground))]">{pct}%</span>
              {allDone && (
                <button type="button" onClick={onDismiss} aria-label="Tutup hasil sinkronisasi" className="-my-2 -mr-2 flex h-11 w-11 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </span>
          </div>

          {/* Sub-label: N dari M aset */}
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
            {allDone
              ? `${doneCount} dari ${total} aset selesai diproses`
              : `${doneCount} dari ${total} aset selesai`}
          </p>

          {/* Per-asset status chips — only syncable assets */}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {assets
              .filter((a) => a.type !== "mutual_fund")
              .map((a) => {
                const status = progress[a.symbol] ?? "pending";
                const chipCls =
                  status === "syncing"
                    ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                    : status === "done"
                    ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                    : status === "failed"
                    ? "border-red-400 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                    : "border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]";
                const icon =
                  status === "syncing" ? "🔄" : status === "done" ? "✅" : status === "failed" ? "❌" : status === "skipped" ? "⏭️" : "⏳";
                return (
                  <div key={a.symbol} className={`flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[10px] border ${chipCls}`}>
                    <span className={status === "syncing" ? "animate-spin inline-block" : ""}>{icon}</span>
                    <span className="font-medium">{a.symbol}</span>
                  </div>
                );
              })}
          </div>

          {/* Error detail list — shown after sync if any asset failed */}
          {allDone && failedCount > 0 && (
            <div className="mt-1 space-y-0.5 border-t border-[hsl(var(--border))] pt-1.5">
              {assets
                .filter((a) => progress[a.symbol] === "failed" && errors[a.symbol])
                .map((a) => (
                  <p key={a.symbol} className="text-[10px] text-red-600 dark:text-red-400 leading-snug">
                    <span className="font-semibold">{a.symbol}:</span> {errors[a.symbol]}
                  </p>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Price History Modal ──────────────────────────────────────────────────────

function fmtAbsTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

interface PriceHistoryModalProps {
  asset: Asset;
  hidden: boolean;
  onClose: () => void;
}

function PriceHistoryModal({ asset, hidden, onClose }: PriceHistoryModalProps) {
  const [records, setRecords] = useState<{ syncedAt: string; price: number; changePct: number | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAssetPriceHistory(asset.symbol, 30).then((r) => {
      setRecords(r);
      setLoading(false);
    });
  }, [asset.symbol]);

  return (
    <Modal open onClose={onClose} title={`${asset.symbol} — riwayat harga`}>
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : records.length === 0 ? (
        <p className="text-sm text-center text-[hsl(var(--muted-foreground))] py-8">
          Belum ada riwayat harga.<br />
          <span className="text-xs">Riwayat tersimpan setiap kali harga berhasil disinkron.</span>
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[hsl(var(--muted-foreground))] border-b border-[hsl(var(--border))]">
                <th className="text-left pb-2 font-medium">Waktu sinkronisasi</th>
                <th className="text-right pb-2 font-medium">Harga</th>
                <th className="text-right pb-2 font-medium">Perubahan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {records.map((r, i) => (
                <tr key={i}>
                  <td className="py-2 pr-3 text-[hsl(var(--muted-foreground))]">{fmtAbsTime(r.syncedAt)}</td>
                  <td className="text-right py-2 pr-3 font-semibold text-[hsl(var(--foreground))]">
                    {hidden ? "•••" : formatCurrency(r.price, PORTFOLIO_CURRENCY)}
                  </td>
                  <td className="text-right py-2">
                    {r.changePct !== null ? (
                      <span className={hidden ? "text-[hsl(var(--muted-foreground))] font-semibold" : r.changePct >= 0 ? "text-success font-semibold" : "text-danger font-semibold"}>
                        {hidden ? "•••" : `${r.changePct >= 0 ? "▲" : "▼"} ${Math.abs(r.changePct).toFixed(2)}%`}
                      </span>
                    ) : (
                      <span className="text-[hsl(var(--muted-foreground))]">pertama</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// ─── Portfolio Page ───────────────────────────────────────────────────────────

type Filter = "all" | "crypto" | "stock_us" | "stock_idx" | "gold" | "mutual_fund" | "deposito" | "foreign_currency";

export default function Portfolio() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [prices, setPrices] = useState<Record<string, AssetPrice>>({});
  const [history, setHistory] = useState<PortfolioHistory[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<Asset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [portfolioHidden, setPortfolioHidden] = useState(() => localStorage.getItem("portfolio_hidden") === "1");

  // Sync progress toast state
  const [syncProgress, setSyncProgress] = useState<Record<string, SyncStatus>>({});
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({});
  const syncFinishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dismissSyncResult() {
    setSyncProgress({});
    setSyncErrors({});
    setSyncMsg("");
  }

  // Per-asset price history modal
  const [historyTarget, setHistoryTarget] = useState<Asset | null>(null);

  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const updateDesktop = () => setDesktop(media.matches);
    media.addEventListener("change", updateDesktop);
    return () => media.removeEventListener("change", updateDesktop);
  }, []);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [allocationExpanded, setAllocationExpanded] = useState(false);
  const [usdIdrRate, setUsdIdrRate] = useState<number>(16200);
  const [historyZoomed, setHistoryZoomed] = useState(false);

  usePageAction({ label: "Tambah aset", onClick: () => setAddOpen(true) });

  function togglePortfolioHidden() {
    setPortfolioHidden((v) => {
      localStorage.setItem("portfolio_hidden", v ? "0" : "1");
      return !v;
    });
  }

  const loadAll = useCallback(async () => {
    const a = await getAssets();
    setAssets(a);
    const storedPrices = await db.assetPrices.toArray();
    const map: Record<string, AssetPrice> = {};
    for (const p of storedPrices) map[p.symbol] = p;
    setPrices(map);
    const metrics = getPortfolioMetrics(a, map);
    if (a.length) {
      const usdIdr = await getUsdIdr();
      setUsdIdrRate(usdIdr);
      if (metrics.totalValue > 0) await backfillPortfolioHistoryUsd(usdIdr);
      if (!metrics.hasMissingPrices && metrics.totalValue > 0) {
        await savePortfolioSnapshot(metrics.totalValue, metrics.totalValue / usdIdr);
      }
    }
    // Refresh history
    setHistory(await getPortfolioHistory(30));
    return a;
  }, []);

  // Auto-sync stale prices on page load
  useEffect(() => {
    loadAll().then(async (a) => {
      if (!a.length) return;
      if (await anyPriceStale(a)) {
        handleSync(a);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSync(assetsToSync?: Asset[]) {
    const portfolioAssets = assetsToSync ?? assets;
    const list = portfolioAssets.filter((asset) => asset.type !== "mutual_fund");
    if (!list.length) return;

    // Snapshot prices before sync (to compute deltas later)
    const pricesBefore: Record<string, number | null> = {};
    for (const a of list) {
      const row = await db.assetPrices.get(a.symbol);
      pricesBefore[a.symbol] = row?.priceIdr ?? null;
    }

    // Init progress state — all assets start as "pending"
    const initProgress: Record<string, SyncStatus> = {};
    for (const a of list) initProgress[a.symbol] = "pending";
    setSyncProgress(initProgress);
    setSyncErrors({});
    if (syncFinishTimerRef.current) clearTimeout(syncFinishTimerRef.current);

    setSyncing(true);

    const onProgress = (symbol: string, status: "syncing" | "done" | "failed" | "skipped", errorMsg?: string) => {
      setSyncProgress((prev) => ({ ...prev, [symbol]: status }));
      if (status === "failed" && errorMsg) {
        setSyncErrors((prev) => ({ ...prev, [symbol]: errorMsg }));
      }
    };

    try {
      const result = await syncAllPrices(list, onProgress);
      const freshPrices = await db.assetPrices.toArray();
      const map: Record<string, AssetPrice> = {};
      for (const p of freshPrices) map[p.symbol] = p;
      setPrices(map);

      // Save daily portfolio snapshot using fresh prices
      const metrics = getPortfolioMetrics(portfolioAssets, map);
      if (metrics.totalValue > 0) {
        const usdIdr = await getUsdIdr();
        setUsdIdrRate(usdIdr);
        await backfillPortfolioHistoryUsd(usdIdr);
        if (!metrics.hasMissingPrices) {
          await savePortfolioSnapshot(metrics.totalValue, metrics.totalValue / usdIdr);
          setHistory(await getPortfolioHistory(30));
        }
      }

      // Build sync log entry — only for auto-syncable types (exclude manual: reksa dana)
      // Now includes: crypto, stock_us, stock_idx, gold, forex, and deposito (with proper setup)
      // Only save if at least one asset was actually synced (respects 6-hour rule)
      const logResults = list
        .filter((a) => a.type !== "mutual_fund")
        .map((a) => {
          let status: "synced" | "failed" | "skipped" = "failed";
          if (result.synced.includes(a.symbol)) status = "synced";
          else if (result.skipped?.includes(a.symbol)) status = "skipped";
          return {
            symbol: a.symbol,
            name: a.name,
            status,
            oldPrice: pricesBefore[a.symbol],
            newPrice: map[a.symbol]?.priceIdr ?? null,
          };
        });
      // Only save a log entry if something was actually synced this round
      if (logResults.some((r) => r.status === "synced")) {
        await saveSyncLog({ syncedAt: new Date().toISOString(), results: logResults });
      }

      setSyncMsg("");
    } catch {
      setSyncMsg("❌ Sinkronisasi gagal. Cek koneksi internet.");
      syncFinishTimerRef.current = setTimeout(() => {
        setSyncProgress({});
        setSyncErrors({});
      }, 200);
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget?.id) return;
    await deleteAsset(deleteTarget.id);
    setDeleteTarget(null);
    await loadAll();
  }

  const filtered =
    filter === "all"
      ? assets
      : filter === "stock_us"
        ? assets.filter((a) => a.type === "stock_us" || a.type === "stock")
        : filter === "gold"
          ? assets.filter((a) => a.type === "gold_physical" || a.type === "gold_digital")
          : assets.filter((a) => a.type === filter);

  const metrics = getPortfolioMetrics(assets, prices);
  const { totalValue, totalCost, totalGain, totalGainPct } = metrics;
  const performanceAssets = metrics.priced
    .filter(({ asset }) => asset.quantity * asset.avgBuyPrice > 0)
    .map(({ asset, value }) => ({
      asset,
      pct: ((value - asset.quantity * asset.avgBuyPrice) / (asset.quantity * asset.avgBuyPrice)) * 100,
    }))
    .sort((a, b) => b.pct - a.pct);

  // Pie chart data — grouped by category
  const CATEGORY_META: Record<string, { label: string; color: string }> = {
    crypto:        { label: "Kripto",            color: "#6366f1" },
    stock_us:      { label: "Saham AS",          color: "#22c55e" },
    stock_idx:     { label: "Saham IDX",         color: "#f97316" },
    gold_physical: { label: "Emas Fisik",        color: "#f59e0b" },
    gold_digital:  { label: "Emas Digital",      color: "#fbbf24" },
    mutual_fund:   { label: "Reksa Dana",        color: "#14b8a6" },
    deposito:      { label: "Deposito",          color: "#3b82f6" },
    foreign_currency: { label: "Mata Uang Asing", color: "#06b6d4" },
  };
  const categoryTotals: Record<string, number> = {};
  for (const a of assets) {
    const p = prices[a.symbol]?.priceIdr ?? a.manualPriceIdr;
    if (p === undefined) continue;
    const val = a.quantity * p;
    // Normalise legacy "stock" alias → "stock_us" so they merge into one slice
    const key = (a.type === "stock" ? "stock_us" : a.type) ?? "crypto";
    categoryTotals[key] = (categoryTotals[key] ?? 0) + val;
  }
  const pieData = Object.entries(categoryTotals)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => {
      const meta = CATEGORY_META[key] ?? { label: key, color: "#6b7280" };
      return { name: meta.label, value, color: meta.color };
    });

  const syncTimes = Object.values(prices).map((p) => p.lastSynced).filter((t): t is string => !!t).sort();
  const lastSynced = syncTimes.length ? syncTimes[syncTimes.length - 1] : null;

  const filterOptions: Array<{ value: Filter; label: string }> = [
    { value: "all", label: "Semua" },
    { value: "crypto", label: "Kripto" },
    { value: "stock_us", label: "Saham AS" },
    { value: "stock_idx", label: "Saham IDX" },
    { value: "gold", label: "Emas" },
    { value: "mutual_fund", label: "Reksa Dana" },
    { value: "deposito", label: "Deposito" },
    { value: "foreign_currency", label: "Mata Uang Asing" },
  ];

  const lastSyncedTime = lastSynced ? new Date(lastSynced).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".") : null;
  const detailAsset = assets.find((a) => a.id === detailId) ?? null;
  const maskMoney = (value: number) => (portfolioHidden ? "•••" : formatCurrency(value, PORTFOLIO_CURRENCY));
  const syncDisabled = syncing || !assets.some((asset) => asset.type !== "mutual_fund");

  return (
    <div className="space-y-4 px-4 pt-5 pb-4 lg:px-0 lg:pt-6">
      <PageHeader
        title="Portofolio"
        back="/accounts"
        actions={
          <>
            {lastSyncedTime && <span className="hidden text-xs text-[hsl(var(--muted-foreground))] lg:inline">Harga diperbarui {lastSyncedTime}</span>}
            <button
              type="button"
              onClick={() => handleSync()}
              disabled={syncDisabled}
              aria-label="Perbarui harga"
              title="Perbarui harga"
              className="flex h-11 items-center gap-1.5 rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-xs font-semibold text-[hsl(var(--foreground))] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] lg:text-[13px]"
            >
              <RefreshCw size={16} className={syncing ? "animate-spin" : ""} aria-hidden="true" />
              {lastSyncedTime && <span className="tabular-nums lg:hidden">{lastSyncedTime}</span>}
              <span className="hidden lg:inline">{syncing ? "Memperbarui…" : "Perbarui harga"}</span>
            </button>
            <button type="button" onClick={() => setAddOpen(true)} aria-label="Tambah aset" className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] lg:hidden">
              <Plus size={20} aria-hidden="true" />
            </button>
          </>
        }
      />

      {(Object.keys(syncProgress).length > 0 || syncMsg) && (
        <div className="space-y-2">
          <SyncProgressBanner assets={assets} progress={syncProgress} errors={syncErrors} syncing={syncing} onDismiss={dismissSyncResult} />
          {syncMsg && (
            <p role="status" className="flex items-center justify-between gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] py-1 pl-4 pr-1 text-xs text-[hsl(var(--muted-foreground))]">
              <span>{syncMsg}</span>
              <button type="button" onClick={dismissSyncResult} aria-label="Tutup pesan sinkronisasi" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"><X size={16} aria-hidden="true" /></button>
            </p>
          )}
        </div>
      )}

      {assets.length > 0 && (
        <section aria-label="Ringkasan dan performa portofolio" className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 lg:p-5">
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_1fr_1fr_2.2fr] lg:items-center lg:gap-6">
            <div className="flex items-start justify-between gap-2">
              <dl className="min-w-0 [&_dd]:tabular-nums">
                <dt className="text-[13px] text-[hsl(var(--muted-foreground))]">Nilai sekarang</dt>
                <dd className="mt-0.5 break-words text-[30px] font-extrabold leading-tight tracking-tight lg:text-[26px]">{portfolioHidden ? "••••••" : formatCurrency(totalValue, PORTFOLIO_CURRENCY)}</dd>
                <dd className={cn("mt-0.5 text-[13px] font-bold lg:hidden", portfolioHidden || totalGain === null ? "text-[hsl(var(--muted-foreground))]" : gainCls(totalGain))}>
                  {portfolioHidden ? "•••" : totalGain === null ? "—" : `${totalGain >= 0 ? "+" : ""}${formatCurrency(totalGain, PORTFOLIO_CURRENCY)}${totalGainPct === null ? "" : ` (${fmtPct(totalGainPct)})`} dari modal`}
                </dd>
                <dd className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  <span className="lg:hidden">Modal {maskMoney(totalCost)} · </span>
                  {portfolioHidden ? "•••" : `Estimasi $${(totalValue / (usdIdrRate || 16200)).toLocaleString("en-US", { maximumFractionDigits: 0 })}`} · {assets.length} aset aktif
                </dd>
              </dl>
              <button type="button" onClick={togglePortfolioHidden} aria-label={portfolioHidden ? "Tampilkan nilai portofolio" : "Sembunyikan nilai portofolio"} aria-pressed={portfolioHidden} className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] lg:order-last lg:hidden">
                {portfolioHidden ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <dl className="hidden lg:block [&_dd]:tabular-nums">
              <dt className="text-[13px] text-[hsl(var(--muted-foreground))]">Modal</dt>
              <dd className="mt-0.5 text-xl font-bold">{maskMoney(totalCost)}</dd>
            </dl>
            <dl className="hidden lg:block [&_dd]:tabular-nums">
              <dt className="text-[13px] text-[hsl(var(--muted-foreground))]">Untung</dt>
              <dd className={cn("mt-0.5 text-xl font-bold", portfolioHidden || totalGain === null ? "text-[hsl(var(--muted-foreground))]" : gainCls(totalGain))}>
                {portfolioHidden ? "•••" : totalGain === null ? "—" : `${totalGain >= 0 ? "+" : ""}${formatCurrency(totalGain, PORTFOLIO_CURRENCY)}${totalGainPct === null ? "" : ` (${fmtPct(totalGainPct)})`}`}
              </dd>
            </dl>
            {pieData.length > 0 && totalValue > 0 && (
              <div className="space-y-2">
                <div role="img" aria-label="Alokasi aset berdasarkan jenis" className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-[5px] bg-[hsl(var(--surface-3))]">
                  {pieData.map((d) => <span key={d.name} style={{ width: `${(d.value / totalValue) * 100}%`, background: d.color }} />)}
                </div>
                <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[hsl(var(--foreground))]">
                  {pieData.map((d) => (
                    <li key={d.name} className="flex items-center gap-1.5">
                      <span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ background: d.color }} />
                      {d.name} <span className="tabular-nums">{portfolioHidden ? "•••" : `${((d.value / totalValue) * 100).toFixed(0)}%`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="mt-3 hidden justify-end lg:flex">
            <button type="button" onClick={togglePortfolioHidden} aria-label={portfolioHidden ? "Tampilkan nilai portofolio" : "Sembunyikan nilai portofolio"} aria-pressed={portfolioHidden} className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]">
              {portfolioHidden ? <EyeOff size={16} /> : <Eye size={16} />}{portfolioHidden ? "Tampilkan nilai" : "Sembunyikan nilai"}
            </button>
          </div>
          {metrics.hasMissingPrices && <p className="mt-3 text-xs text-warning">Nilai sebagian · {metrics.unpricedAssetCount} aset belum ada harga. Lengkapi harga semua aset untuk menghitung performa keseluruhan.</p>}
          {performanceAssets.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[hsl(var(--border))] pt-3 sm:grid-cols-2">
              {[{ label: "Terbaik", item: performanceAssets[0] }, { label: "Terburuk", item: performanceAssets[performanceAssets.length - 1] }].map(({ label, item }) => (
                <div key={label} className="flex min-w-0 items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 break-words">
                    <span className="text-[hsl(var(--muted-foreground))]">{label} </span><span className="font-semibold">{item.asset.symbol}</span>
                    <p className="mt-0.5 text-[hsl(var(--muted-foreground))]">{item.asset.name}</p>
                  </div>
                  <span className={`shrink-0 font-semibold tabular-nums ${portfolioHidden ? "text-[hsl(var(--muted-foreground))]" : gainCls(item.pct)}`}>{portfolioHidden ? "•••" : fmtPct(item.pct)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {assets.length > 0 && (
        <>
          <div role="group" aria-label="Filter jenis aset" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
            {filterOptions.map((option) => (
              <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)} className={`min-h-11 shrink-0 rounded-full border px-4 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] ${filter === option.value ? "border-transparent bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"}`}>
                {option.label}
              </button>
            ))}
          </div>

          <section aria-label="Daftar aset" className="min-w-0 overflow-hidden rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            {filtered.length > 0 ? (
              desktop ? (
                <div role="region" aria-label="Tabel daftar aset" tabIndex={0} className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--primary))]">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Daftar aset portofolio</caption>
                    <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-xs text-[hsl(var(--muted-foreground))]">
                      <tr>
                        {["Aset", "Jenis", "Jumlah", "Modal", "Nilai", "Untung/rugi", "24 jam"].map((label, index) => <th key={label} scope="col" className={`py-2.5 font-semibold whitespace-nowrap ${index === 0 ? "px-5" : "px-3"} ${index === 6 ? "!px-5" : ""} ${index <= 1 ? "text-left" : "text-right"}`}>{label}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))]">
                      {filtered.map((asset) => <AssetEntry key={asset.id} asset={asset} price={prices[asset.symbol]} hidden={portfolioHidden} desktop onOpen={() => setDetailId(asset.id ?? null)} />)}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="divide-y divide-[hsl(var(--border))]">
                  {filtered.map((asset) => <AssetEntry key={asset.id} asset={asset} price={prices[asset.symbol]} hidden={portfolioHidden} desktop={false} onOpen={() => setDetailId(asset.id ?? null)} />)}
                </div>
              )
            ) : (
              <div className="px-5 py-12 text-center text-[hsl(var(--muted-foreground))]">
                <div className="mb-3 text-5xl">📈</div>
                <p className="font-medium">Belum ada aset untuk filter ini</p>
                <p className="mt-1 text-sm">Ganti filter atau pilih Tambah aset untuk menambahkan aset.</p>
              </div>
            )}
          </section>

          <div className="grid items-start gap-3 lg:grid-cols-2">
            {/* Portfolio Value History */}
            {history.length > 1 && (
              <div className="min-w-0 rounded-2xl border border-[hsl(var(--border))] p-3 sm:p-4 bg-[hsl(var(--card))] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setHistoryExpanded((value) => !value)}
                    aria-expanded={historyExpanded}
                    className="flex flex-1 items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Riwayat Nilai Portofolio</p>
                    </div>
                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] shrink-0">
                      {historyExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </span>
                  </button>
                  {historyExpanded && (
                    <button
                      onClick={() => setHistoryZoomed((v) => !v)}
                      aria-label={historyZoomed ? "Perkecil grafik" : "Perbesar grafik"}
                      className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors text-sm font-semibold shrink-0"
                      title={historyZoomed ? "Perkecil grafik" : "Perbesar grafik"}
                    >
                      {historyZoomed ? "−" : "+"}
                    </button>
                  )}
                </div>
                {historyExpanded && (portfolioHidden ? (
                  <p className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">Grafik disembunyikan saat nilai portofolio disembunyikan.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={historyZoomed ? 420 : 280}>
                    <AreaChart data={history} margin={{ top: 4, right: 4, left: 4, bottom: 20 }}>
                      <defs>
                        <linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="usdGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 9 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(d: string) => d.slice(5)}
                        interval={historyZoomed ? "preserveStartEnd" : Math.max(Math.ceil(history.length / 4) - 1, 0)}
                      />
                      <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickFormatter={(v: number) => `Rp ${(v / 1e6).toFixed(0)}M`} width={45} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickFormatter={(v: number) => `$${(v / 1e3).toFixed(0)}K`} width={45} />
                      <Tooltip
                        formatter={(val, name) => {
                          if (name === "Nilai IDR") return [formatCurrency(Number(val), PORTFOLIO_CURRENCY), name];
                          if (name === "Estimasi USD") return [`$${Number(val).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, name];
                          return [formatCurrency(Number(val), PORTFOLIO_CURRENCY), String(name)];
                        }}
                        labelFormatter={(label) => String(label)}
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "12px",
                          fontSize: "12px",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px" }} />
                      <Area yAxisId="left" dataKey="totalValue" name="Nilai IDR" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#portGrad)" dot={false} />
                      <Area yAxisId="right" dataKey="totalValueUsd" name="Estimasi USD" stroke="#22c55e" strokeWidth={2.5} fill="url(#usdGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ))}
              </div>
            )}

            {/* Allocation Table */}
            {pieData.length > 0 && (
              <div className={`min-w-0 rounded-2xl border border-[hsl(var(--border))] p-3 sm:p-4 bg-[hsl(var(--card))] space-y-3 ${history.length <= 1 ? "lg:col-span-2" : ""}`}>
                <button
                  type="button"
                  onClick={() => setAllocationExpanded((value) => !value)}
                  aria-expanded={allocationExpanded}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Alokasi Portofolio</p>
                  </div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]">
                    {allocationExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </button>
                {allocationExpanded && (
                  <div className="overflow-x-auto -mx-1">
                    <div className="space-y-2 sm:hidden">
                      {pieData.map((d) => {
                        const pct = totalValue > 0 ? (d.value / totalValue) * 100 : 0;
                        return (
                          <div key={d.name} className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] py-2 last:border-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                              <span className="truncate text-sm font-medium">{d.name}</span>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold">{portfolioHidden ? "•••" : formatCurrency(d.value, PORTFOLIO_CURRENCY)}</p>
                              <p className="text-xs text-[hsl(var(--muted-foreground))">{portfolioHidden ? "•••" : `${pct.toFixed(1)}%`}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <table className="hidden w-full text-xs sm:table">
                      <thead>
                        <tr className="text-[hsl(var(--muted-foreground))] border-b border-[hsl(var(--border))] text-left">
                          <th className="pb-2 font-medium px-1">Kategori</th>
                          <th className="pb-2 font-medium text-right px-1">Nilai</th>
                          <th className="pb-2 font-medium text-right px-1">Alokasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[hsl(var(--border))]">
                        {pieData.map((d) => {
                          const pct = totalValue > 0 ? (d.value / totalValue) * 100 : 0;
                          return (
                            <tr key={d.name} className="hover:bg-[hsl(var(--muted))] transition-colors">
                              <td className="py-2 px-1 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                                <span className="font-medium text-[hsl(var(--foreground))]">{d.name}</span>
                              </td>
                              <td className="py-2 px-1 text-right font-semibold text-[hsl(var(--foreground))]">
                                {portfolioHidden ? "•••" : formatCurrency(d.value, PORTFOLIO_CURRENCY)}
                              </td>
                              <td className="py-2 px-1 text-right text-[hsl(var(--muted-foreground))]">
                                {portfolioHidden ? "•••" : `${pct.toFixed(1)}%`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {!assets.length && (
        <div className="rounded-[28px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 px-5 py-16 text-center text-[hsl(var(--muted-foreground))]">
          <div className="text-5xl mb-3">📈</div>
          <p className="font-medium">Belum ada aset portofolio</p>
          <p className="text-sm mt-1">Pilih Tambah aset untuk menambahkan investasi dan aset lainnya.</p>
        </div>
      )}

      <div className="space-y-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
        <p>Harga pasar memakai Yahoo Finance; pencarian kripto memakai CoinGecko. Harga segar dilewati selama 6 jam.</p>
        {/* Sumber harga saham */}
        {assets.some((a) => a.type === "stock_us" || a.type === "stock" || a.type === "stock_idx") && (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Harga saham AS dan IDX disinkronkan dari Yahoo Finance melalui layanan proxy. Harga beli dan jumlah dicatat dalam IDR per lembar.
          </p>
        )}
      </div>

      {/* Modals */}
      <AssetForm key={addOpen ? "add-open" : "add-closed"} open={addOpen} onClose={() => setAddOpen(false)} onSaved={loadAll} hidden={portfolioHidden} />
      {editTarget && <AssetForm open onClose={() => setEditTarget(null)} onSaved={loadAll} existing={editTarget} hidden={portfolioHidden} />}
      {deleteTarget && (
        <DeleteModal
          name={`${deleteTarget.symbol} — ${deleteTarget.name}`}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
      {historyTarget && (
        <PriceHistoryModal
          asset={historyTarget}
          hidden={portfolioHidden}
          onClose={() => setHistoryTarget(null)}
        />
      )}

      <AssetDetailSheet
        asset={detailAsset}
        price={detailAsset ? prices[detailAsset.symbol] : undefined}
        hidden={portfolioHidden}
        onClose={() => setDetailId(null)}
        onEdit={(asset) => { setDetailId(null); setEditTarget(asset); }}
        onDelete={(asset) => { setDetailId(null); setDeleteTarget(asset); }}
        onHistory={(asset) => { setDetailId(null); setHistoryTarget(asset); }}
      />

    </div>
  );
}
