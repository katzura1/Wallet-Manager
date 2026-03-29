import { useCallback, useEffect, useRef, useState } from "react";
import { AreaChart, Area, CartesianGrid, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Button, Input, Modal, Spinner } from "@/components/ui";
import { formatCurrency, formatNumberWithSeparator } from "@/lib/utils";
import { getAssets, addAsset, updateAsset, deleteAsset, savePortfolioSnapshot, getPortfolioHistory, saveSyncLog, getAssetPriceHistory } from "@/db/assets";
import { syncAllPrices, searchCoins, anyPriceStale, type CoinSearchResult } from "@/services/priceSync";
import { db } from "@/db/db";
import { useSettingsStore } from "@/stores/walletStore";
import { Eye, EyeOff, Clock, Plus } from "lucide-react";
import type { Asset, AssetPrice, AssetType, PortfolioHistory } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function gainCls(n: number): string {
  return n >= 0 ? "text-emerald-500" : "text-red-500";
}
function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j`;
  return `${Math.floor(h / 24)}h`;
}

// ─── Asset Form ───────────────────────────────────────────────────────────────

interface AssetFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  existing?: Asset;
}

function AssetForm({ open, onClose, onSaved, existing }: AssetFormProps) {
  const { currency } = useSettingsStore();

  const [type, setType] = useState<AssetType>(existing?.type ?? "crypto");
  const [name, setName] = useState(existing?.name ?? "");
  const [symbol, setSymbol] = useState(existing?.symbol ?? "");
  const [coinGeckoId, setCoinGeckoId] = useState(existing?.coinGeckoId ?? "");
  const [quantity, setQuantity] = useState(String(existing?.quantity ?? ""));
  const [avgBuyPrice, setAvgBuyPrice] = useState(String(existing?.avgBuyPrice ?? ""));
  const [manualPrice, setManualPrice] = useState(String(existing?.manualPriceIdr ?? ""));

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
    if (!Number(quantity) || Number(quantity) <= 0) { setError("Jumlah harus > 0"); return; }
    if (!Number(avgBuyPrice) || Number(avgBuyPrice) <= 0) { setError("Harga beli rata-rata harus > 0"); return; }

    setLoading(true);
    try {
      const data = {
        type,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        coinGeckoId: coinGeckoId.trim() || undefined,
        quantity: Number(quantity),
        avgBuyPrice: Number(avgBuyPrice),
        manualPriceIdr: manualPrice ? Number(manualPrice) : undefined,
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
        {/* Type selector (locked when editing) */}
        {!existing && (
          <div className="rounded-xl border border-[hsl(var(--border))] overflow-hidden">
            <div className="flex">
              <button
                type="button"
                onClick={() => setType("crypto")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${type === "crypto" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
              >
                ₿ Kripto
              </button>
              <button
                type="button"
                onClick={() => setType("stock_us")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${type === "stock_us" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
              >
                🇺🇸 Saham AS
              </button>
              <button
                type="button"
                onClick={() => setType("stock_idx")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${type === "stock_idx" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
              >
                🇮🇩 Saham IDX
              </button>
            </div>
            <div className="flex border-t border-[hsl(var(--border))]">
              <button
                type="button"
                onClick={() => setType("gold_physical")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${type === "gold_physical" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
              >
                🥇 Emas Fisik
              </button>
              <button
                type="button"
                onClick={() => setType("gold_digital")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${type === "gold_digital" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
              >
                🥇 Emas Digital
              </button>
              <button
                type="button"
                onClick={() => setType("mutual_fund")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${type === "mutual_fund" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
              >
                📈 Reksa Dana
              </button>
            </div>
            <div className="flex border-t border-[hsl(var(--border))]">
              <button
                type="button"
                onClick={() => setType("deposito")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${type === "deposito" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
              >
                🏦 Deposito
              </button>
            </div>
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

        {/* Stock US: symbol + name — auto-sync via Alpha Vantage */}
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

        {/* Stock IDX: symbol + name — auto-sync via Yahoo Finance */}
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

        {/* Gold physical / digital — auto-sync via Yahoo Finance GC=F, unit = gram */}
        {(type === "gold_physical" || type === "gold_digital") && !existing && (
          <>
            <Input
              label={`Nama / Label (mis. ${type === "gold_physical" ? "Emas Antam 10g" : "Pluang Gold"})`}
              placeholder={type === "gold_physical" ? "Emas Antam 10g" : "Pluang Gold"}
              value={name}
              onChange={(e) => { setName(e.target.value); setSymbol(e.target.value.replace(/\s+/g, "_").toUpperCase()); setError(""); }}
            />
            <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-3 py-2">
              ✅ Harga emas (IDR/gram) disync otomatis dari Yahoo Finance (GC=F + kurs USD). Jumlah = gram.
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
              💡 NAV reksa dana diinput manual. Jumlah = unit penyertaan. Update harga di kolom &quot;Harga Manual&quot; secara berkala.
            </p>
          </>
        )}

        {/* Deposito — manual, unit = jumlah nominal, harga manual = nilai saat ini */}
        {type === "deposito" && !existing && (
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
            <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3 py-2">
              🏦 Jumlah = 1 (satu deposito). Harga Beli = nominal pokok. Harga Manual = nilai saat ini (pokok + bunga).
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

        {/* Editing: show locked symbol */}
        {existing && (
          <div className="rounded-xl bg-[hsl(var(--muted))] px-3 py-2 text-sm flex items-center gap-2">
            <span className="font-semibold">{existing.symbol}</span>
            <span className="text-[hsl(var(--muted-foreground))]">{existing.name}</span>
            <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">{existing.type === "crypto" ? "₿ Kripto" : existing.type === "stock_idx" ? "🇮🇩 Saham IDX" : existing.type === "gold_physical" ? "🥇 Emas Fisik" : existing.type === "gold_digital" ? "🥇 Emas Digital" : existing.type === "mutual_fund" ? "📈 Reksa Dana" : existing.type === "deposito" ? "🏦 Deposito" : "🇺🇸 Saham AS"}</span>
          </div>
        )}

        <Input
          label={type === "gold_physical" || type === "gold_digital" ? "Jumlah (gram)" : type === "mutual_fund" ? "Jumlah Unit Penyertaan" : type === "deposito" ? "Jumlah Deposito" : "Jumlah / Lot"}
          type="number"
          inputMode="decimal"
          placeholder={type === "gold_physical" || type === "gold_digital" ? "10" : "0.001"}
          value={quantity}
          onChange={(e) => { setQuantity(e.target.value); setError(""); }}
          error={error}
        />

        <Input
          label={`Harga Beli Rata-rata (${currency})`}
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

        <Input
          label={`Harga Manual (${currency}) — opsional, jika sync gagal`}
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={formatNumberWithSeparator(manualPrice)}
          onChange={(e) => {
            const cleanValue = e.target.value.replace(/\D/g, "");
            setManualPrice(cleanValue);
          }}
        />

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
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
}

function AssetCard({ asset, price, currency, onEdit, onDelete, onHistory }: AssetCardProps) {
  const currentPrice = price?.priceIdr ?? asset.manualPriceIdr ?? null;
  const currentValue = currentPrice !== null ? asset.quantity * currentPrice : null;
  const costBasis = asset.quantity * asset.avgBuyPrice;
  const gain = currentValue !== null ? currentValue - costBasis : null;
  const gainPct = gain !== null ? (gain / costBasis) * 100 : null;
  const roiPct = gainPct; // ROI % is same as gain %

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
      {/* Header: Symbol + type badge + name + 24h change + actions */}
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-bold text-base text-[hsl(var(--foreground))] shrink-0">{asset.symbol}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] shrink-0">
            {asset.type === "crypto" ? "₿" : asset.type === "stock_idx" ? "🇮🇩" : asset.type === "gold_physical" ? "🥇F" : asset.type === "gold_digital" ? "🥇D" : asset.type === "mutual_fund" ? "📈" : asset.type === "deposito" ? "🏦" : "🇺🇸"}
          </span>
          <span className="text-xs text-[hsl(var(--muted-foreground))] truncate">{asset.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {price?.changePercent24h !== undefined && (
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full bg-[hsl(var(--muted))] ${gainCls(price.changePercent24h)}`}>
              {fmtPct(price.changePercent24h)}
            </span>
          )}
          {asset.type !== "mutual_fund" && asset.type !== "deposito" && (
            <button onClick={onHistory} className="p-0.5 text-[hsl(var(--muted-foreground))] hover:text-indigo-500 transition-colors" title="Riwayat harga">
              <Clock size={13} />
            </button>
          )}
          <button onClick={onEdit} className="p-0.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors text-sm">✏️</button>
          <button onClick={onDelete} className="p-0.5 text-[hsl(var(--muted-foreground))] hover:text-red-500 transition-colors text-sm">🗑️</button>
        </div>
      </div>

      {/* 2×2 metric grid with border dividers */}
      <div className="grid grid-cols-2 border-t border-[hsl(var(--border))]">
        {/* Nilai Saat Ini */}
        <div className="px-3.5 py-2.5 border-r border-b border-[hsl(var(--border))]">
          <p className="text-[11px] text-[hsl(var(--muted-foreground))] mb-0.5">Nilai Saat Ini</p>
          <p className="text-sm font-bold text-[hsl(var(--foreground))]">
            {currentValue !== null ? formatCurrency(currentValue, currency) : "—"}
          </p>
        </div>
        {/* Keuntungan */}
        <div className="px-3.5 py-2.5 border-b border-[hsl(var(--border))]">
          <p className="text-[11px] text-[hsl(var(--muted-foreground))] mb-0.5">Keuntungan</p>
          {gain !== null && gainPct !== null ? (
            <>
              <p className={`text-sm font-bold ${gainCls(gain)}`}>{formatCurrency(gain, currency)}</p>
            </>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">—</p>
          )}
        </div>
        {/* Modal */}
        <div className="px-3.5 py-2.5 border-r border-[hsl(var(--border))]">
          <p className="text-[11px] text-[hsl(var(--muted-foreground))] mb-0.5">Modal</p>
          <p className="text-xs font-semibold text-[hsl(var(--foreground))]">{formatCurrency(costBasis, currency)}</p>
        </div>
        {/* Harga / Unit */}
        <div className="px-3.5 py-2.5">
          <p className="text-[11px] text-[hsl(var(--muted-foreground))] mb-0.5">Harga / Unit</p>
          <p className="text-xs font-semibold text-[hsl(var(--foreground))]">
            {currentPrice !== null ? formatCurrency(currentPrice, currency) : "—"}
          </p>
        </div>
      </div>

      {/* Footer: ROI | qty | sync age */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-[hsl(var(--muted))] text-[10px] text-[hsl(var(--muted-foreground))]">
        <div className="flex items-center gap-2">
          {roiPct !== null ? (
            <span className={`font-semibold ${gainCls(roiPct)}`}>ROI {fmtPct(roiPct)}</span>
          ) : (
            <span>ROI —</span>
          )}
          <span>·</span>
          <span className="truncate">
            {asset.quantity.toLocaleString("id-ID")} {asset.type === "gold_physical" || asset.type === "gold_digital" ? "g" : asset.type === "deposito" ? "dep" : "u"}
          </span>
        </div>
        <div className="shrink-0">
          {price?.lastSynced && <span>{fmtAge(price.lastSynced)}</span>}
          {!price && asset.manualPriceIdr && <span className="italic">manual</span>}
          {!price && !asset.manualPriceIdr && <span className="text-amber-500">unsync</span>}
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
  finishedAt: number | null;
}

