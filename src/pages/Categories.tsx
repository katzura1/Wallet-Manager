import { useState } from "react";
import { Link } from "react-router-dom";
import { useWalletStore } from "@/stores/walletStore";
import { Card, CardContent, Button, Modal } from "@/components/ui";
import { CategoryForm } from "@/components/forms/CategoryForm";
import { deleteCategory } from "@/db/categories";
import { seedMissingDefaultCategories } from "@/db/db";
import { ChevronLeft, Pencil, RefreshCw, Trash2 } from "lucide-react";
import type { Category } from "@/types";
import { usePageAction } from "@/components/layout/appLayoutContext";

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

  usePageAction({ label: "Tambah kategori", onClick: () => setCatFormOpen(true) });

  return (
    <div className="space-y-5 px-4 pt-6 pb-4 lg:px-0 lg:pt-8">
      {/* Header */}
      <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <div className="flex items-start gap-3">
          <Link to="/settings" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--card))]/75 hover:bg-[hsl(var(--surface-2))] transition-colors">
            <ChevronLeft size={18} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Kategori</h1>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Kelola kategori pemasukan dan pengeluaran dengan struktur yang lebih rapi.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleRestoreDefault} disabled={restoring} className="gap-1.5">
            <RefreshCw size={13} className={restoring ? "animate-spin" : ""} /> Pulihkan Default
          </Button>
        </div>
      </div>

      {restoreMsg && <p className="text-xs text-center text-[hsl(var(--muted-foreground))]">{restoreMsg}</p>}

      {grouped.map(({ label, color, items }) => (
        <Card key={label}>
          <CardContent className="p-5 space-y-1">
            <p className={`text-[11px] font-semibold mb-2 ${color}`}>{label} ({items.length})</p>
            {items.length === 0 && (
              <p className="text-xs text-[hsl(var(--muted-foreground))] py-2 text-center">Tidak ada kategori</p>
            )}
            {items.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3 py-3 px-3 rounded-2xl hover:bg-[hsl(var(--surface-2))]">
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
                  className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] rounded-xl hover:bg-[hsl(var(--surface-2))]"
                >
                  <Pencil size={13} />
                </button>
                {!cat.isDefault && (
                  <button
                    onClick={() => setDeleteCatId(cat.id!)}
                    className="p-2 text-[hsl(var(--muted-foreground))] hover:text-red-500 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30"
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
