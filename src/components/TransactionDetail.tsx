import type { Category, Transaction, TransactionSplit } from "@/types";
import { Button, IconTile, ListGroup, ListRow } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";

interface TransactionDetailProps {
  transaction: Transaction;
  accountName: string;
  toAccountName?: string;
  category?: Category | null;
  splits: TransactionSplit[];
  categories: Category[];
  currency: string;
  hidden?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const TYPE_LABEL = { income: "Pemasukan", expense: "Pengeluaran", transfer: "Transfer" } as const;

export function TransactionDetail({ transaction: tx, accountName, toAccountName, category, splits, categories, currency, hidden = false, onEdit, onDelete }: TransactionDetailProps) {
  const isSplit = splits.length > 0;
  const name = tx.note || (isSplit ? "Split Kategori" : category?.name) || accountName;
  const tileLabel = tx.isAdjustment ? "Penyesuaian saldo" : isSplit ? "Split Kategori" : category?.name ?? TYPE_LABEL[tx.type];
  const amountColor = hidden ? "text-[hsl(var(--foreground))]" : tx.type === "income" ? "text-success" : tx.type === "transfer" ? "text-[hsl(var(--muted-foreground))]" : "text-[hsl(var(--foreground))]";
  const money = (n: number) => (hidden ? "•••" : formatCurrency(n, currency));
  const kind = tx.isAdjustment ? "Penyesuaian saldo" : tx.debtId ? "Utang/Piutang" : TYPE_LABEL[tx.type];
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <IconTile label={tileLabel} color={tx.isAdjustment || isSplit ? undefined : category?.color} size="lg" />
        <p className="text-sm text-[hsl(var(--muted-foreground))] break-words">{name}</p>
        <p className={`text-3xl font-semibold tabular-nums tracking-tight ${amountColor}`}>
          {hidden ? "" : tx.type === "expense" ? "−" : tx.type === "income" ? "+" : ""}{money(tx.amount)}
        </p>
        {isSplit && <span className="rounded-full bg-[hsl(var(--primary))]/10 px-3 py-1 text-xs font-medium text-[hsl(var(--primary))]">Split · {splits.length} kategori</span>}
      </div>
      <ListGroup>
        <ListRow label="Jenis" value={kind} />
        <ListRow label="Akun" value={`${accountName}${toAccountName ? ` → ${toAccountName}` : ""}`} />
        <ListRow label="Tanggal" value={formatDate(tx.date, "EEEE, d MMM yyyy")} />
        <ListRow label="Catatan" value={tx.note || "—"} />
      </ListGroup>
      {isSplit && (
        <ListGroup title="Rincian split">
          {splits.map((s, i) => {
            const cat = categories.find((c) => c.id === s.categoryId);
            return <ListRow key={i} label={cat?.name ?? "Kategori tidak ditemukan"} sub={s.note || undefined} value={<span className="tabular-nums">{money(s.amount)}</span>} />;
          })}
        </ListGroup>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" className="border-danger/40 text-danger hover:bg-danger/10" onClick={onDelete}>Hapus</Button>
        <Button size="lg" onClick={onEdit}>Edit</Button>
      </div>
    </div>
  );
}