function SyncProgressToast({ assets, progress, errors, syncing, finishedAt }: SyncProgressToastProps) {
  // Track visibility with a local state so the toast fades out smoothly
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (syncing || Object.keys(progress).length > 0) {
      setVisible(true);
    }
    if (!syncing && finishedAt !== null) {
      const t = setTimeout(() => setVisible(false), 3500);
      return () => clearTimeout(t);
    }
  }, [syncing, finishedAt, progress]);

  if (!visible || Object.keys(progress).length === 0) return null;

  // Only count assets that are included in this sync (not mutual_fund/deposito)
  const syncableSymbols = assets
    .filter((a) => a.type !== "mutual_fund" && a.type !== "deposito")
    .map((a) => a.symbol);

  const total = syncableSymbols.length || 1;
  const doneCount = syncableSymbols.filter((s) => {
    const st = progress[s];
    return st === "done" || st === "failed" || st === "skipped";
  }).length;
  const successCount = syncableSymbols.filter((s) => progress[s] === "done").length;
  const failedCount = syncableSymbols.filter((s) => progress[s] === "failed").length;
  const pct = Math.round((doneCount / total) * 100);

  // Find the asset currently being synced
  const currentlySyncing = assets.find((a) => progress[a.symbol] === "syncing");

  const allDone = !syncing && doneCount >= total;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-50 pointer-events-none">
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
                  ? `✅ Selesai · ${successCount} berhasil, ${failedCount} gagal`
                  : `✅ Semua harga diperbarui`
                : currentlySyncing
                ? `🔄 Memperbarui ${currentlySyncing.symbol}…`
                : "🔄 Memperbarui harga…"}
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
              .filter((a) => a.type !== "mutual_fund" && a.type !== "deposito")
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
  currency: string;
  onClose: () => void;
}

