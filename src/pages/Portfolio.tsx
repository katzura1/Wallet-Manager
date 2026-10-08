import { useCallback, useEffect, useRef, useState } from "react";
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button, Input, Modal, Spinner } from "@/components/ui";
import { formatCurrency, formatNumberWithSeparator } from "@/lib/utils";
import { getAssets, addAsset, updateAsset, deleteAsset, savePortfolioSnapshot, getPortfolioHistory, saveSyncLog, getAssetPriceHistory, backfillPortfolioHistoryUsd, FOREIGN_CURRENCIES } from "@/db/assets";
import { syncAllPrices, searchCoins, anyPriceStale, getUsdIdr, type CoinSearchResult } from "@/services/priceSync";
import { db } from "@/db/db";
import { Eye, EyeOff, Clock, ChevronDown, ChevronUp } from "lucide-react";
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
  return n >= 0 ? "text-emerald-500" : "text-red-500";
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
}

function AssetForm({ open, onClose, onSaved, existing }: AssetFormProps) {
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

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit Aset" : "Tambah Aset"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type selector dropdown (locked when editing) */}
        {!existing && (
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">Jenis Aset</label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as AssetType);
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
              }}
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-base text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="crypto">₿ Kripto</option>
              <option value="stock_us">🇺🇸 Saham AS</option>
              <option value="stock_idx">🇮🇩 Saham IDX</option>
              <option value="gold_physical">🥇 Emas Fisik</option>
              <option value="gold_digital">🥇 Emas Digital</option>
              <option value="mutual_fund">📈 Reksa Dana</option>
              <option value="deposito">🏦 Deposito</option>
              <option value="foreign_currency">💱 Mata Uang Asing</option>
            </select>
          </div>
        )}

        {/* Show type badge when editing */}
        {existing && (
          <div className="rounded-xl bg-[hsl(var(--muted))] px-3 py-2 text-sm flex items-center gap-2">
            <span className="font-semibold">{existing.symbol}</span>
            <span className="text-[hsl(var(--muted-foreground))]">{existing.name}</span>
            <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">
              {ASSET_TYPE_LABELS[existing.type]}
            </span>
          </div>
        )}

        {/* Crypto: coin search */}
        {type === "crypto" && !existing && (
          <div className="relative">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">Cari Koin</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Cari nama koin (mis. Bitcoin, Ethereum…)"
                value={coinSearch}
                onChange={(e) => { setCoinSearch(e.target.value); setShowResults(true); }}
                onFocus={() => setShowResults(true)}
                className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-base text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {searching && (
                <span className="absolute right-3 top-2.5 text-xs text-[hsl(var(--muted-foreground))] animate-pulse">Cari…</span>
              )}
            </div>
            {showResults && coinResults.length > 0 && (
              <ul className="absolute z-50 mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg max-h-52 overflow-y-auto">
                {coinResults.map((coin) => (
                  <li
                    key={coin.id}
                    onClick={() => selectCoin(coin)}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-[hsl(var(--accent))]"
                  >
                    <img src={coin.thumb} alt="" className="w-5 h-5 rounded-full" />
                    <span className="font-medium">{coin.name}</span>
                    <span className="text-[hsl(var(--muted-foreground))]">{coin.symbol}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Saham AS: harga disinkronkan dari Yahoo Finance */}
        {(type === "stock_us" || type === "stock") && !existing && (
          <>
            <Input
              label="Simbol Ticker AS (mis. AAPL, MSFT, TSM, NVDA)"
              placeholder="AAPL"
              value={symbol}
              onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setError(""); }}
            />
            <Input
              label="Nama Perusahaan"
              placeholder="Apple Inc"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
            />
          </>
        )}

        {/* Saham IDX memakai kode ticker dan nama perusahaan. */}
        {type === "stock_idx" && !existing && (
          <>
            <Input
              label="Kode Saham IDX (mis. BBCA, TLKM, GOTO)"
              placeholder="BBCA"
              value={symbol}
              onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setError(""); }}
            />
            <Input
              label="Nama Perusahaan"
              placeholder="Bank Central Asia"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
            />
          </>
        )}

        {/* Harga emas merupakan estimasi berbasis kontrak berjangka GC=F. */}
        {(type === "gold_physical" || type === "gold_digital") && !existing && (
          <>
            <Input
              label={`Nama / Label (mis. ${type === "gold_physical" ? "Emas Antam 10g" : "Pluang Gold"})`}
              placeholder={type === "gold_physical" ? "Emas Antam 10g" : "Pluang Gold"}
              value={name}
              onChange={(e) => { setName(e.target.value); setSymbol(e.target.value.replace(/\s+/g, "_").toUpperCase()); setError(""); }}
            />
            <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-3 py-2">
              Harga estimasi IDR/gram memakai kontrak berjangka emas GC=F dan kurs USD/IDR, sehingga dapat berbeda dari harga emas fisik atau digital.
            </p>
          </>
        )}

        {/* Mutual fund — manual price only */}
        {type === "mutual_fund" && !existing && (
          <>
            <Input
              label="Nama Reksa Dana"
              placeholder="Schroder Dana Prestasi Plus"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
            />
            <Input
              label="Kode / Simbol (bebas, mis. SDP)"
              placeholder="SDP"
              value={symbol}
              onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setError(""); }}
            />
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2">
              NAV reksa dana diinput manual. Gunakan unit penyertaan dan perbarui harga secara berkala.
            </p>
          </>
        )}

        {/* Deposito — dihitung lokal dengan bunga sederhana dan pajak atas bunga. */}
        {type === "deposito" && (
          <>
            <Input
              label="Nama Bank / Label"
              placeholder="BCA Deposito 12 Bulan"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
            />
            <Input
              label="Kode (bebas, mis. DEP_BCA)"
              placeholder="DEP_BCA"
              value={symbol}
              onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setError(""); }}
            />
            <Input
              label={`Pokok Deposito (${PORTFOLIO_CURRENCY})`}
              type="text"
              inputMode="numeric"
              placeholder="10000000"
              value={formatNumberWithSeparator(depositInitial)}
              onChange={(e) => {
                const cleanValue = e.target.value.replace(/\D/g, "");
                setDepositInitial(cleanValue);
                setError("");
              }}
            />
            <Input
              label="Bunga per Tahun (%)"
              type="number"
              inputMode="decimal"
              placeholder="4.5"
              step="0.1"
              value={interestRate}
              onChange={(e) => { setInterestRate(e.target.value); setError(""); }}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Tanggal Mulai"
                type="date"
                value={depositStartDate}
                onChange={(e) => { setDepositStartDate(e.target.value); setError(""); }}
              />
              <Input
                label="Tanggal Akhir"
                type="date"
                value={depositEndDate}
                onChange={(e) => { setDepositEndDate(e.target.value); setError(""); }}
              />
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-xl px-3 py-2">
              Nilai dihitung lokal dari pokok dan bunga sederhana setelah pajak bunga 20%. Jumlah deposito = 1.
            </p>
          </>
        )}

        {/* Mata uang asing — harga disinkronkan dari Yahoo Finance */}
        {type === "foreign_currency" && !existing && (
          <>
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">Pilih Negara / Mata Uang</label>
              <select
                value={selectedCurrency}
                onChange={(e) => {
                  const code = e.target.value;
                  setSelectedCurrency(code);
                  setSymbol(code);
                  const curr = FOREIGN_CURRENCIES.find((c) => c.code === code);
                  if (curr) setName(curr.name);
                  setError("");
                }}
                className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-base text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Pilih Mata Uang --</option>
                {FOREIGN_CURRENCIES.map((curr) => (
                  <option key={curr.code} value={curr.code}>
                    {curr.name} ({curr.code})
                  </option>
                ))}
              </select>
            </div>
            {selectedCurrency && (
              <div className="rounded-xl bg-teal-50 dark:bg-teal-900/20 px-3 py-2 text-sm">
                <span className="font-semibold text-teal-700 dark:text-teal-300">{selectedCurrency}IDR=X</span>
                <span className="text-[hsl(var(--muted-foreground))] ml-2 text-xs">Ticker Yahoo Finance</span>
              </div>
            )}
            <p className="text-xs text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 rounded-xl px-3 py-2">
              Harga disinkronkan dari Yahoo Finance dalam IDR per unit mata uang.
            </p>
          </>
        )}

        {/* Show resolved name/symbol for crypto after selection */}
        {type === "crypto" && !existing && (name || symbol) && (
          <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 text-sm">
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">{symbol}</span>
            <span className="text-[hsl(var(--muted-foreground))] ml-2">{name}</span>
            {coinGeckoId && <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">id: {coinGeckoId}</span>}
          </div>
        )}

        {/* Jumlah deposito tersimpan sebagai satu unit. */}
        {type !== "deposito" && (
          <Input
            label={quantityLabel(type, selectedCurrency || symbol)}
            type="number"
            inputMode="decimal"
            step={type === "stock_idx" ? "1" : "any"}
            min="0"
            placeholder={type === "gold_physical" || type === "gold_digital" ? "10" : "0.001"}
            value={quantity}
            onChange={(e) => { setQuantity(e.target.value); setError(""); }}
            error={error}
          />
        )}

        {type === "deposito" && (
          <Input
            label="Jumlah Deposito"
            type="number"
            disabled
            placeholder="1"
            value="1"
          />
        )}

        {/* Price input — hidden for deposito and forex (auto-synced) */}
        {type !== "deposito" && type !== "foreign_currency" && (
          <Input
            label={`Harga Beli Rata-rata (${PORTFOLIO_CURRENCY})`}
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={formatNumberWithSeparator(avgBuyPrice)}
            onChange={(e) => {
              const cleanValue = e.target.value.replace(/\D/g, "");
              setAvgBuyPrice(cleanValue);
              setError("");
            }}
          />
        )}

        {/* Foreign Currency: avg buy price in IDR per unit */}
        {type === "foreign_currency" && (
          <Input
            label={`Harga Beli Rata-rata (${PORTFOLIO_CURRENCY} per ${selectedCurrency || "unit"})`}
            type="text"
            inputMode="numeric"
            placeholder="10500"
            value={formatNumberWithSeparator(avgBuyPrice)}
            onChange={(e) => {
              const cleanValue = e.target.value.replace(/\D/g, "");
              setAvgBuyPrice(cleanValue);
              setError("");
            }}
            error={error}
          />
        )}

        {/* Harga manual hanya digunakan untuk reksa dana. */}
        {type === "mutual_fund" && (
          <Input
            label={`Harga NAV (${PORTFOLIO_CURRENCY} per unit)`}
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={formatNumberWithSeparator(manualPrice)}
            onChange={(e) => {
              const cleanValue = e.target.value.replace(/\D/g, "");
              setManualPrice(cleanValue);
            }}
          />
        )}

        {type === "deposito" && error && <p role="alert" className="text-sm text-red-500">{error}</p>}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Menyimpan…" : existing ? "Simpan Perubahan" : "Tambah Aset"}
        </Button>
      </form>
    </Modal>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

function DeleteModal({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal open onClose={onClose} title="Hapus Aset">
      <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
        Hapus <span className="font-semibold text-[hsl(var(--foreground))]">{name}</span> dari portofolio?
      </p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Batal</Button>
        <Button variant="destructive" className="flex-1" onClick={onConfirm}>Hapus</Button>
      </div>
    </Modal>
  );
}

// ─── Asset Card ───────────────────────────────────────────────────────────────

interface AssetCardProps {
  asset: Asset;
  price: AssetPrice | undefined;
  hidden?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
}

function AssetCard({ asset, price, hidden = false, onEdit, onDelete, onHistory }: AssetCardProps) {
  const currentPrice = price?.priceIdr ?? asset.manualPriceIdr ?? null;
  const currentValue = currentPrice !== null ? asset.quantity * currentPrice : null;
  const costBasis = asset.quantity * asset.avgBuyPrice;
  const gain = currentValue !== null ? currentValue - costBasis : null;
  const gainPct = gain !== null ? (gain / costBasis) * 100 : null;
  const roiPct = gainPct; // ROI % is same as gain %

  return (
    <div className="overflow-hidden rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
      <div className="px-4 pt-4 pb-3 space-y-3">
        <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span className="max-w-full break-words font-bold text-base text-[hsl(var(--foreground))]">{asset.symbol}</span>
            <span className="text-[10px] px-2 py-1 rounded-full bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] shrink-0">
            {ASSET_TYPE_LABELS[asset.type].split(" ")[0]}
            </span>
            <span className="min-w-0 break-words text-xs text-[hsl(var(--muted-foreground))]">{asset.name}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {price?.changePercent24h !== undefined && (
              <span className={`text-[11px] font-semibold px-2 py-1 rounded-full bg-[hsl(var(--surface-2))] ${hidden ? "text-[hsl(var(--muted-foreground))]" : gainCls(price.changePercent24h)}`}>
                {hidden ? "•••" : fmtPct(price.changePercent24h)}
              </span>
            )}
            {asset.type !== "mutual_fund" && asset.type !== "deposito" && (
              <button onClick={onHistory} aria-label={`Riwayat harga ${asset.symbol}`} className="flex h-8 w-8 items-center justify-center rounded-xl bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors" title="Riwayat harga">
                <Clock size={13} />
              </button>
            )}
            <button onClick={onEdit} aria-label={`Edit ${asset.symbol}`} className="flex h-8 w-8 items-center justify-center rounded-xl bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors text-sm">✏️</button>
            <button onClick={onDelete} aria-label={`Hapus ${asset.symbol}`} className="flex h-8 w-8 items-center justify-center rounded-xl bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-red-500 transition-colors text-sm">🗑️</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-3">
          <div className="rounded-3xl bg-[hsl(var(--surface-2))] px-4 py-3.5">
            <p className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">Nilai Saat Ini</p>
            <p className="mt-2 text-base font-bold leading-tight text-[hsl(var(--foreground))]">
              {hidden ? "•••" : currentValue !== null ? formatCurrency(currentValue, PORTFOLIO_CURRENCY) : "—"}
            </p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
              <span>{hidden ? "•••" : `${asset.quantity.toLocaleString("id-ID")} ${quantityUnit(asset.type, asset.symbol)}`}</span>
              <span>•</span>
              <span>{hidden ? "•••" : currentPrice !== null ? formatCurrency(currentPrice, PORTFOLIO_CURRENCY) : "—"}</span>
            </div>
          </div>
          <div className={`rounded-3xl px-4 py-3.5 ${gain === null ? "bg-[hsl(var(--surface-2))]" : gain >= 0 ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
            <p className={`text-[10px] font-semibold ${gain === null ? "text-[hsl(var(--muted-foreground))]" : gain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>Untung/Rugi</p>
            {gain !== null && gainPct !== null ? (
              <>
                <p className={`mt-2 text-base font-bold leading-tight ${hidden ? "text-[hsl(var(--muted-foreground))]" : gainCls(gain)}`}>
                  {hidden ? "•••" : formatCurrency(gain, PORTFOLIO_CURRENCY)}
                </p>
                <p className={`mt-1 text-[11px] font-semibold ${hidden ? "text-[hsl(var(--muted-foreground))]" : gainCls(gainPct)}`}>{hidden ? "•••" : fmtPct(gainPct)}</p>
              </>
            ) : (
              <p className="mt-2 text-base text-[hsl(var(--muted-foreground))]">—</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-2xl border border-[hsl(var(--border))] px-3 py-2.5">
            <p className="text-[hsl(var(--muted-foreground))]">Modal</p>
            <p className="mt-1 font-semibold text-[hsl(var(--foreground))]">{hidden ? "•••" : formatCurrency(costBasis, PORTFOLIO_CURRENCY)}</p>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--border))] px-3 py-2.5">
            <p className="text-[hsl(var(--muted-foreground))]">Harga / Unit</p>
            <p className="mt-1 font-semibold text-[hsl(var(--foreground))]">{hidden ? "•••" : currentPrice !== null ? formatCurrency(currentPrice, PORTFOLIO_CURRENCY) : "—"}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[hsl(var(--surface-2))] text-[10px] text-[hsl(var(--muted-foreground))]">
        <div className="flex items-center gap-2">
          {roiPct !== null ? (
            <span className={`font-semibold ${hidden ? "text-[hsl(var(--muted-foreground))]" : gainCls(roiPct)}`}>ROI {hidden ? "•••" : fmtPct(roiPct)}</span>
          ) : (
            <span>ROI —</span>
          )}
          <span>·</span>
          <span className="truncate">
            {hidden ? "•••" : `${asset.quantity.toLocaleString("id-ID")} ${quantityUnit(asset.type, asset.symbol)}`}
          </span>
        </div>
        <div className="shrink-0">
          {price?.lastSynced && <span>{fmtAge(price.lastSynced)}</span>}
          {!price && asset.manualPriceIdr && <span className="italic">manual</span>}
          {!price && !asset.manualPriceIdr && <span className="text-amber-500">Belum ada harga</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Sync Progress Toast ──────────────────────────────────────────────────────

type SyncStatus = "pending" | "syncing" | "done" | "failed" | "skipped";

interface SyncProgressToastProps {
  assets: Asset[];
  progress: Record<string, SyncStatus>;
  errors: Record<string, string>;
  syncing: boolean;
}

function SyncProgressToast({ assets, progress, errors, syncing }: SyncProgressToastProps) {
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
    <div className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 sm:bottom-4 sm:left-auto sm:right-4 sm:w-96">
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl overflow-hidden">
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
            <span className="text-xs font-bold tabular-nums text-[hsl(var(--muted-foreground))]">
              {pct}%
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
    <Modal open onClose={onClose} title={`${asset.symbol} — Riwayat Harga`}>
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
                      <span className={hidden ? "text-[hsl(var(--muted-foreground))] font-semibold" : r.changePct >= 0 ? "text-emerald-500 font-semibold" : "text-red-500 font-semibold"}>
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
  const [editTarget, setEditTarget] = useState<Asset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [portfolioHidden, setPortfolioHidden] = useState(() => localStorage.getItem("portfolio_hidden") === "1");

  // Sync progress toast state
  const [syncProgress, setSyncProgress] = useState<Record<string, SyncStatus>>({});
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({});
  const syncFinishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-asset price history modal
  const [historyTarget, setHistoryTarget] = useState<Asset | null>(null);

  // Tab 0 shows the summary; tab 1 shows performance.
  const [summaryTab, setSummaryTab] = useState(0);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [allocationExpanded, setAllocationExpanded] = useState(false);
  const [assetListExpanded, setAssetListExpanded] = useState(() => localStorage.getItem("portfolio_assetListExpanded") !== "0");
  const [usdIdrRate, setUsdIdrRate] = useState<number>(16200);
  const [historyZoomed, setHistoryZoomed] = useState(false);

  usePageAction({ label: "Tambah aset", onClick: () => setAddOpen(true) });

  function togglePortfolioHidden() {
    setPortfolioHidden((v) => {
      localStorage.setItem("portfolio_hidden", v ? "0" : "1");
      return !v;
    });
  }

  function toggleAssetListExpanded() {
    setAssetListExpanded((v) => {
      localStorage.setItem("portfolio_assetListExpanded", v ? "0" : "1");
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
      syncFinishTimerRef.current = setTimeout(() => {
        setSyncProgress({});
        setSyncErrors({});
      }, 5000);
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

  return (
    <div className="space-y-5 px-4 pt-6 pb-4 lg:px-0 lg:pt-8">
      {/* Header */}
      <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <div className="space-y-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="mt-1 text-[2rem] font-bold tracking-tight leading-[1.05] text-[hsl(var(--foreground))]">Portofolio</h1>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">Pantau nilai, alokasi, dan performa portofolio.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleSync()}
              disabled={syncing || !assets.some((asset) => asset.type !== "mutual_fund")}
              className="h-11 rounded-2xl gap-2 self-start bg-[hsl(var(--card))]/72 px-3.5"
            >
              <span className={syncing ? "animate-spin" : ""}>🔄</span>
              <span className="leading-tight">{syncing ? "Menyinkronkan…" : "Sinkronkan Harga"}</span>
            </Button>
          </div>

          <div className="rounded-3xl bg-[hsl(var(--card))]/82 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">Total Portofolio</p>
                <p className="mt-2 text-xl sm:text-[2rem] font-bold leading-[1.05] text-[hsl(var(--foreground))]">
                  {portfolioHidden ? "••••••" : formatCurrency(totalValue, PORTFOLIO_CURRENCY)}
                </p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {portfolioHidden ? "••••••" : `Estimasi $${(totalValue / (usdIdrRate || 16200)).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                </p>
                {metrics.hasMissingPrices && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Nilai sebagian · {metrics.unpricedAssetCount} aset belum ada harga</p>}
                <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{assets.length} aset aktif</p>
              </div>
              <button onClick={togglePortfolioHidden} aria-label={portfolioHidden ? "Tampilkan nilai portofolio" : "Sembunyikan nilai portofolio"} aria-pressed={portfolioHidden} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
                {portfolioHidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {syncMsg && (
        <p className="text-xs px-4 py-3 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]">
          {syncMsg}
        </p>
      )}

      <p className="-mt-2 text-center text-[11px] text-[hsl(var(--muted-foreground))]">Harga pasar memakai Yahoo Finance; pencarian kripto memakai CoinGecko. Harga segar dilewati selama 6 jam.</p>

      {assets.length > 0 && (
        <>
          {/* Ringkasan portofolio dengan tab metrik */}
          <div className="rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden shadow-sm">
            <div className="p-3 pb-0">
              <div role="tablist" aria-label="Ringkasan portofolio" className="flex rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-1">
              {(["Ringkasan", "Performa"] as const).map((label, idx) => (
                <button
                  key={idx}
                  type="button"
                  role="tab"
                  aria-selected={summaryTab === idx}
                  id={`portfolio-tab-${idx}`}
                  aria-controls="portfolio-tab-panel"
                  onClick={() => setSummaryTab(idx)}
                  className={`flex-1 rounded-xl py-2.5 text-[11px] font-semibold transition-colors ${
                    summaryTab === idx
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "text-[hsl(var(--muted-foreground))] hover:bg-white/70 dark:hover:bg-white/5"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            </div>

            {/* Tab Content */}
            <div id="portfolio-tab-panel" role="tabpanel" aria-labelledby={`portfolio-tab-${summaryTab}`} className="p-5 pt-4 space-y-4">

              {/* Tab 0: Ringkasan */}
              {summaryTab === 0 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-3xl bg-[hsl(var(--surface-2))] px-4 py-4">
                      <p className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] mb-1">Modal</p>
                      <p className="text-sm font-semibold leading-tight text-[hsl(var(--foreground))]">
                        {portfolioHidden ? "•••" : formatCurrency(totalCost, PORTFOLIO_CURRENCY)}
                      </p>
                    </div>
                    <div className={`rounded-3xl px-4 py-4 ${totalGain === null ? "bg-[hsl(var(--surface-2))]" : totalGain >= 0 ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                      <p className={`text-[10px] font-semibold mb-1 ${totalGain === null ? "text-[hsl(var(--muted-foreground))]" : totalGain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>Untung/Rugi</p>
                      {portfolioHidden ? (
                        <p className="text-sm font-bold text-[hsl(var(--muted-foreground))]">•••</p>
                      ) : totalGain === null || totalGainPct === null ? (
                        <p className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">—</p>
                      ) : (
                        <>
                          <p className={`text-sm font-bold leading-tight ${totalGain >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {totalGain >= 0 ? "+" : ""}{formatCurrency(totalGain, PORTFOLIO_CURRENCY)}
                          </p>
                          <p className={`mt-1 text-[11px] font-semibold ${totalGain >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {fmtPct(totalGainPct)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 1: Performa (ROI dan aset terbaik/terendah) */}
              {summaryTab === 1 && (() => {
                const bestAsset = performanceAssets[0];
                const worstAsset = performanceAssets.at(-1);

                return (
                  <div className="space-y-3">
                    <div className="rounded-3xl bg-[hsl(var(--surface-2))] px-4 py-4">
                      <p className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">ROI Keseluruhan</p>
                      <p className={`mt-2 text-2xl font-bold ${totalGainPct === null ? "text-[hsl(var(--muted-foreground))]" : totalGainPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {portfolioHidden ? "•••" : totalGainPct === null ? "—" : fmtPct(totalGainPct)}
                      </p>
                      {metrics.hasMissingPrices && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Lengkapi harga semua aset untuk menghitung performa keseluruhan.</p>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {bestAsset && (
                        <div className="rounded-3xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-4 min-w-0">
                          <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1">Terbaik</p>
                          <p className="text-sm font-bold text-[hsl(var(--foreground))] truncate">{bestAsset.asset.symbol}</p>
                          <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))] truncate">{bestAsset.asset.name}</p>
                          <p className="mt-2 text-base font-bold text-emerald-500">{portfolioHidden ? "•••" : fmtPct(bestAsset.pct)}</p>
                        </div>
                      )}
                      {worstAsset && (
                        <div className="rounded-3xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-4 min-w-0">
                          <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 mb-1">Terburuk</p>
                          <p className="text-sm font-bold text-[hsl(var(--foreground))] truncate">{worstAsset.asset.symbol}</p>
                          <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))] truncate">{worstAsset.asset.name}</p>
                          <p className="mt-2 text-base font-bold text-red-500">{portfolioHidden ? "•••" : fmtPct(worstAsset.pct)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Filter aset */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={`px-3.5 py-2.5 rounded-2xl font-medium text-xs whitespace-nowrap transition-colors ${
                  filter === option.value
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                    : "bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Asset List Section */}
          <div className="rounded-[28px] border border-[hsl(var(--border))] p-5 bg-[hsl(var(--card))] shadow-sm space-y-4">
            <button
              type="button"
              onClick={toggleAssetListExpanded}
              aria-expanded={assetListExpanded}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div>
                <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Daftar Aset</p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{filtered.length} aset dalam filter ini.</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]">
                {assetListExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </span>
            </button>
            {assetListExpanded && (
              <>
                {filtered.length > 0 ? (
                  <div className="space-y-2">
                    {filtered.map((asset) => (
                      <AssetCard
                        key={asset.id}
                        asset={asset}
                        price={prices[asset.symbol]}
                        hidden={portfolioHidden}
                        onEdit={() => setEditTarget(asset)}
                        onDelete={() => setDeleteTarget(asset)}
                        onHistory={() => setHistoryTarget(asset)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[28px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 px-5 py-16 text-center text-[hsl(var(--muted-foreground))]">
                    <div className="text-5xl mb-3">📈</div>
                    <p className="font-medium">Belum ada aset untuk filter ini</p>
                    <p className="text-sm mt-1">Ganti filter atau pilih Tambah aset untuk menambahkan aset.</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Portfolio Value History */}
          {history.length > 1 && (
            <div className="rounded-[28px] border border-[hsl(var(--border))] p-5 bg-[hsl(var(--card))] shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setHistoryExpanded((value) => !value)}
                  aria-expanded={historyExpanded}
                  className="flex flex-1 items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Riwayat Nilai Portofolio</p>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Pergerakan total nilai aset dari snapshot harian.</p>
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
            <div className="rounded-[28px] border border-[hsl(var(--border))] p-5 bg-[hsl(var(--card))] shadow-sm space-y-4">
              <button
                type="button"
                onClick={() => setAllocationExpanded((value) => !value)}
                aria-expanded={allocationExpanded}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Alokasi Portofolio</p>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Distribusi nilai aset berdasarkan kategori utama.</p>
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
                        <div key={d.name} className="flex items-center justify-between gap-3 rounded-2xl border border-[hsl(var(--border))] p-3">
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
        </>
      )}

      {!assets.length && (
        <div className="rounded-[28px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 px-5 py-16 text-center text-[hsl(var(--muted-foreground))]">
          <div className="text-5xl mb-3">📈</div>
          <p className="font-medium">Belum ada aset portofolio</p>
          <p className="text-sm mt-1">Pilih Tambah aset untuk menambahkan investasi dan aset lainnya.</p>
        </div>
      )}

      {/* Sumber harga saham */}
      {assets.some((a) => a.type === "stock_us" || a.type === "stock" || a.type === "stock_idx") && (
        <p className="text-xs text-center text-[hsl(var(--muted-foreground))]">
          Harga saham AS dan IDX disinkronkan dari Yahoo Finance melalui layanan proxy. Harga beli dan jumlah dicatat dalam IDR per lembar.
        </p>
      )}

      {/* Modals */}
      <AssetForm key={addOpen ? "add-open" : "add-closed"} open={addOpen} onClose={() => setAddOpen(false)} onSaved={loadAll} />
      {editTarget && <AssetForm open onClose={() => setEditTarget(null)} onSaved={loadAll} existing={editTarget} />}
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

      {/* Floating Sync Progress Toast */}
      <SyncProgressToast
        assets={assets}
        progress={syncProgress}
        errors={syncErrors}
        syncing={syncing}
      />

    </div>
  );
}
