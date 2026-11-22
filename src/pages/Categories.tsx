import { useState } from "react";
import { useWalletStore } from "@/stores/walletStore";
import { Button, ConfirmDialog, IconTile, PageHeader, SegmentedControl } from "@/components/ui";
import { CategoryForm } from "@/components/forms/CategoryForm";
import { deleteCategory } from "@/db/categories";
import { seedMissingDefaultCategories } from "@/db/db";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { Category } from "@/types";
import { usePageAction } from "@/components/layout/appLayoutContext";

type Tab = "expense" | "income" | "both";

export default function Categories() {
  const { categories, refreshAll } = useWalletStore();
  const [tab, setTab] = useState<Tab>("expense");
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

  const lists: Record<Tab, Category[]> = {
    expense: categories.filter((c) => c.type === "expense"),
    income: categories.filter((c) => c.type === "income"),
    both: categories.filter((c) => c.type === "both"),
  };
  const activeTab: Tab = tab === "both" && lists.both.length === 0 ? "expense" : tab;
  const items = lists[activeTab];
  const tabNames: Record<Tab, string> = { expense: "pengeluaran", income: "pemasukan", both: "keduanya" };

  usePageAction({ label: "Tambah kategori", onClick: () => setCatFormOpen(true) });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-5 pb-4 lg:px-0 lg:pt-7">
      <PageHeader
        title="Kategori"
        back="/settings"
        actions={
          <Button variant="outline" onClick={handleRestoreDefault} disabled={restoring} className="min-h-11 gap-1.5">
            <RefreshCw size={14} className={restoring ? "animate-spin" : ""} /> {restoring ? "Memulihkan…" : "Pulihkan Default"}
          </Button>
        }
      />

      <p className="text-xs text-[hsl(var(--muted-foreground))]">{categories.length} kategori · {categories.filter((cat) => cat.isDefault).length} bawaan · {categories.filter((cat) => !cat.isDefault).length} buatan sendiri</p>

      <Button className="min-h-11 w-full gap-1 lg:hidden" onClick={() => setCatFormOpen(true)}>
        <Plus size={16} aria-hidden="true" />Tambah kategori
      </Button>

      <SegmentedControl
        label="Jenis kategori"
        value={activeTab}
        onChange={setTab}
        options={[
          { value: "expense", label: `Pengeluaran · ${lists.expense.length}` },
          { value: "income", label: `Pemasukan · ${lists.income.length}` },
          ...(lists.both.length > 0 ? [{ value: "both" as Tab, label: `Keduanya · ${lists.both.length}` }] : []),
        ]}
      />

      {restoreMsg && <p role="status" className="text-xs text-[hsl(var(--muted-foreground))]">{restoreMsg}</p>}

      <section aria-label={`Kategori ${tabNames[activeTab]}`} className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {items.length === 0 && <p className="p-4 text-xs text-[hsl(var(--muted-foreground))]">Belum ada kategori {tabNames[activeTab]}. Pilih Tambah kategori untuk membuatnya.</p>}
        <ul className="divide-y divide-[hsl(var(--border))]">
          {items.map((cat) => (
            <li key={cat.id} className="flex items-center gap-3 px-4 py-2.5">
              <IconTile label={cat.name} color={cat.color} />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <p className="break-words text-sm font-medium">{cat.name}</p>
                {cat.isDefault && <span className="shrink-0 rounded-full bg-[hsl(var(--surface-2))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))]">Bawaan</span>}
              </div>
              <div className="flex shrink-0 items-center">
                <button onClick={() => setEditCat(cat)} aria-label={`Edit ${cat.name}`} title="Edit kategori" className="flex h-11 w-11 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
                  <Pencil size={15} />
                </button>
                {!cat.isDefault && <button onClick={() => setDeleteCatId(cat.id!)} aria-label={`Hapus ${cat.name}`} title="Hapus kategori" className="flex h-11 w-11 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
                  <Trash2 size={15} />
                </button>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Kategori Keduanya dapat dipakai untuk pemasukan dan pengeluaran. Kategori bawaan bisa diedit; hanya kategori buatan sendiri yang bisa dihapus.</p>

      <CategoryForm
        open={catFormOpen || editCat !== null}
        onClose={() => { setCatFormOpen(false); setEditCat(null); }}
        onSaved={() => { void refreshAll(); setCatFormOpen(false); setEditCat(null); }}
        existing={editCat ?? undefined}
      />

      <ConfirmDialog
        open={deleteCatId !== null}
        title="Hapus kategori ini?"
        description={`Kategori “${categories.find((c) => c.id === deleteCatId)?.name ?? ""}” akan dihapus. Transaksi yang terkait tidak ikut dihapus, hanya kategorinya yang dilepas.`}
        confirmLabel="Hapus"
        onConfirm={async () => {
          if (deleteCatId !== null) {
            await deleteCategory(deleteCatId);
            await refreshAll();
            setDeleteCatId(null);
          }
        }}
        onClose={() => setDeleteCatId(null)}
      />
    </div>
  );
}