function PriceHistoryModal({ asset, currency, onClose }: PriceHistoryModalProps) {
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
                <th className="text-left pb-2 font-medium">Waktu Sync</th>
                <th className="text-right pb-2 font-medium">Harga</th>
                <th className="text-right pb-2 font-medium">Perubahan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {records.map((r, i) => (
                <tr key={i}>
                  <td className="py-2 pr-3 text-[hsl(var(--muted-foreground))]">{fmtAbsTime(r.syncedAt)}</td>
                  <td className="text-right py-2 pr-3 font-semibold text-[hsl(var(--foreground))]">
                    {formatCurrency(r.price, currency)}
                  </td>
                  <td className="text-right py-2">
                    {r.changePct !== null ? (
                      <span className={r.changePct >= 0 ? "text-emerald-500 font-semibold" : "text-red-500 font-semibold"}>
                        {r.changePct >= 0 ? "▲" : "▼"} {Math.abs(r.changePct).toFixed(2)}%
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

type Filter = "all" | "crypto" | "stock_us" | "stock_idx" | "gold" | "mutual_fund" | "deposito";

export default function Portfolio() {
  const { currency } = useSettingsStore();

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
  const [syncFinishedAt, setSyncFinishedAt] = useState<number | null>(null);
  const syncFinishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-asset price history modal
  const [historyTarget, setHistoryTarget] = useState<Asset | null>(null);

  // Summary metrics tab (0=total, 1=modal vs nilai, 2=roi overall)
  const [summaryTab, setSummaryTab] = useState(0);

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
    // Save today's snapshot based on current stored prices
    const snap = a.reduce((sum, asset) => {
      const p = map[asset.symbol]?.priceIdr ?? asset.manualPriceIdr ?? 0;
      return sum + asset.quantity * p;
    }, 0);
    if (snap > 0) await savePortfolioSnapshot(snap);
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
    const list = assetsToSync ?? assets;
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
    setSyncFinishedAt(null);
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
      const snap = list.reduce((sum, a) => {
        const p = map[a.symbol]?.priceIdr ?? a.manualPriceIdr ?? 0;
        return sum + a.quantity * p;
      }, 0);
      if (snap > 0) {
        await savePortfolioSnapshot(snap);
        setHistory(await getPortfolioHistory(30));
      }

      // Build sync log entry — only for auto-syncable types (exclude manual: reksa dana, deposito)
      // Only save if at least one asset was actually synced (respects 6-hour rule)
      const logResults = list
        .filter((a) => a.type !== "mutual_fund" && a.type !== "deposito")
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

      const msgs: string[] = [];
      if (msgs.length) {
        setSyncMsg(msgs.join(" · ") + " — Buka Setelan → Portofolio.");
      } else {
        setSyncMsg("");
      }
      // Show toast "done" state, then auto-hide after 3.5s
      setSyncFinishedAt(Date.now());
      syncFinishTimerRef.current = setTimeout(() => {
        setSyncProgress({});
        setSyncErrors({});
        setSyncFinishedAt(null);
      }, 5000);
    } catch {
      setSyncMsg("❌ Sinkronisasi gagal. Cek koneksi internet.");
      setSyncFinishedAt(Date.now());
      syncFinishTimerRef.current = setTimeout(() => {
        setSyncProgress({});
        setSyncErrors({});
        setSyncFinishedAt(null);
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

  // Summary calculations
  const totalValue = assets.reduce((sum, a) => {
    const p = prices[a.symbol]?.priceIdr ?? a.manualPriceIdr ?? null;
    return sum + (p !== null ? a.quantity * p : 0);
  }, 0);
  const totalCost = assets.reduce((sum, a) => sum + a.quantity * a.avgBuyPrice, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  // Pie chart data — grouped by category
  const CATEGORY_META: Record<string, { label: string; color: string }> = {
    crypto:        { label: "Kripto",       color: "#6366f1" },
    stock_us:      { label: "Saham US",     color: "#22c55e" },
    stock_idx:     { label: "Saham IDX",    color: "#f97316" },
    gold_physical: { label: "Emas Fisik",   color: "#f59e0b" },
    gold_digital:  { label: "Emas Digital", color: "#fbbf24" },
    mutual_fund:   { label: "Reksa Dana",   color: "#14b8a6" },
    deposito:      { label: "Deposito",     color: "#3b82f6" },
  };
  const categoryTotals: Record<string, number> = {};
  for (const a of assets) {
    const p = prices[a.symbol]?.priceIdr ?? a.manualPriceIdr ?? 0;
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

  return (
    <div className="p-3.5 pb-24 space-y-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">Portofolio</h1>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleSync()}
          disabled={syncing || assets.length === 0}
          className="gap-1.5"
        >
          <span className={syncing ? "animate-spin" : ""}>🔄</span>
          {syncing ? "Memperbarui…" : "Sync Harga"}
        </Button>
      </div>

      {syncMsg && (
        <p className="text-xs px-3 py-2 rounded-xl bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
          {syncMsg}
        </p>
      )}

      {assets.length > 0 && (
        <>
          {/* Summary Card with Metric Tabs */}
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
            {/* Tab buttons */}
            <div className="flex border-b border-[hsl(var(--border))]">
              {(["Summary", "Performance"] as const).map((label, idx) => (
                <button
                  key={idx}
                  onClick={() => setSummaryTab(idx)}
                  className={`flex-1 py-1.5 text-[11px] font-semibold transition-colors ${
                    summaryTab === idx
                      ? "bg-indigo-600 text-white"
                      : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-2.5 space-y-1">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                  {summaryTab === 0 ? "Overview" : "Performa"}
                </div>
                <button onClick={togglePortfolioHidden} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors p-0.5">
                  {portfolioHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {/* Tab 0: Summary */}
              {summaryTab === 0 && (
                <div className="space-y-2.5">
                  {/* Total Value — prominent */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-0.5">Total Portofolio</p>
                    <p className="text-xl font-bold text-[hsl(var(--foreground))]">
                      {portfolioHidden ? <span className="tracking-widest">••••••</span> : formatCurrency(totalValue, currency)}
                    </p>
                  </div>
                  {/* Modal + Keuntungan mini-cards */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-[hsl(var(--muted))] px-2.5 py-2">
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] mb-0.5">Modal</p>
                      <p className="text-xs font-semibold text-[hsl(var(--foreground))]">
                        {portfolioHidden ? "•••" : formatCurrency(totalCost, currency)}
                      </p>
                    </div>
                    <div className={`rounded-xl px-2.5 py-2 ${totalGain >= 0 ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                      <p className={`text-[10px] mb-0.5 ${totalGain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>Keuntungan</p>
                      {portfolioHidden ? (
                        <p className="text-xs font-bold text-[hsl(var(--muted-foreground))]">•••</p>
                      ) : (
                        <>
                          <p className={`text-xs font-bold ${totalGain >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {totalGain >= 0 ? "+" : ""}{formatCurrency(totalGain, currency)}
                          </p>
                          <p className={`text-[10px] font-semibold ${totalGain >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {fmtPct(totalGainPct)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 1: Performance (ROI + Best/Worst Assets) */}
              {summaryTab === 1 && (() => {
                const bestAsset = assets.length > 0
                  ? assets.reduce((best, a) => {
                      const p = prices[a.symbol]?.priceIdr ?? a.manualPriceIdr ?? null;
                      const val = p !== null ? a.quantity * p : null;
                      const gain = val !== null ? val - a.quantity * a.avgBuyPrice : null;
                      const pct = gain !== null ? (gain / (a.quantity * a.avgBuyPrice)) * 100 : -Infinity;
                      const bestPct = best.pct ?? -Infinity;
                      return pct > bestPct ? { asset: a, pct } : best;
                    }, { asset: null as Asset | null, pct: null as number | null })
                  : { asset: null, pct: null };

                const worstAsset = assets.length > 0
                  ? assets.reduce((worst, a) => {
                      const p = prices[a.symbol]?.priceIdr ?? a.manualPriceIdr ?? null;
                      const val = p !== null ? a.quantity * p : null;
                      const gain = val !== null ? val - a.quantity * a.avgBuyPrice : null;
                      const pct = gain !== null ? (gain / (a.quantity * a.avgBuyPrice)) * 100 : Infinity;
                      const worstPct = worst.pct ?? Infinity;
                      return pct < worstPct ? { asset: a, pct } : worst;
                    }, { asset: null as Asset | null, pct: null as number | null })
                  : { asset: null, pct: null };

                return (
                  <div className="space-y-2">
                    {/* ROI row inline */}
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">ROI Keseluruhan</p>
                      <p className={`text-base font-bold ${totalGainPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {portfolioHidden ? "•••" : fmtPct(totalGainPct)}
                      </p>
                    </div>
                    {/* Best / Worst cards side by side */}
                    <div className="grid grid-cols-2 gap-2">
                      {bestAsset.asset && bestAsset.pct !== null && (
                        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2.5 py-2 min-w-0">
                          <p className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400 mb-0.5">🚀 Terbaik</p>
                          <p className="text-xs font-bold text-[hsl(var(--foreground))] truncate">{bestAsset.asset.symbol}</p>
                          <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate">{bestAsset.asset.name}</p>
                          <p className="text-sm font-bold text-emerald-500 mt-0.5">{fmtPct(bestAsset.pct)}</p>
                        </div>
                      )}
                      {worstAsset.asset && worstAsset.pct !== null && worstAsset.pct !== Infinity && (
                        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2.5 py-2 min-w-0">
                          <p className="text-[9px] font-medium text-red-600 dark:text-red-400 mb-0.5">📉 Terburuk</p>
                          <p className="text-xs font-bold text-[hsl(var(--foreground))] truncate">{worstAsset.asset.symbol}</p>
                          <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate">{worstAsset.asset.name}</p>
                          <p className="text-sm font-bold text-red-500 mt-0.5">{fmtPct(worstAsset.pct)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Portfolio Value History */}
          {history.length > 1 && (
            <div className="rounded-2xl border border-[hsl(var(--border))] p-4 bg-[hsl(var(--card))]">
              <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-3">📈 Riwayat Nilai Portofolio</p>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={history} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(d: string) => d.slice(5)} // MM-DD
                    interval="preserveStartEnd"
                  />
                  <Tooltip
                    formatter={(val) => [formatCurrency(Number(val), currency), "Nilai"]}
                    labelFormatter={(label) => String(label)}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                  <Area dataKey="totalValue" name="Nilai" stroke="#6366f1" strokeWidth={2} fill="url(#portGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Allocation Table */}
          {pieData.length > 0 && (
            <div className="rounded-2xl border border-[hsl(var(--border))] p-3.5 bg-[hsl(var(--card))]">
              <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-3">Alokasi Portofolio</p>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs">
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
                            {formatCurrency(d.value, currency)}
                          </td>
                          <td className="py-2 px-1 text-right text-[hsl(var(--muted-foreground))]">
                            {pct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Filter Tabs — Horizontal Scroll */}
      {assets.length > 0 && (
        <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
          <div className="flex gap-1.5 w-max">
            {(["all", "crypto", "stock_us", "stock_idx", "gold", "mutual_fund", "deposito"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 rounded-lg font-medium text-xs whitespace-nowrap transition-colors ${
                  filter === f
                    ? "bg-indigo-600 text-white"
                    : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                }`}
              >
                {f === "all" ? "Semua" : f === "crypto" ? "₿ Kripto" : f === "stock_us" ? "🇺🇸 US" : f === "stock_idx" ? "🇮🇩 IDX" : f === "gold" ? "🥇 Emas" : f === "mutual_fund" ? "📈 RD" : "🏦 Depo"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Asset List */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              price={prices[asset.symbol]}
              currency={currency}
              onEdit={() => setEditTarget(asset)}
              onDelete={() => setDeleteTarget(asset)}
              onHistory={() => setHistoryTarget(asset)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-[hsl(var(--muted-foreground))]">
          <div className="text-5xl mb-3">📈</div>
          <p className="font-medium">Belum ada aset portofolio</p>
          <p className="text-sm mt-1">Tap tombol di bawah untuk menambahkan saham atau kripto</p>
        </div>
      )}

      {/* Sync note for stocks */}
      {assets.some((a) => a.type === "stock_us" || a.type === "stock" || a.type === "stock_idx") && (
        <p className="text-xs text-center text-[hsl(var(--muted-foreground))]">
          💡 Saham AS: sync otomatis via Alpha Vantage · Saham IDX: perbarui harga manual di edit aset
        </p>
      )}

      {/* Modals */}
      <AssetForm open={addOpen} onClose={() => setAddOpen(false)} onSaved={loadAll} />
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
          currency={currency}
          onClose={() => setHistoryTarget(null)}
        />
      )}

      {/* Floating Sync Progress Toast */}
      <SyncProgressToast
        assets={assets}
        progress={syncProgress}
        errors={syncErrors}
        syncing={syncing}
        finishedAt={syncFinishedAt}
      />

      {/* Floating Add button */}
      <div className="fixed bottom-20 right-4 z-100 flex flex-col items-end gap-2">
        <button
          onClick={() => setAddOpen(true)}
          className="w-12 h-12 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-500 active:scale-95 transition"
        >
          <Plus size={18} className="mx-auto" />
        </button>
      </div>
    </div>
  );
}
