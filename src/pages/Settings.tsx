import { useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/walletStore";
import { Button, ConfirmDialog, PageHeader, SegmentedControl, ListGroup, ListRow, Sheet, Switch } from "@/components/ui";
import { createBackupData, exportJSON, exportCSV, importJSON } from "@/lib/backup";
import { useWalletStore } from "@/stores/walletStore";
import { db } from "@/db/db";
import { Download, Upload, RefreshCw } from "lucide-react";
import { usePinStore } from "@/stores/walletStore";
import type { CloudBackupSettings, GoogleAuthState, GoogleDriveBackupFile } from "@/types";
import { getGoogleAccessToken, getGoogleAuthState, signOutGoogleDrive } from "@/services/googleDriveAuth";
import { downloadBackupFromDrive, listBackupsFromDrive, uploadBackupToDrive } from "@/services/googleDrive";
import { getCloudBackupSettings, saveCloudBackupSettings } from "@/services/cloudBackupScheduler";
import { isAIOnline } from "@/lib/aiGuard";
import { getAIModel } from "@/lib/geminiModel";

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
  const [importOpen, setImportOpen] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);
  const [aiKey, setAiKey] = useState(() => localStorage.getItem("deepseek_api_key") ?? "");
  const aiModel = getAIModel();
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);
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

  function handleSaveAIKey() {
    localStorage.setItem("deepseek_api_key", aiKey.trim());
    localStorage.setItem("deepseek_model", aiModel);
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2000);
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
      setImportOpen(false);
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

  const pad = "space-y-3 px-4 py-3";
  const field = "w-full rounded-xl border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-base placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]";
  const numKey = "h-11 rounded-xl bg-[hsl(var(--surface-2))] text-sm font-semibold active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]";

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pt-5 pb-4 lg:px-0 lg:pt-7">
      <PageHeader title="Pengaturan" back="/accounts" />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <ListGroup title="Tampilan">
            <ListRow
              label="Tema"
              value={
                <span className="block w-44">
                  <SegmentedControl
                    label="Tema"
                    value={theme === "dark" ? "dark" : "light"}
                    options={[{ value: "light", label: "Terang" }, { value: "dark", label: "Gelap" }]}
                    onChange={(v) => setTheme(v)}
                  />
                </span>
              }
            />
            <ListRow
              label="Mata uang"
              value={
                <select
                  aria-label="Mata uang"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="min-h-11 rounded-xl border border-[hsl(var(--border))] bg-transparent px-3 text-sm text-[hsl(var(--foreground))]"
                >
                  <option value="IDR">IDR (Rp)</option>
                  <option value="USD">USD ($)</option>
                  <option value="SGD">SGD (S$)</option>
                  <option value="MYR">MYR (RM)</option>
                </select>
              }
            />
            <ListRow label="Kategori" sub="Kelola kategori pengeluaran & pemasukan" value={categories.length} href="/categories" />
          </ListGroup>

          <ListGroup title="Keamanan">
            <ListRow
              label="Kunci PIN"
              sub="PIN 4 digit dikunci saat tab ditutup lalu dibuka kembali."
              value={<span className={pin ? "font-medium text-success" : ""}>{pin ? "Aktif" : "Nonaktif"}</span>}
            />
            {pinStep === null ? (
              <div className="flex gap-2 px-4 py-3">
                <Button variant="outline" className="min-h-11 flex-1" onClick={startSetPin}>
                  {pin ? "Ubah PIN" : "Aktifkan PIN"}
                </Button>
                {pin && (
                  <Button variant="destructive" className="min-h-11 flex-1" onClick={() => setPin(null)}>
                    Hapus PIN
                  </Button>
                )}
              </div>
            ) : (
              <div className="mx-auto max-w-xs space-y-3 px-4 py-3">
                <p className="text-xs font-medium text-[hsl(var(--foreground))]">
                  {pinStep === "enter" ? "Masukkan PIN baru (4 digit)" : "Konfirmasi PIN"}
                </p>
                <div className="flex justify-center gap-3" role="status" aria-label={`${pinInput.length} dari 4 digit terisi`}>
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={`h-4 w-4 rounded-full border-2 transition-all ${i < pinInput.length ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]" : "border-[hsl(var(--border))]"}`} />
                  ))}
                </div>
                {pinError && <p role="alert" className="text-center text-xs text-danger">{pinError}</p>}
                <div className="grid grid-cols-3 gap-2">
                  {["1","2","3","4","5","6","7","8","9"].map((d) => (
                    <button key={d} onClick={() => handlePinDigit(d)} className={numKey}>{d}</button>
                  ))}
                  <button onClick={cancelPin} className={`${numKey} text-xs font-normal text-[hsl(var(--muted-foreground))]`}>Batal</button>
                  <button onClick={() => handlePinDigit("0")} className={numKey}>0</button>
                  <button aria-label="Hapus digit PIN" onClick={handlePinDel} className={numKey}>⌫</button>
                </div>
              </div>
            )}
          </ListGroup>

          <ListGroup title="Asisten AI">
            <ListRow
              label="Status AI"
              sub="Fitur AI hanya aktif saat perangkat terhubung internet."
              value={<span className={aiOnline ? "font-medium text-success" : "font-medium text-warning"}>{aiOnline ? "Online" : "Offline"}</span>}
            />
            <div className={pad}>
              <label htmlFor="deepseek-api-key" className="text-sm font-medium text-[hsl(var(--foreground))]">API Key</label>
              <div className="relative">
                <input
                  id="deepseek-api-key"
                  autoComplete="off"
                  spellCheck={false}
                  type={showAiKey ? "text" : "password"}
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  placeholder="sk-..."
                  className={`${field} min-h-11 pr-24`}
                />
                <button
                  type="button"
                  aria-label={showAiKey ? "Sembunyikan API key" : "Tampilkan API key"}
                  aria-pressed={showAiKey}
                  onClick={() => setShowAiKey((v) => !v)}
                  className="absolute right-1 top-1/2 min-h-11 -translate-y-1/2 px-3 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  {showAiKey ? "Sembunyikan" : "Lihat"}
                </button>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Dapatkan API key dari platform.deepseek.com. Key disimpan lokal di perangkatmu. Dipakai untuk "Catat dari Teks", "Scan Struk", dan insight naratif.
              </p>
              <Button onClick={handleSaveAIKey} className="min-h-11 w-full">
                {aiSaved ? "✅ Tersimpan!" : "Simpan API Key"}
              </Button>
            </div>
            <div className="space-y-1 px-4 py-3 text-xs text-warning">
              <p className="text-sm font-medium">Privasi AI</p>
              <p>Teks atau foto struk yang kamu kirim ke fitur AI akan diproses oleh DeepSeek API (api.deepseek.com).</p>
              <p>Jangan kirim data sensitif (nomor kartu, PIN, OTP, atau informasi rahasia lain).</p>
            </div>
          </ListGroup>
        </div>

        <div className="space-y-5">
          <ListGroup title="Backup">
            <ListRow
              label="Google Drive"
              sub="Simpan backup JSON ke Google Drive."
              value={<span className={cloudAuth.isSignedIn ? "font-medium text-success" : ""}>{cloudAuth.isSignedIn ? "Tersambung" : "Belum tersambung"}</span>}
            />
            <div className={pad}>
              {!cloudAuth.isConfigured && (
                <p className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-2 text-xs text-warning">
                  Backup cloud belum tersedia. Konfigurasi Google Drive perlu disiapkan oleh pengelola aplikasi.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {cloudAuth.isSignedIn ? (
                  <Button variant="outline" className="min-h-11" onClick={handleGoogleSignOut} disabled={cloudBusy || !cloudAuth.isConfigured}>
                    Logout Google
                  </Button>
                ) : (
                  <Button className="min-h-11" onClick={handleGoogleSignIn} disabled={cloudBusy || !cloudAuth.isConfigured}>
                    Login Google
                  </Button>
                )}
                <Button variant="outline" onClick={handleLoadCloudBackups} disabled={cloudBusy || !cloudAuth.isConfigured} className="min-h-11 gap-2">
                  <RefreshCw size={15} /> Muat Backup
                </Button>
              </div>
              <Button className="min-h-11 w-full" onClick={handleCloudBackupNow} disabled={cloudBusy || !cloudAuth.isConfigured}>
                {cloudBusy ? "Memproses..." : "Backup Sekarang ke Drive"}
              </Button>
            </div>

            <ListRow
              label="Backup otomatis"
              sub="Berjalan saat aplikasi terbuka, online, dan akun Google sudah login."
              value={
                <Switch
                  label="Backup otomatis"
                  checked={cloudSettings.enabled}
                  disabled={!cloudAuth.isConfigured}
                  onChange={(v) => saveCloudConfig({ ...cloudSettings, enabled: v })}
                />
              }
            />
            <ListRow
              label="Interval backup"
              value={
                <select
                  aria-label="Interval backup otomatis"
                  value={cloudSettings.intervalHours}
                  onChange={(e) => saveCloudConfig({ ...cloudSettings, intervalHours: Number(e.target.value) })}
                  disabled={!cloudAuth.isConfigured}
                  className="min-h-11 rounded-xl border border-[hsl(var(--border))] bg-transparent px-3 text-sm text-[hsl(var(--foreground))]"
                >
                  <option value={1}>Per 1 jam</option>
                  <option value={3}>Per 3 jam</option>
                  <option value={6}>Per 6 jam</option>
                  <option value={12}>Per 12 jam</option>
                  <option value={24}>Per 24 jam</option>
                </select>
              }
            />

            <div className={pad}>
              <p className="text-xs font-medium">Backup di Google Drive</p>
              {cloudBackups.length === 0 ? (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Belum ada data backup yang dimuat.</p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {cloudBackups.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{item.name}</p>
                        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                          {formatDateTime(item.createdTime)} · {formatBytes(item.size)}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => setRestoreTarget(item)} disabled={cloudBusy}>
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {cloudMsg && <p role="status" className="py-1 text-center text-xs">{cloudMsg}</p>}
            </div>

            <ListRow label="Backup lokal" sub="Unduh salinan data di perangkatmu." />
            <div className="grid grid-cols-2 gap-2 px-4 py-3">
              <Button variant="outline" onClick={exportJSON} className="min-h-11 gap-2">
                <Download size={15} /> Export JSON
              </Button>
              <Button variant="outline" onClick={exportCSV} className="min-h-11 gap-2">
                <Download size={15} /> Export CSV
              </Button>
            </div>
            <ListRow label="Pulihkan dari file JSON" sub={importing ? "Mengimport..." : "Gabungkan atau ganti data dari file backup."} onClick={() => { setImportMsg(""); setImportOpen(true); }} />
            {importMsg && !importOpen && <p role="status" className="px-4 py-3 text-center text-xs">{importMsg}</p>}
          </ListGroup>

          <ListGroup title="Zona bahaya">
            <ListRow label="Hapus semua data perangkat" sub="Menghapus akun dan transaksi secara permanen. Unduh backup terlebih dahulu." tone="danger" onClick={() => setClearConfirm(true)} />
          </ListGroup>
        </div>
      </div>

      <p className="pb-2 text-center text-xs text-[hsl(var(--muted-foreground))]">Wallet · data disimpan di perangkat ini</p>

      <Sheet open={importOpen} onClose={() => setImportOpen(false)} title="Pulihkan dari file JSON">
        <div className="space-y-4">
          <RestoreModeChoice name="import-mode" value={importMode} onChange={setImportMode} />
          <label className="relative block rounded-xl focus-within:ring-2 focus-within:ring-[hsl(var(--ring))]">
            <div className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[hsl(var(--border))] py-3 text-sm font-medium ${importing ? "pointer-events-none opacity-50" : "hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--surface-2))]"}`}>
              <Upload size={15} /> {importing ? "Mengimport..." : "Pilih file JSON"}
            </div>
            <input type="file" aria-label="Import JSON" accept=".json" disabled={importing} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={handleImport} />
          </label>
          {importMsg && <p role={importMsg.startsWith("❌") ? "alert" : "status"} className="text-center text-xs">{importMsg}</p>}
        </div>
      </Sheet>

      <Sheet open={Boolean(restoreTarget)} onClose={() => setRestoreTarget(null)} title="Restore dari cloud">
        <div className="space-y-4">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Pilih mode restore untuk <span className="font-medium text-[hsl(var(--foreground))]">{restoreTarget?.name}</span>.
          </p>
          <RestoreModeChoice name="cloud-mode" value={cloudImportMode} onChange={setCloudImportMode} />
          {cloudMsg && <p role={cloudMsg.startsWith("❌") ? "alert" : "status"} className="text-center text-xs">{cloudMsg}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="min-h-11 flex-1" onClick={() => setRestoreTarget(null)}>
              Batal
            </Button>
            <Button className="min-h-11 flex-1" onClick={handleRestoreCloudBackup} disabled={cloudBusy}>
              {cloudBusy ? "Memproses..." : "Restore"}
            </Button>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={clearConfirm}
        title="Hapus semua data?"
        description="Semua akun dan transaksi akan dihapus permanen. Pastikan sudah backup terlebih dahulu."
        confirmLabel="Ya, Hapus Semua"
        onConfirm={handleClearAll}
        onClose={() => setClearConfirm(false)}
      />
    </div>
  );
}

function RestoreModeChoice({ name, value, onChange }: { name: string; value: "replace" | "merge"; onChange: (v: "replace" | "merge") => void }) {
  const options = [
    { value: "merge" as const, label: "Gabungkan", sub: "Tambahkan data backup yang belum ada. Data di perangkat ini tetap aman." },
    { value: "replace" as const, label: "Ganti semua", sub: "Hapus data di perangkat ini, lalu pakai isi backup." },
  ];
  return (
    <div role="radiogroup" aria-label="Mode restore" className="space-y-2">
      {options.map((o) => (
        <label key={o.value} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 focus-within:ring-2 focus-within:ring-[hsl(var(--ring))] ${value === o.value ? "border-[hsl(var(--primary))] bg-[hsl(var(--surface-2))]" : "border-[hsl(var(--border))]"}`}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-1 accent-[hsl(var(--primary))]" />
          <span>
            <span className={`block text-sm font-medium ${o.value === "replace" ? "text-danger" : ""}`}>{o.label}</span>
            <span className="block text-xs text-[hsl(var(--muted-foreground))]">{o.sub}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
