import { useState } from "react";
import { useSettingsStore } from "@/stores/walletStore";
import { Card, CardContent, Button, Modal } from "@/components/ui";
import { exportJSON, exportCSV, importJSON } from "@/lib/backup";
import { useWalletStore } from "@/stores/walletStore";
import { db, seedMissingDefaultCategories } from "@/db/db";
import { deleteCategory } from "@/db/categories";
import { CategoryForm } from "@/components/forms/CategoryForm";
import { Sun, Moon, Download, Upload, Trash2, Pencil, Plus, RefreshCw, Lock } from "lucide-react";
import { usePinStore } from "@/stores/walletStore";
import type { Category } from "@/types";

export default function Settings() {
  const { theme, currency, setTheme, setCurrency } = useSettingsStore();
  const { refreshAll, categories } = useWalletStore();
  const { pin, setPin } = usePinStore();

  // PIN setup state
  const [pinStep, setPinStep] = useState<null | "enter" | "confirm">(null);
  const [pinDraft, setPinDraft] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  function startSetPin() { setPinStep("enter"); setPinInput(""); setPinDraft(""); setPinError(""); }
  function cancelPin() { setPinStep(null); setPinInput(""); setPinDraft(""); setPinError(""); }
  function handlePinDigit(d: string) {
    if (pinInput.length >= 4) return;
    const next = pinInput + d;
    setPinInput(next);
    if (next.length === 4) {
      if (pinStep === "enter") {
        setPinDraft(next);
        setPinStep("confirm");
        setTimeout(() => setPinInput(""), 100);
      } else {
        if (next === pinDraft) {
          setPin(next);
          cancelPin();
        } else {
          setPinError("PIN tidak cocok, ulangi dari awal");
          setPinDraft("");
          setPinStep("enter");
          setTimeout(() => { setPinInput(""); setPinError(""); }, 800);
        }
      }
    }
  }
  function handlePinDel() { setPinInput((v) => v.slice(0, -1)); }
  const [importMode, setImportMode] = useState<"replace" | "merge">("merge");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);
  const [catFormOpen, setCatFormOpen] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [deleteCatId, setDeleteCatId] = useState<number | null>(null);
  const [restoringCats, setRestoringCats] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg("");
    try {
      await importJSON(file, importMode);
      await refreshAll();
      setImportMsg("✅ Data berhasil diimport!");
    } catch (err) {
      setImportMsg("❌ Gagal import: " + (err instanceof Error ? err.message : "File tidak valid"));
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  async function handleRestoreDefaultCategories() {
    setRestoringCats(true);
    setRestoreMsg("");
    try {
      const added = await seedMissingDefaultCategories();
      await refreshAll();
      setRestoreMsg(added > 0 ? `✅ ${added} kategori default berhasil dipulihkan.` : "✅ Semua kategori default sudah ada.");
    } finally {
      setRestoringCats(false);
    }
  }

  async function handleClearAll() {
    await db.transaction("rw", [db.accounts, db.categories, db.transactions], async () => {
      await db.accounts.clear();
      await db.transactions.clear();
    });
    await refreshAll();
    setClearConfirm(false);
  }

  return (
    <div className="p-4 space-y-5">
      <div className="pt-2">
        <h1 className="text-xl font-bold">Pengaturan</h1>
      </div>

      {/* Theme */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-semibold">Tampilan</p>
          <div className="flex gap-3">
            <button
              onClick={() => setTheme("light")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                theme === "light" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600" : "border-[hsl(var(--border))]"
              }`}
            >
              <Sun size={16} /> Light
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                theme === "dark" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600" : "border-[hsl(var(--border))]"
              }`}
            >
              <Moon size={16} /> Dark
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Currency */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-semibold">Mata Uang</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { code: "IDR", label: "IDR (Rp)" },
              { code: "USD", label: "USD ($)" },
              { code: "SGD", label: "SGD (S$)" },
              { code: "MYR", label: "MYR (RM)" },
            ].map(({ code, label }) => (
              <button
                key={code}
                onClick={() => setCurrency(code)}
                className={`px-3 py-1.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                  currency === code ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600" : "border-[hsl(var(--border))]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Backup */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-semibold">Backup & Restore Data</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Data tersimpan di perangkat ini (IndexedDB). Export secara rutin untuk backup.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={exportJSON} className="gap-2">
              <Download size={15} /> Export JSON
            </Button>
            <Button variant="outline" onClick={exportCSV} className="gap-2">
              <Download size={15} /> Export CSV
            </Button>
          </div>

          <div className="space-y-2 border-t border-[hsl(var(--border))] pt-3">
            <p className="text-xs font-medium">Mode Import</p>
            <div className="flex gap-2">
              <button
                onClick={() => setImportMode("merge")}
                className={`flex-1 py-2 rounded-xl border-2 text-xs font-medium transition-colors ${
                  importMode === "merge" ? "border-indigo-500 text-indigo-600" : "border-[hsl(var(--border))]"
                }`}
              >
                Merge (gabungkan)
              </button>
              <button
                onClick={() => setImportMode("replace")}
                className={`flex-1 py-2 rounded-xl border-2 text-xs font-medium transition-colors ${
                  importMode === "replace" ? "border-red-500 text-red-600" : "border-[hsl(var(--border))]"
                }`}
              >
                Replace (timpa semua)
              </button>
            </div>

            <label className="block">
              <div
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-medium cursor-pointer transition-colors ${
                  importing ? "opacity-50 pointer-events-none" : "hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                } border-[hsl(var(--border))]`}
              >
                <Upload size={15} /> {importing ? "Mengimport..." : "Import JSON"}
              </div>
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>

            {importMsg && <p className="text-xs text-center py-2">{importMsg}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Kelola Kategori</p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRestoreDefaultCategories}
                disabled={restoringCats}
                className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-indigo-500 font-medium disabled:opacity-50"
              >
                <RefreshCw size={13} className={restoringCats ? "animate-spin" : ""} /> Pulihkan Default
              </button>
              <button
                onClick={() => setCatFormOpen(true)}
                className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium"
              >
                <Plus size={14} /> Tambah
              </button>
            </div>
          </div>
          {restoreMsg && <p className="text-xs text-center py-1">{restoreMsg}</p>}
          <div className="space-y-1">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-[hsl(var(--accent))]">
                <span
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-none"
                  style={{ background: `${cat.color}22` }}
                >
                  {cat.icon}
                </span>
                <span className="flex-1 text-sm font-medium truncate">{cat.name}</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium flex-none"
                  style={{ background: `${cat.color}22`, color: cat.color }}
                >
                  {cat.type === "expense" ? "Pengeluaran" : cat.type === "income" ? "Pemasukan" : "Keduanya"}
                </span>
                <button
                  onClick={() => setEditCat(cat)}
                  className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-indigo-500 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                >
                  <Pencil size={13} />
                </button>
                {!cat.isDefault && (
                  <button
                    onClick={() => setDeleteCatId(cat.id!)}
                    className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* PIN Lock */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lock size={15} />
            <p className="text-sm font-semibold">Kunci PIN</p>
            {pin && <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400 font-medium">✅ Aktif</span>}
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">PIN 4 digit dikunci saat tab ditutup lalu dibuka kembali.</p>

          {pinStep === null ? (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1" onClick={startSetPin}>
                <Lock size={13} /> {pin ? "Ubah PIN" : "Aktifkan PIN"}
              </Button>
              {pin && (
                <Button variant="destructive" className="flex-1" onClick={() => setPin(null)}>
                  Hapus PIN
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium text-[hsl(var(--foreground))]">
                {pinStep === "enter" ? "Masukkan PIN baru (4 digit)" : "Konfirmasi PIN"}
              </p>
              {/* Dots */}
              <div className="flex gap-3 justify-center">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < pinInput.length ? "bg-indigo-600 border-indigo-600" : "border-[hsl(var(--border))]"}`} />
                ))}
              </div>
              {pinError && <p className="text-xs text-red-500 text-center">{pinError}</p>}
              {/* Mini numpad */}
              <div className="grid grid-cols-3 gap-2">
                {["1","2","3","4","5","6","7","8","9"].map((d) => (
                  <button key={d} onClick={() => handlePinDigit(d)}
                    className="h-11 rounded-xl bg-[hsl(var(--muted))] text-sm font-semibold hover:bg-[hsl(var(--accent))] active:scale-95 transition-transform">
                    {d}
                  </button>
                ))}
                <button onClick={cancelPin} className="h-11 rounded-xl bg-[hsl(var(--muted))] text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] active:scale-95 transition-transform">Batal</button>
                <button onClick={() => handlePinDigit("0")} className="h-11 rounded-xl bg-[hsl(var(--muted))] text-sm font-semibold hover:bg-[hsl(var(--accent))] active:scale-95 transition-transform">0</button>
                <button onClick={handlePinDel} className="h-11 rounded-xl bg-[hsl(var(--muted))] text-sm font-semibold hover:bg-[hsl(var(--accent))] active:scale-95 transition-transform">⌫</button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-semibold text-red-500">Zona Bahaya</p>
          <Button variant="destructive" className="w-full gap-2" onClick={() => setClearConfirm(true)}>
            <Trash2 size={15} /> Hapus Semua Data
          </Button>
        </CardContent>
      </Card>

      <div className="text-center text-xs text-[hsl(var(--muted-foreground))] pb-2">Wallet Manager v1.0 · Data lokal di perangkat ini</div>

      {/* ── Category Management Modals ── */}
      <CategoryForm
        open={catFormOpen || editCat !== null}
        onClose={() => { setCatFormOpen(false); setEditCat(null); }}
        onSaved={() => { void refreshAll(); setCatFormOpen(false); setEditCat(null); }}
        existing={editCat ?? undefined}
      />

      <Modal open={deleteCatId !== null} onClose={() => setDeleteCatId(null)} title="Hapus Kategori">
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">Yakin ingin menghapus kategori ini? Transaksi yang terkait tidak akan dihapus, hanya kategorinya yang dilepas.</p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setDeleteCatId(null)}>Batal</Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={async () => {
              if (deleteCatId !== null) {
                await deleteCategory(deleteCatId);
                await refreshAll();
                setDeleteCatId(null);
              }
            }}
          >
            Hapus
          </Button>
        </div>
      </Modal>

      <Modal open={clearConfirm} onClose={() => setClearConfirm(false)} title="Hapus Semua Data">
        <div className="space-y-4">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Yakin? Semua akun dan transaksi akan dihapus permanen. Pastikan sudah backup terlebih dahulu.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setClearConfirm(false)}>
              Batal
            </Button>
            <Button variant="destructive" className="flex-1" onClick={handleClearAll}>
              Ya, Hapus Semua
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
