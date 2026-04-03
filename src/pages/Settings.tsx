import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSettingsStore } from "@/stores/walletStore";
import { Card, CardContent, Button, Modal } from "@/components/ui";
import { createBackupData, exportJSON, exportCSV, importJSON } from "@/lib/backup";
import { useWalletStore } from "@/stores/walletStore";
import { db } from "@/db/db";
import { Sun, Moon, Download, Upload, Trash2, Lock, Tag, Cloud, RefreshCw } from "lucide-react";
import { usePinStore } from "@/stores/walletStore";
import type { CloudBackupSettings, GoogleAuthState, GoogleDriveBackupFile } from "@/types";
import { getGoogleAccessToken, getGoogleAuthState, signOutGoogleDrive } from "@/services/googleDriveAuth";
import { downloadBackupFromDrive, listBackupsFromDrive, uploadBackupToDrive } from "@/services/googleDrive";
import { getCloudBackupSettings, saveCloudBackupSettings } from "@/services/cloudBackupScheduler";
import { isAIOnline } from "@/lib/aiGuard";

export default function Settings() {
  const { theme, currency, setTheme, setCurrency } = useSettingsStore();
  const { refreshAll } = useWalletStore();
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
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("gemini_api_key") ?? "");
  const geminiModel = localStorage.getItem("gemini_model") ?? "gemini-2.5-flash";
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiSaved, setGeminiSaved] = useState(false);
  const [aiOnline, setAiOnline] = useState(() => isAIOnline());
  const [cloudAuth, setCloudAuth] = useState<GoogleAuthState>(() => getGoogleAuthState());
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMsg, setCloudMsg] = useState("");
  const [cloudBackups, setCloudBackups] = useState<GoogleDriveBackupFile[]>([]);
  const [restoreTarget, setRestoreTarget] = useState<GoogleDriveBackupFile | null>(null);
  const [cloudImportMode, setCloudImportMode] = useState<"replace" | "merge">("merge");
  const [cloudSettings, setCloudSettings] = useState<CloudBackupSettings>(() => getCloudBackupSettings());

  function refreshCloudAuthState() {
    setCloudAuth(getGoogleAuthState());
  }

  function saveCloudConfig(next: CloudBackupSettings) {
    setCloudSettings(next);
    saveCloudBackupSettings(next);
  }

  async function withCloudToken<T>(interactive: boolean, fn: (token: string) => Promise<T>): Promise<T> {
    const token = await getGoogleAccessToken(interactive);
    refreshCloudAuthState();
    return fn(token);
  }

  async function handleGoogleSignIn() {
    setCloudBusy(true);
    setCloudMsg("");
    try {
      await getGoogleAccessToken(true);
      refreshCloudAuthState();
      setCloudMsg("✅ Login Google berhasil.");
    } catch (error) {
      setCloudMsg("❌ Gagal login Google: " + (error instanceof Error ? error.message : "unknown error"));
    } finally {
      setCloudBusy(false);
    }
  }

  async function handleGoogleSignOut() {
    setCloudBusy(true);
    setCloudMsg("");
    try {
      await signOutGoogleDrive();
      refreshCloudAuthState();
      setCloudBackups([]);
      setCloudMsg("✅ Logout Google berhasil.");
    } catch (error) {
      setCloudMsg("❌ Gagal logout Google: " + (error instanceof Error ? error.message : "unknown error"));
    } finally {
      setCloudBusy(false);
    }
  }

  async function handleCloudBackupNow() {
    setCloudBusy(true);
    setCloudMsg("");
    try {
      const backup = await createBackupData();
      const uploaded = await withCloudToken(true, (token) => uploadBackupToDrive(token, backup));
      setCloudMsg(`✅ Backup berhasil diupload: ${uploaded.name}`);
      const items = await withCloudToken(false, (token) => listBackupsFromDrive(token));
      setCloudBackups(items);
    } catch (error) {
      setCloudMsg("❌ Backup cloud gagal: " + (error instanceof Error ? error.message : "unknown error"));
    } finally {
      setCloudBusy(false);
    }
  }

  async function handleLoadCloudBackups() {
    setCloudBusy(true);
    setCloudMsg("");
    try {
      const items = await withCloudToken(true, (token) => listBackupsFromDrive(token));
      setCloudBackups(items);
      setCloudMsg(items.length > 0 ? "✅ Daftar backup dimuat." : "Belum ada backup cloud.");
    } catch (error) {
      setCloudMsg("❌ Gagal ambil daftar backup: " + (error instanceof Error ? error.message : "unknown error"));
    } finally {
      setCloudBusy(false);
    }
  }

  async function handleRestoreCloudBackup() {
    if (!restoreTarget) return;

    setCloudBusy(true);
    setCloudMsg("");
    try {
      const blob = await withCloudToken(true, (token) => downloadBackupFromDrive(token, restoreTarget.id));
      const file = new File([blob], restoreTarget.name, { type: "application/json" });
      await importJSON(file, cloudImportMode);
      await refreshAll();
      setCloudMsg(`✅ Restore dari ${restoreTarget.name} berhasil (${cloudImportMode}).`);
      setRestoreTarget(null);
    } catch (error) {
      setCloudMsg("❌ Restore cloud gagal: " + (error instanceof Error ? error.message : "unknown error"));
    } finally {
      setCloudBusy(false);
    }
  }

  useEffect(() => {
    refreshCloudAuthState();
  }, []);

  useEffect(() => {
    const handleOnline = () => setAiOnline(true);
    const handleOffline = () => setAiOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  function handleSaveGeminiKey() {
    localStorage.setItem("gemini_api_key", geminiKey.trim());
    localStorage.setItem("gemini_model", geminiModel);
    setGeminiSaved(true);
    setTimeout(() => setGeminiSaved(false), 2000);
  }

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

  async function handleClearAll() {
    await db.transaction("rw", [db.accounts, db.categories, db.transactions], async () => {
      await db.accounts.clear();
      await db.transactions.clear();
    });
    await refreshAll();
    setClearConfirm(false);
  }

  function formatDateTime(value: string): string {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString("id-ID");
  }

  function formatBytes(bytes: number): string {
    if (bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exp);
    return `${value.toFixed(value >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`;
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

      {/* Cloud Backup */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Cloud size={15} />
            <p className="text-sm font-semibold">Cloud Backup (Google Drive)</p>
            {cloudAuth.isSignedIn && <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400 font-medium">✅ Tersambung</span>}
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Simpan backup JSON ke Google Drive. Restore tetap bisa dipilih mode merge atau replace.
          </p>

          {!cloudAuth.isConfigured && (
            <p className="text-xs rounded-xl border border-amber-400/40 bg-amber-100/50 dark:bg-amber-900/20 px-3 py-2 text-amber-700 dark:text-amber-300">
              VITE_GOOGLE_CLIENT_ID belum diatur. Tambahkan dulu di environment agar fitur cloud aktif.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {cloudAuth.isSignedIn ? (
              <Button variant="outline" onClick={handleGoogleSignOut} disabled={cloudBusy || !cloudAuth.isConfigured}>
                Logout Google
              </Button>
            ) : (
              <Button onClick={handleGoogleSignIn} disabled={cloudBusy || !cloudAuth.isConfigured}>
                Login Google
              </Button>
            )}

            <Button variant="outline" onClick={handleLoadCloudBackups} disabled={cloudBusy || !cloudAuth.isConfigured} className="gap-2">
              <RefreshCw size={15} /> Muat Backup
            </Button>
          </div>

          <Button className="w-full" onClick={handleCloudBackupNow} disabled={cloudBusy || !cloudAuth.isConfigured}>
            {cloudBusy ? "Memproses..." : "Backup Sekarang ke Drive"}
          </Button>

          <div className="space-y-2 border-t border-[hsl(var(--border))] pt-3">
            <p className="text-xs font-medium">Backup Otomatis</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveCloudConfig({ ...cloudSettings, enabled: !cloudSettings.enabled })}
                disabled={!cloudAuth.isConfigured}
                className={`flex-1 py-2 rounded-xl border-2 text-xs font-medium transition-colors ${
                  cloudSettings.enabled ? "border-emerald-500 text-emerald-600" : "border-[hsl(var(--border))]"
                }`}
              >
                {cloudSettings.enabled ? "Aktif" : "Nonaktif"}
              </button>
              <select
                value={cloudSettings.intervalHours}
                onChange={(e) => saveCloudConfig({ ...cloudSettings, intervalHours: Number(e.target.value) })}
                disabled={!cloudAuth.isConfigured}
                className="w-36 rounded-xl border border-[hsl(var(--border))] bg-transparent px-2 py-2 text-xs"
              >
                <option value={1}>Per 1 jam</option>
                <option value={3}>Per 3 jam</option>
                <option value={6}>Per 6 jam</option>
                <option value={12}>Per 12 jam</option>
                <option value={24}>Per 24 jam</option>
              </select>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Auto-backup berjalan saat aplikasi terbuka, online, dan akun Google sudah login.
            </p>
          </div>

          <div className="space-y-2 border-t border-[hsl(var(--border))] pt-3">
            <p className="text-xs font-medium">Backup di Google Drive</p>
            {cloudBackups.length === 0 ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Belum ada data backup yang dimuat.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {cloudBackups.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[hsl(var(--border))] p-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{item.name}</p>
                      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                        {formatDateTime(item.createdTime)} · {formatBytes(item.size)}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setRestoreTarget(item)} disabled={cloudBusy}>
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cloudMsg && <p className="text-xs text-center py-1">{cloudMsg}</p>}
        </CardContent>
      </Card>

      {/* Categories */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Kategori</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Kelola kategori pengeluaran &amp; pemasukan</p>
            </div>
            <Link
              to="/categories"
              className="flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
            >
              <Tag size={13} /> Kelola →
            </Link>
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

      {/* Gemini AI */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">✨ Gemini AI — Catat dari Teks</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              Diperlukan untuk fitur "Catat dari Teks", "Scan Struk", dan insight naratif.
            </p>
          </div>
          <p className={`text-xs rounded-xl border px-3 py-2 ${aiOnline ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
            Status AI: {aiOnline ? "Online" : "Offline"}. Fitur AI hanya aktif saat perangkat terhubung internet.
          </p>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]">Gemini API Key</label>
            <div className="relative">
              <input
                type={showGeminiKey ? "text" : "password"}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIza..."
                className="w-full rounded-xl border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-base placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-24"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] px-2 py-1"
              >
                {showGeminiKey ? "Sembunyikan" : "Lihat"}
              </button>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Dapatkan API key gratis di{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-500 underline"
              >
                Google AI Studio
              </a>.
              Key disimpan lokal di perangkatmu.
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 space-y-1">
            <p className="font-medium">Privacy Warning</p>
            <p>Teks atau foto struk yang kamu kirim ke fitur AI akan diproses oleh layanan Google Gemini.</p>
            <p>Jangan kirim data sensitif (nomor kartu, PIN, OTP, atau informasi rahasia lain).</p>
          </div>
          <Button onClick={handleSaveGeminiKey} className="w-full">
            {geminiSaved ? "✅ Tersimpan!" : "Simpan API Key"}
          </Button>
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

      <Modal open={Boolean(restoreTarget)} onClose={() => setRestoreTarget(null)} title="Restore dari Cloud">
        <div className="space-y-4">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Pilih mode restore untuk <span className="font-medium text-[hsl(var(--foreground))]">{restoreTarget?.name}</span>.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setCloudImportMode("merge")}
              className={`flex-1 py-2 rounded-xl border-2 text-xs font-medium transition-colors ${
                cloudImportMode === "merge" ? "border-indigo-500 text-indigo-600" : "border-[hsl(var(--border))]"
              }`}
            >
              Merge (gabungkan)
            </button>
            <button
              onClick={() => setCloudImportMode("replace")}
              className={`flex-1 py-2 rounded-xl border-2 text-xs font-medium transition-colors ${
                cloudImportMode === "replace" ? "border-red-500 text-red-600" : "border-[hsl(var(--border))]"
              }`}
            >
              Replace (timpa semua)
            </button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setRestoreTarget(null)}>
              Batal
            </Button>
            <Button className="flex-1" onClick={handleRestoreCloudBackup} disabled={cloudBusy}>
              {cloudBusy ? "Memproses..." : "Restore"}
            </Button>
          </div>
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
