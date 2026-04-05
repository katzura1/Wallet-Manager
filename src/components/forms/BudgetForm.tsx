import { useState, useEffect } from "react";
import { Button, Input, Select, Modal } from "@/components/ui";
import { setBudget } from "@/db/budgets";
import { formatNumberWithSeparator } from "@/lib/utils";
import type { Category } from "@/types";

interface BudgetFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  categories: Category[];
  month: string; // YYYY-MM
  initialCategoryId?: number;
  initialAmount?: number;
}

export function BudgetForm({ open, onClose, onSaved, categories, month, initialCategoryId, initialAmount = 0 }: BudgetFormProps) {
  const [categoryId, setCategoryId] = useState(String(initialCategoryId ?? ""));
  const [amount, setAmount] = useState(String(initialAmount || ""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setCategoryId(String(initialCategoryId ?? ""));
      setAmount(String(initialAmount || ""));
      setError("");
    }
  }, [open, initialCategoryId, initialAmount]);

  const expenseCategories = categories.filter((c) => c.type === "expense" || c.type === "both");
  const monthLabel = new Date(month + "-01").toLocaleString("id-ID", { month: "long", year: "numeric" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) { setError("Pilih kategori"); return; }
    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum < 0) { setError("Masukkan jumlah yang valid"); return; }

    setLoading(true);
    try {
      await setBudget(Number(categoryId), month, amountNum);
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Atur Budget">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Budget Period</p>
          <p className="mt-1 text-sm text-[hsl(var(--foreground))] capitalize">{monthLabel}</p>
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Atur limit kategori untuk menjaga pengeluaran tetap terkendali.</p>
        </div>

        <Select
          label="Kategori"
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setError(""); }}
          disabled={initialCategoryId !== undefined}
        >
          <option value="">-- Pilih Kategori --</option>
          {expenseCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </Select>

        <Input
          label="Batas Anggaran"
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={formatNumberWithSeparator(amount)}
          onChange={(e) => {
            const cleanValue = e.target.value.replace(/\D/g, "");
            setAmount(cleanValue);
            setError("");
          }}
          error={error}
        />

        <div className="rounded-[20px] border border-dashed border-[hsl(var(--border))] px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
          Set 0 untuk menghapus budget pada kategori ini.
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Batal</Button>
          <Button type="submit" className="flex-1" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
