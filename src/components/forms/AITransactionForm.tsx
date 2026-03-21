import { useState } from "react";
import { Button, Modal, Textarea, Select, Input } from "@/components/ui";
import { parseTransactionText, GEMINI_MODELS, type ParsedTransaction } from "@/lib/geminiParser";
import { addTransaction, addTransfer } from "@/db/transactions";
import { todayISO } from "@/lib/utils";
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

export function AITransactionForm({ open, onClose, onSaved, accounts, categories }: AITransactionFormProps) {
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_api_key") ?? "");
  const [model, _] = useState(() => localStorage.getItem("gemini_model") ?? "gemini-2.5-flash");
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<ParsedTransaction[]>([]);
  const [saving, setSaving] = useState(false);

  const activeAccounts = accounts.filter((a) => !a.isArchived);

  function handleClose() {
    setStep("input");
    setText("");
    setError("");
    setParsed([]);
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
      const result = await parseTransactionText(text, apiKey, accounts, categories, model);
      setParsed(result.transactions);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
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
    <Modal open={open} onClose={handleClose} title="✨ Catat dari Teks">
      {step === "input" && (
        <div className="space-y-4">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Ketik transaksi dalam bahasa sehari-hari. Gemini AI akan memparse-nya otomatis.
          </p>

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
              disabled={loading || !text.trim() || !apiKey.trim()}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Parse dengan AI
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
              ← Edit teks
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
                    type="number"
                    min={0}
                    value={tx.amount}
                    onChange={(e) => updateTx(i, { amount: Number(e.target.value) })}
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
