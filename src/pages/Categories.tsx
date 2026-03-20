import { useState } from "react";
import { Link } from "react-router-dom";
import { useWalletStore } from "@/stores/walletStore";
import { Card, CardContent, Button, Modal } from "@/components/ui";
import { CategoryForm } from "@/components/forms/CategoryForm";
import { deleteCategory } from "@/db/categories";
import { seedMissingDefaultCategories } from "@/db/db";
import { ChevronLeft, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { Category } from "@/types";

export default function Categories() {
  const { categories, refreshAll } = useWalletStore();
  const [catFormOpen, setCatFormOpen] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [deleteCatId, setDeleteCatId] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");

  async function handleRestoreDefault() {
    setRestoring(true);
    setRestoreMsg("");
    try {
      const added = await seedMissingDefaultCategories();
      await refreshAll();
      setRestoreMsg(added > 0 ? `✅ ${added} kategori dipulihkan.` : "✅ Semua kategori default sudah ada.");
    } finally {
      setRestoring(false);
    }
  }

  const grouped = [
    { label: "Pengeluaran", color: "text-red-500", items: categories.filter((c) => c.type === "expense" || c.type === "both") },
    { label: "Pemasukan", color: "text-emerald-500", items: categories.filter((c) => c.type === "income") },
  ];

  return (
    <div className="p-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pt-2">
        <Link to="/settings" className="p-1.5 rounded-xl hover:bg-[hsl(var(--accent))] transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold flex-1">Kategori</h1>
        <button
          onClick={handleRestoreDefault}
          disabled={restoring}
          className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-indigo-500 font-medium disabled:opacity-50"
        >
          <RefreshCw size={13} className={restoring ? "animate-spin" : ""} /> Pulihkan Default
        </button>
        <button
          onClick={() => setCatFormOpen(true)}
          className="flex items-center gap-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-xl font-medium transition-colors"
        >
          <Plus size={14} /> Tambah
        </button>
      </div>

      {restoreMsg && <p className="text-xs text-center text-[hsl(var(--muted-foreground))]">{restoreMsg}</p>}

      {grouped.map(({ label, color, items }) => (
        <Card key={label}>
          <CardContent className="p-4 space-y-0.5">
            <p className={`text-xs font-semibold mb-2 ${color}`}>{label} ({items.length})</p>
            {items.length === 0 && (
              <p className="text-xs text-[hsl(var(--muted-foreground))] py-2 text-center">Tidak ada kategori</p>
            )}
            {items.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-[hsl(var(--accent))]">
                <span
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-none"
                  style={{ background: `${cat.color}22` }}
                >
                  {cat.icon}
                </span>
                <span className="flex-1 text-sm font-medium truncate">{cat.name}</span>
                {cat.type === "both" && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium flex-none"
                    style={{ background: `${cat.color}22`, color: cat.color }}
                  >
                    Keduanya
                  </span>
                )}
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
          </CardContent>
        </Card>
      ))}

      <CategoryForm
        open={catFormOpen || editCat !== null}
        onClose={() => { setCatFormOpen(false); setEditCat(null); }}
        onSaved={() => { void refreshAll(); setCatFormOpen(false); setEditCat(null); }}
        existing={editCat ?? undefined}
      />

      <Modal open={deleteCatId !== null} onClose={() => setDeleteCatId(null)} title="Hapus Kategori">
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
          Yakin ingin menghapus kategori ini? Transaksi yang terkait tidak akan dihapus, hanya kategorinya yang dilepas.
        </p>
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
    </div>
  );
}
