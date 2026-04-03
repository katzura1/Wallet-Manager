import { useEffect, useRef, useState } from "react";
import { Button, Modal, Textarea, Select, Input } from "@/components/ui";
import { parseReceiptImage, parseTransactionText, type ParsedTransaction } from "@/lib/geminiParser";
import { addTransaction, addTransfer } from "@/db/transactions";
import { todayISO, formatNumberWithSeparator } from "@/lib/utils";
import { isAIOnline } from "@/lib/aiGuard";
import { Sparkles, Loader2, ChevronRight, AlertCircle } from "lucide-react";
import type { Account, Category } from "@/types";

interface AITransactionFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  accounts: Account[];
  categories: Category[];
}

type Step = "input" | "review";
type InputMode = "text" | "receipt";

export function AITransactionForm({ open, onClose, onSaved, accounts, categories }: AITransactionFormProps) {
  const [step, setStep] = useState<Step>("input");
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_api_key") ?? "");
  const model = localStorage.getItem("gemini_model") ?? "gemini-2.5-flash";
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<ParsedTransaction[]>([]);
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(() => isAIOnline());
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptBase64, setReceiptBase64] = useState("");
  const [receiptMimeType, setReceiptMimeType] = useState("image/jpeg");
  const [receiptFileName, setReceiptFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeAccounts = accounts.filter((a) => !a.isArchived);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  function handleClose() {
    setStep("input");
    setInputMode("text");
    setText("");
    setError("");
    setParsed([]);
    setReceiptPreview(null);
    setReceiptBase64("");
    setReceiptMimeType("image/jpeg");
    setReceiptFileName("");
    onClose();
  }

  function saveApiKey(key: string) {
    setApiKey(key);
    localStorage.setItem("gemini_api_key", key);
  }

  async function handleParse() {
    setError("");
    setLoading(true);
    try {
      const result = inputMode === "text"
        ? await parseTransactionText(text, apiKey, accounts, categories, model)
        : await parseReceiptImage({
            mimeType: receiptMimeType,
            base64Data: receiptBase64,
          }, apiKey, accounts, categories, model);
      setParsed(result.transactions);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setReceiptFileName(file.name);
    setReceiptMimeType(file.type || "image/jpeg");

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        setError("Gagal membaca file gambar. Coba pilih ulang.");
        return;
      }

      const [meta, base64] = result.split(",");
      const mimeMatch = meta.match(/data:(.*?);base64/);
      setReceiptPreview(result);
      setReceiptBase64(base64 ?? "");
      setReceiptMimeType(mimeMatch?.[1] || file.type || "image/jpeg");
    };
    reader.onerror = () => setError("Gagal membaca file gambar. Coba pilih ulang.");
    reader.readAsDataURL(file);
  }

  function updateTx(i: number, patch: Partial<ParsedTransaction>) {
    setParsed((prev) => prev.map((tx, idx) => (idx === i ? { ...tx, ...patch } : tx)));
  }

  function removeTx(i: number) {
    setParsed((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (parsed.length === 0) return;
    setSaving(true);
    setError("");
    try {
      for (const tx of parsed) {
        if (!tx.accountId) continue;
        if (tx.type === "transfer" && tx.toAccountId) {
          await addTransfer(tx.accountId, tx.toAccountId, tx.amount, tx.date, tx.note);
        } else {
          await addTransaction({
            type: tx.type,
            amount: tx.amount,
            accountId: tx.accountId,
            categoryId: tx.categoryId,
            date: tx.date,
            note: tx.note,
          });
        }
      }
      onSaved();
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan transaksi.");
    } finally {
      setSaving(false);
    }
  }

  const TYPE_LABELS: Record<string, string> = { expense: "Pengeluaran", income: "Pemasukan", transfer: "Transfer" };
  const TYPE_COLORS: Record<string, string> = {
    expense: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    income: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    transfer: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };

  return (
    <Modal open={open} onClose={handleClose} title="✨ Catat dengan AI">
      {step === "input" && (
        <div className="space-y-4">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Pilih input teks atau scan struk. Semua hasil tetap masuk ke tahap review manual sebelum disimpan.
          </p>

          <div className={`rounded-xl border px-3 py-2 text-xs ${isOnline ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
            Status AI: {isOnline ? "Online" : "Offline"}. {isOnline ? "Siap memproses." : "Sambungkan internet untuk memakai fitur AI."}
          </div>

          <div className="flex rounded-xl border border-[hsl(var(--border))] overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => { setInputMode("text"); setError(""); }}
              className={`flex-1 py-2 font-medium transition-colors ${inputMode === "text" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
            >
              Teks
            </button>
            <button
              type="button"
              onClick={() => { setInputMode("receipt"); setError(""); }}
              className={`flex-1 py-2 font-medium transition-colors ${inputMode === "receipt" ? "bg-indigo-600 text-white" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"}`}
            >
              Scan Struk
            </button>
          </div>

          {inputMode === "text" ? (
            <>
              <div className="bg-[hsl(var(--accent))] rounded-xl p-3 text-xs text-[hsl(var(--muted-foreground))] space-y-1">
                <p className="font-medium text-[hsl(var(--foreground))]">Contoh:</p>
                <p>"Hari ini beli kopi 30rb pake gopay, terus bayar tagihan listrik 150rb pake BCA"</p>
                <p>"Transfer 500k dari BCA ke Mandiri buat bayar cicilan"</p>
              </div>

              <Textarea
                label="Ceritakan transaksimu"
                placeholder="Contoh: tadi beli makan siang 45rb pake OVO, trus bayar kartu kredit 300rb dari BCA..."
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--accent))] p-3 text-xs text-[hsl(var(--muted-foreground))] space-y-1">
                <p className="font-medium text-[hsl(var(--foreground))]">Tips scan struk</p>
                <p>Pastikan total bayar, tanggal, dan nama merchant terlihat jelas.</p>
                <p>Hasil scan tetap bisa diedit sebelum disimpan.</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleReceiptChange}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-2xl border-2 border-dashed border-[hsl(var(--border))] p-4 text-left hover:bg-[hsl(var(--accent))] transition-colors"
              >
                <p className="text-sm font-medium">{receiptPreview ? "Ganti foto struk" : "Pilih foto struk"}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  {receiptFileName || "Bisa dari kamera atau galeri"}
                </p>
              </button>

              {receiptPreview && (
                <div className="rounded-2xl border border-[hsl(var(--border))] overflow-hidden">
                  <img src={receiptPreview} alt="Preview struk" className="w-full max-h-64 object-cover bg-[hsl(var(--muted))]" />
                </div>
              )}
            </div>
          )}

          {/* API Key field */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]">
              Gemini API Key{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-500 text-xs font-normal underline"
              >
                Dapatkan gratis di sini
              </a>
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => saveApiKey(e.target.value)}
                placeholder="AIza..."
                className="w-full rounded-xl border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-base placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-16"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] px-2 py-1"
              >
                {showApiKey ? "Sembunyikan" : "Lihat"}
              </button>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">API key disimpan lokal di perangkatmu, tidak dikirim ke server.</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl p-3">
              <AlertCircle size={16} className="flex-none mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Batal
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleParse}
              disabled={loading || !isOnline || !apiKey.trim() || (inputMode === "text" ? !text.trim() : !receiptBase64)}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  {inputMode === "text" ? "Parse dengan AI" : "Scan struk"}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Ditemukan <span className="font-semibold text-[hsl(var(--foreground))]">{parsed.length}</span> transaksi. Review sebelum disimpan:
            </p>
            <button
              onClick={() => { setStep("input"); setError(""); }}
              className="text-xs text-indigo-500 hover:underline flex items-center gap-0.5"
            >
              ← Kembali ke input
            </button>
          </div>

          <div className="space-y-3">
            {parsed.map((tx, i) => (
              <div key={i} className="border border-[hsl(var(--border))] rounded-2xl p-3 space-y-3">
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">#{i + 1}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[tx.type]}`}>
                      {TYPE_LABELS[tx.type]}
                    </span>
                  </div>
                  <button
                    onClick={() => removeTx(i)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Hapus
                  </button>
                </div>

                {/* Type selector */}
                <Select
                  label="Tipe"
                  value={tx.type}
                  onChange={(e) =>
                    updateTx(i, {
                      type: e.target.value as ParsedTransaction["type"],
                      toAccountId: e.target.value !== "transfer" ? undefined : tx.toAccountId,
                    })
                  }
                >
                  <option value="expense">Pengeluaran</option>
                  <option value="income">Pemasukan</option>
                  <option value="transfer">Transfer</option>
                </Select>

                {/* Amount + Date row */}
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Jumlah"
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithSeparator(String(tx.amount))}
                    onChange={(e) => {
                      const cleanValue = e.target.value.replace(/\D/g, "");
                      updateTx(i, { amount: Number(cleanValue) });
                    }}
                  />
                  <Input
                    label="Tanggal"
                    type="date"
                    value={tx.date}
                    onChange={(e) => updateTx(i, { date: e.target.value || todayISO() })}
                  />
                </div>

                {/* Account selector */}
                <Select
                  label={tx.type === "transfer" ? "Dari Akun" : "Akun"}
                  value={String(tx.accountId)}
                  onChange={(e) => updateTx(i, { accountId: Number(e.target.value) })}
                >
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.icon} {a.name}
                    </option>
                  ))}
                </Select>

                {/* To Account (transfer only) */}
                {tx.type === "transfer" && (
                  <Select
                    label="Ke Akun"
                    value={String(tx.toAccountId ?? "")}
                    onChange={(e) => updateTx(i, { toAccountId: Number(e.target.value) })}
                  >
                    <option value="">-- Pilih akun tujuan --</option>
                    {activeAccounts
                      .filter((a) => a.id !== tx.accountId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.icon} {a.name}
                        </option>
                      ))}
                  </Select>
                )}

                {/* Category (non-transfer) */}
                {tx.type !== "transfer" && (
                  <Select
                    label="Kategori"
                    value={String(tx.categoryId ?? "")}
                    onChange={(e) => updateTx(i, { categoryId: e.target.value ? Number(e.target.value) : undefined })}
                  >
                    <option value="">-- Pilih kategori --</option>
                    {categories
                      .filter((c) => c.type === tx.type || c.type === "both")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.icon} {c.name}
                        </option>
                      ))}
                  </Select>
                )}

                {/* Note */}
                <Input
                  label="Catatan"
                  value={tx.note}
                  onChange={(e) => updateTx(i, { note: e.target.value })}
                  placeholder="Catatan opsional"
                />
              </div>
            ))}
          </div>

          {parsed.length === 0 && (
            <p className="text-sm text-center text-[hsl(var(--muted-foreground))] py-4">
              Semua transaksi dihapus.
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl p-3">
              <AlertCircle size={16} className="flex-none mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Batal
            </Button>
            <Button
              variant="success"
              className="flex-1 gap-2"
              onClick={handleSave}
              disabled={saving || parsed.length === 0}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <ChevronRight size={16} />
                  Simpan {parsed.length} Transaksi
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
