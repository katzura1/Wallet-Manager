import { useCallback, useEffect, useRef, useState } from "react";
import { AreaChart, Area, PieChart, Pie, Cell, Tooltip, CartesianGrid, XAxis, ResponsiveContainer } from "recharts";
import { Button, Input, Modal } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { getAssets, addAsset, updateAsset, deleteAsset, savePortfolioSnapshot, getPortfolioHistory } from "@/db/assets";
import { syncAllPrices, searchCoins, anyPriceStale, getAlphaVantageKey, type CoinSearchResult } from "@/services/priceSync";
import { db } from "@/db/db";
import { useSettingsStore } from "@/stores/walletStore";
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
              {asset.type === "crypto" ? "₿" : asset.type === "stock_idx" ? "🇮🇩" : asset.type === "gold_physical" ? "🥇 Fisik" : asset.type === "gold_digital" ? "🥇 Digital" : asset.type === "mutual_fund" ? "📈 RD" : asset.type === "deposito" ? "🏦" : "🇺🇸"}
            </span>
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{asset.name}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">✏️</button>
          <button onClick={onDelete} className="p-1 text-[hsl(var(--muted-foreground))] hover:text-red-500">🗑️</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
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
        <span>{asset.quantity.toLocaleString("id-ID")} {asset.type === "gold_physical" || asset.type === "gold_digital" ? "gram" : asset.type === "deposito" ? "deposito" : "unit"}</span>
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

type Filter = "all" | "crypto" | "stock_us" | "stock_idx" | "gold" | "mutual_fund" | "deposito";

export default function Portfolio() {
  const { currency } = useSettingsStore();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [prices, setPrices] = useState<Record<string, AssetPrice>>({});
  const [history, setHistory] = useState<PortfolioHistory[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [noKey, setNoKey] = useState(!getAlphaVantageKey());
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
      // Save daily portfolio snapshot using fresh prices
      const snap = list.reduce((sum, a) => {
        const p = map[a.symbol]?.priceIdr ?? a.manualPriceIdr ?? 0;
        return sum + a.quantity * p;
      }, 0);
      if (snap > 0) {
        await savePortfolioSnapshot(snap);
        setHistory(await getPortfolioHistory(30));
      }
      const msgs: string[] = [];
      if (result.noKey && list.some((a) => a.type === "stock_us" || a.type === "stock")) {
        msgs.push("⚠️ Key Alpha Vantage belum diatur — saham AS tidak disinkron");
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
    crypto:        { label: "Kripto",      color: "#6366f1" },
    stock_us:      { label: "Saham US",    color: "#22c55e" },
    stock_idx:     { label: "Saham IDX",   color: "#f97316" },
    stock:         { label: "Saham US",    color: "#22c55e" },
    gold_physical: { label: "Emas Fisik",  color: "#f59e0b" },
    gold_digital:  { label: "Emas Digital",color: "#fbbf24" },
    mutual_fund:   { label: "Reksa Dana",  color: "#14b8a6" },
    deposito:      { label: "Deposito",     color: "#3b82f6" },
  };
  const categoryTotals: Record<string, number> = {};
  for (const a of assets) {
    const p = prices[a.symbol]?.priceIdr ?? a.manualPriceIdr ?? 0;
    const val = a.quantity * p;
    const key = a.type ?? "crypto";
    categoryTotals[key] = (categoryTotals[key] ?? 0) + val;
  }
  const pieData = Object.entries(categoryTotals)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => {
      const meta = CATEGORY_META[key] ?? { label: key, color: "#6b7280" };
      return { name: meta.label, value, color: meta.color };
    });

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

      {assets.length > 0 && (
        <>
          {/* Summary Card */}
          <div className="rounded-2xl bg-linear-to-br from-indigo-600 to-purple-600 p-5 text-white space-y-1">
            <p className="text-xs opacity-70">Total Portofolio</p>
            <p className="text-2xl font-bold">{formatCurrency(totalValue, currency)}</p>
            <div className="flex items-center gap-3 pt-1 text-xs">
              <span className="opacity-70">Modal: {formatCurrency(totalCost, currency)}</span>
              <span className={`font-semibold ${totalGain >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {totalGain >= 0 ? "▲" : "▼"} {formatCurrency(Math.abs(totalGain), currency)} ({fmtPct(totalGainPct)})
              </span>
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

          {/* Allocation Pie Chart */}
          {pieData.length > 0 && (
            <div className="rounded-2xl border border-[hsl(var(--border))] p-4 bg-[hsl(var(--card))]">
              <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-3">Alokasi Portofolio</p>
              <div className="flex items-center gap-4">
                <div className="w-36 h-36 shrink-0">
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
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
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
          {(["all", "crypto", "stock_us", "stock_idx", "gold", "mutual_fund", "deposito"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-1.5 font-medium transition-colors ${filter === f ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
            >
              {f === "all" ? "Semua" : f === "crypto" ? "₿" : f === "stock_us" ? "🇺🇸" : f === "stock_idx" ? "🇮🇩" : f === "gold" ? "🥇" : f === "mutual_fund" ? "📈" : "🏦"}
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

      {/* Floating Add button */}
      <button
        onClick={() => setAddOpen(true)}
        className="fixed bottom-25 right-4 z-40 flex items-center gap-2 rounded-full   bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-indigo-700 active:scale-95 transition-transform"
      >
        <span className="text-lg leading-none">+</span>
      </button>
    </div>
  );
}
