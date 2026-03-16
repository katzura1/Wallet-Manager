import { useCallback, useEffect, useRef, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Button, Input, Modal } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { getAssets, addAsset, updateAsset, deleteAsset } from "@/db/assets";
import { syncAllPrices, searchCoins, anyPriceStale, getAlphaVantageKey, getTwelveDataKey, type CoinSearchResult } from "@/services/priceSync";
import { db } from "@/db/db";
import { useSettingsStore } from "@/stores/walletStore";
import type { Asset, AssetPrice, AssetType } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const PIE_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#f59e0b", "#22c55e", "#14b8a6",
  "#3b82f6", "#06b6d4", "#84cc16", "#6b7280",
];

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
          <div className="flex rounded-xl border border-[hsl(var(--border))] overflow-hidden">
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
              className={`flex-1 py-2 text-sm font-medium transition-colors ${type === "stock_us" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}` }
            >
              🇺🇸 Saham AS
            </button>
            <button
              type="button"
              onClick={() => setType("stock_idx")}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${type === "stock_idx" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}` }
            >
              🇮🇩 Saham IDX
            </button>
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
                className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-indigo-500"
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

        {/* Stock IDX: symbol + name — manual price (no auto-sync API) */}
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
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2">
              💡 Saham IDX tidak mendukung sync otomatis. Masukkan harga di kolom &quot;Harga Manual&quot; di bawah.
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
            <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">{existing.type === "crypto" ? "₿ Kripto" : existing.type === "stock_idx" ? "🇮🇩 Saham IDX" : "🇺🇸 Saham AS"}</span>
          </div>
        )}

        <Input
          label="Jumlah / Lot"
          type="number"
          inputMode="decimal"
          placeholder="0.001"
          value={quantity}
          onChange={(e) => { setQuantity(e.target.value); setError(""); }}
          error={error}
        />

        <Input
          label={`Harga Beli Rata-rata (${currency})`}
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={avgBuyPrice}
          onChange={(e) => { setAvgBuyPrice(e.target.value); setError(""); }}
        />

        <Input
          label={`Harga Manual (${currency}) — opsional, jika sync gagal`}
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={manualPrice}
          onChange={(e) => setManualPrice(e.target.value)}
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
}

function AssetCard({ asset, price, currency, onEdit, onDelete }: AssetCardProps) {
  const currentPrice = price?.priceIdr ?? asset.manualPriceIdr ?? null;
  const currentValue = currentPrice !== null ? asset.quantity * currentPrice : null;
  const costBasis = asset.quantity * asset.avgBuyPrice;
  const gain = currentValue !== null ? currentValue - costBasis : null;
  const gainPct = gain !== null ? (gain / costBasis) * 100 : null;

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] p-4 space-y-3 bg-[hsl(var(--card))]">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[hsl(var(--foreground))]">{asset.symbol}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
              {asset.type === "crypto" ? "₿" : asset.type === "stock_idx" ? "🇮🇩" : "🇺🇸"}
            </span>
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{asset.name}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">✏️</button>
          <button onClick={onDelete} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-red-500">🗑️</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Nilai Saat Ini</p>
          <p className="font-semibold text-[hsl(var(--foreground))]">
            {currentValue !== null ? formatCurrency(currentValue, currency) : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Modal</p>
          <p className="font-medium">{formatCurrency(costBasis, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Keuntungan</p>
          {gain !== null && gainPct !== null ? (
            <p className={`font-semibold ${gainCls(gain)}`}>
              {formatCurrency(gain, currency)} <span className="text-xs">({fmtPct(gainPct)})</span>
            </p>
          ) : (
            <p className="text-[hsl(var(--muted-foreground))]">—</p>
          )}
        </div>
        <div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Harga / Unit</p>
          <p className="font-medium">
            {currentPrice !== null ? formatCurrency(currentPrice, currency) : "—"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
        <span>{asset.quantity.toLocaleString("id-ID")} unit</span>
        <div className="flex items-center gap-2">
          {price?.changePercent24h !== undefined && (
            <span className={gainCls(price.changePercent24h)}>
              {fmtPct(price.changePercent24h)} 24j
            </span>
          )}
          {price?.lastSynced && (
            <span>· {fmtAge(price.lastSynced)}</span>
          )}
          {!price && asset.manualPriceIdr && (
            <span className="italic">harga manual</span>
          )}
          {!price && !asset.manualPriceIdr && (
            <span className="text-amber-500">belum sinkron</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Portfolio Page ───────────────────────────────────────────────────────────

type Filter = "all" | "crypto" | "stock_us" | "stock_idx";

export default function Portfolio() {
  const { currency } = useSettingsStore();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [prices, setPrices] = useState<Record<string, AssetPrice>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [noKey, setNoKey] = useState(!getAlphaVantageKey());
  const [noIdxKey, setNoIdxKey] = useState(!getTwelveDataKey());
  const [filter, setFilter] = useState<Filter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Asset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);

  const loadAll = useCallback(async () => {
    const a = await getAssets();
    setAssets(a);
    const storedPrices = await db.assetPrices.toArray();
    const map: Record<string, AssetPrice> = {};
    for (const p of storedPrices) map[p.symbol] = p;
    setPrices(map);
    return a;
  }, []);

  // Auto-sync stale prices on page load (silent)
  useEffect(() => {
    loadAll().then(async (a) => {
      if (!a.length) return;
      if (await anyPriceStale(a)) {
        handleSync(a, true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSync(assetsToSync?: Asset[], silent = false) {
    const list = assetsToSync ?? assets;
    if (!list.length) return;
    setSyncing(true);
    if (!silent) setSyncMsg("");
    try {
      const result = await syncAllPrices(list);
      const freshPrices = await db.assetPrices.toArray();
      const map: Record<string, AssetPrice> = {};
      for (const p of freshPrices) map[p.symbol] = p;
      setPrices(map);
      setNoKey(!getAlphaVantageKey());
      setNoIdxKey(!getTwelveDataKey());
      const msgs: string[] = [];
      if (result.noKey && list.some((a) => a.type === "stock_us" || a.type === "stock")) {
        msgs.push("⚠️ Key Alpha Vantage belum diatur — saham AS tidak disinkron");
      }
      if (result.noIdxKey && list.some((a) => a.type === "stock_idx")) {
        msgs.push("⚠️ Key Twelve Data belum diatur — saham IDX tidak disinkron");
      }
      if (!silent) {
        if (msgs.length) {
          setSyncMsg(msgs.join(" · ") + " — Buka Setelan → Portofolio.");
        } else {
          const failMsg = result.failed.length ? ` · Gagal: ${result.failed.join(", ")}` : "";
          const skipMsg = result.skipped?.length ? ` · Segar (< 6j): ${result.skipped.join(", ")}` : "";
          const syncedMsg = result.synced.length
            ? `✅ Diperbarui: ${result.synced.join(", ")}${failMsg}${skipMsg}`
            : failMsg ? `❌${failMsg}${skipMsg}` : `✅ Semua harga sudah terkini${skipMsg}`;
          setSyncMsg(syncedMsg);
          setTimeout(() => setSyncMsg(""), 6000);
        }
      }
    } catch {
      if (!silent) setSyncMsg("❌ Sinkronisasi gagal. Cek koneksi internet.");
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
        : assets.filter((a) => a.type === filter);

  // Summary calculations
  const totalValue = assets.reduce((sum, a) => {
    const p = prices[a.symbol]?.priceIdr ?? a.manualPriceIdr ?? null;
    return sum + (p !== null ? a.quantity * p : 0);
  }, 0);
  const totalCost = assets.reduce((sum, a) => sum + a.quantity * a.avgBuyPrice, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  // Pie chart data
  const pieData = assets
    .map((a, i) => {
      const p = prices[a.symbol]?.priceIdr ?? a.manualPriceIdr ?? 0;
      return { name: a.symbol, value: a.quantity * p, color: PIE_COLORS[i % PIE_COLORS.length] };
    })
    .filter((d) => d.value > 0);

  return (
    <div className="p-4 pb-24 space-y-5 max-w-lg mx-auto">
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

      {/* No API key warning for US stocks */}
      {noKey && assets.some((a) => a.type === "stock_us" || a.type === "stock") && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm space-y-1">
          <p className="font-semibold text-amber-700 dark:text-amber-400">⚠️ API Key Saham AS Belum Diatur</p>
          <p className="text-amber-700 dark:text-amber-400 text-xs">
            Diperlukan API key <strong>Alpha Vantage</strong> (gratis) untuk sync harga saham AS.
            Buka <strong>Setelan → Portofolio</strong> untuk memasukkan key.
          </p>
        </div>
      )}

      {/* No API key warning for IDX stocks */}
      {noIdxKey && assets.some((a) => a.type === "stock_idx") && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm space-y-1">
          <p className="font-semibold text-amber-700 dark:text-amber-400">⚠️ API Key Saham IDX Belum Diatur</p>
          <p className="text-amber-700 dark:text-amber-400 text-xs">
            Diperlukan API key <strong>Twelve Data</strong> (gratis, 800 req/hari) untuk sync harga saham IDX.
            Buka <strong>Setelan → Portofolio</strong> untuk memasukkan key.
          </p>
        </div>
      )}

      {assets.length > 0 && (
        <>
          {/* Summary Card */}
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 p-5 text-white space-y-1">
            <p className="text-xs opacity-70">Total Portofolio</p>
            <p className="text-2xl font-bold">{formatCurrency(totalValue, currency)}</p>
            <div className="flex items-center gap-3 pt-1 text-sm">
              <span className="opacity-70">Modal: {formatCurrency(totalCost, currency)}</span>
              <span className={`font-semibold ${totalGain >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {totalGain >= 0 ? "▲" : "▼"} {formatCurrency(Math.abs(totalGain), currency)} ({fmtPct(totalGainPct)})
              </span>
            </div>
          </div>

          {/* Allocation Pie Chart */}
          {pieData.length > 0 && (
            <div className="rounded-2xl border border-[hsl(var(--border))] p-4 bg-[hsl(var(--card))]">
              <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-3">Alokasi Portofolio</p>
              <div className="flex items-center gap-4">
                <div className="w-36 h-36 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={60} paddingAngle={2} dataKey="value">
                        {pieData.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => [formatCurrency(Number(v), currency), ""]}
                        contentStyle={{ fontSize: "12px", borderRadius: "8px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-1.5">
                  {pieData.map((d) => {
                    const pct = totalValue > 0 ? (d.value / totalValue) * 100 : 0;
                    return (
                      <li key={d.name} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="font-medium text-[hsl(var(--foreground))]">{d.name}</span>
                        <span className="ml-auto text-[hsl(var(--muted-foreground))]">{pct.toFixed(1)}%</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </>
      )}

      {/* Filter Tabs */}
      {assets.length > 0 && (
        <div className="flex rounded-xl border border-[hsl(var(--border))] overflow-hidden text-sm">
          {(["all", "crypto", "stock_us", "stock_idx"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-1.5 font-medium transition-colors ${filter === f ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
            >
              {f === "all" ? "Semua" : f === "crypto" ? "₿ Kripto" : f === "stock_us" ? "🇺🇸 AS" : "🇮🇩 IDX"}
            </button>
          ))}
        </div>
      )}

      {/* Asset List */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              price={prices[asset.symbol]}
              currency={currency}
              onEdit={() => setEditTarget(asset)}
              onDelete={() => setDeleteTarget(asset)}
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

      {/* Add button */}
      <Button className="w-full" onClick={() => setAddOpen(true)}>
        + Tambah Aset
      </Button>

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
    </div>
  );
}
