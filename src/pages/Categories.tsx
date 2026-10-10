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
    } catch (error) {
      setRestoreMsg("Gagal memulihkan kategori: " + (error instanceof Error ? error.message : "Coba lagi."));
    } finally {
      setRestoring(false);
    }
  }

  const grouped = [
    { type: "expense", label: "Pengeluaran", color: "text-red-600 dark:text-red-400", items: categories.filter((c) => c.type === "expense") },
    { type: "income", label: "Pemasukan", color: "text-emerald-600 dark:text-emerald-400", items: categories.filter((c) => c.type === "income") },
    { type: "both", label: "Keduanya", color: "text-[hsl(var(--primary))]", items: categories.filter((c) => c.type === "both") },
  ];

  usePageAction({ label: "Tambah kategori", onClick: () => setCatFormOpen(true) });

  return (
    <div className="space-y-4 px-4 pt-6 pb-4 lg:px-0 lg:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/settings" aria-label="Kembali ke pengaturan" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kategori</h1>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{categories.length} kategori · {categories.filter((cat) => cat.isDefault).length} bawaan · {categories.filter((cat) => !cat.isDefault).length} buatan sendiri</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRestoreDefault} disabled={restoring} className="gap-1.5">
          <RefreshCw size={14} className={restoring ? "animate-spin" : ""} /> {restoring ? "Memulihkan…" : "Pulihkan Default"}
        </Button>
      </div>

      {restoreMsg && <p role="status" className="text-xs text-[hsl(var(--muted-foreground))]">{restoreMsg}</p>}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {[grouped.slice(0, 1), grouped.slice(1)].map((column, index) => (
          <div key={index} className="contents lg:block lg:space-y-4">
        {column.map(({ type, label, color, items }) => (
          <Card key={type} role="region" aria-labelledby={`category-${type}`}>
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2 border-b border-[hsl(var(--border))] px-4 py-3">
                <h2 id={`category-${type}`} className={`text-sm font-semibold ${color}`}>{label}</h2>
                <span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{items.length}</span>
              </div>
              {items.length === 0 && <p className="p-4 text-xs text-[hsl(var(--muted-foreground))]">Belum ada kategori {label.toLowerCase()}. Pilih Tambah kategori untuk membuatnya.</p>}
              <ul className="divide-y divide-[hsl(var(--border))]">
                {items.map((cat) => (
                  <li key={cat.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-[hsl(var(--surface-2))]">
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base" style={{ background: `${cat.color}22` }}>{cat.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium">{cat.name}</p>
                      {cat.isDefault && <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">Bawaan</p>}
                    </div>
                    <div className="flex shrink-0 items-center">
                      <button onClick={() => setEditCat(cat)} aria-label={`Edit ${cat.name}`} title="Edit kategori" className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
                        <Pencil size={15} />
                      </button>
                      {!cat.isDefault && <button onClick={() => setDeleteCatId(cat.id!)} aria-label={`Hapus ${cat.name}`} title="Hapus kategori" className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
                        <Trash2 size={15} />
                      </button>}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
          </div>
        ))}
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Kategori Keduanya dapat dipakai untuk pemasukan dan pengeluaran. Kategori bawaan bisa diedit; hanya kategori buatan sendiri yang bisa dihapus.</p>

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
