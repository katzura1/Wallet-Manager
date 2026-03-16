import { useState } from "react";
import { Button, Input, Modal } from "@/components/ui";
import { addCategory, updateCategory } from "@/db/categories";
import { ACCOUNT_COLORS } from "@/lib/utils";
import type { Category } from "@/types";

interface CategoryFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  existing?: Category;
}

type CatType = "income" | "expense" | "both";

const TYPE_OPTIONS: { value: CatType; label: string }[] = [
  { value: "expense", label: "Pengeluaran" },
  { value: "income", label: "Pemasukan" },
  { value: "both", label: "Keduanya" },
];

export function CategoryForm({ open, onClose, onSaved, existing }: CategoryFormProps) {
  const [name, setName] = useState(existing?.name ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? "🏷️");
  const [color, setColor] = useState(existing?.color ?? ACCOUNT_COLORS[0]);
  const [type, setType] = useState<CatType>(existing?.type ?? "expense");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Nama kategori tidak boleh kosong");
      return;
    }
    setLoading(true);
    try {
      if (existing?.id) {
        await updateCategory(existing.id, { name: name.trim(), icon, color, type });
      } else {
        await addCategory({ name: name.trim(), icon, color, type, isDefault: false });
      }
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={existing ? "Edit Kategori" : "Tambah Kategori"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type toggle */}
        <div>
          <p className="text-sm font-medium mb-2">Tipe</p>
          <div className="flex rounded-xl border border-[hsl(var(--border))] overflow-hidden">
            {TYPE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  type === value
                    ? value === "expense"
                      ? "bg-red-500 text-white"
                      : value === "income"
                      ? "bg-emerald-500 text-white"
                      : "bg-indigo-500 text-white"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Icon + Name row */}
        <div className="flex gap-3 items-end">
          <div className="space-y-1">
            <p className="text-sm font-medium">Ikon</p>
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={2}
              className="w-14 h-10 text-2xl text-center rounded-xl border border-[hsl(var(--border))] bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex-1">
            <Input
              label="Nama Kategori"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              placeholder="mis. Makan & Minum"
              error={error}
            />
          </div>
        </div>

        {/* Color */}
        <div>
          <p className="text-sm font-medium mb-2">Warna</p>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full transition-transform active:scale-90"
                style={{ background: c, outline: color === c ? `3px solid ${c}` : "none", outlineOffset: "2px" }}
              />
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="flex items-center gap-3 p-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--accent))]">
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{ background: `${color}22` }}
          >
            {icon}
          </span>
          <span className="text-sm font-medium">{name || "Contoh Kategori"}</span>
          <span
            className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: `${color}22`, color }}
          >
            {TYPE_OPTIONS.find((o) => o.value === type)?.label}
          </span>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Batal</Button>
          <Button type="submit" className="flex-1" disabled={loading}>
            {loading ? "Menyimpan..." : existing ? "Simpan" : "Tambah"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
