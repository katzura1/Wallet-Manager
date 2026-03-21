import { db } from "@/db/db";
import { seedMissingDefaultCategories } from "@/db/db";
import { z } from "zod";

// ─── Zod Schemas ───────────────────────────────────────────────────────────────

const AccountSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  type: z.enum(["bank", "ewallet", "cash", "credit", "investment"]),
  color: z.string(),
  icon: z.string(),
  initialBalance: z.number(),
  currentBalance: z.number(),
  isArchived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CategorySchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  type: z.enum(["income", "expense", "both"]),
  isDefault: z.boolean(),
  createdAt: z.string(),
});

const TransactionSchema = z.object({
  id: z.number().optional(),
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number(),
  accountId: z.number(),
  toAccountId: z.number().optional(),
  transferPairId: z.number().optional(),
  categoryId: z.number().optional(),
  date: z.string(),
  note: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const BudgetSchema = z.object({
  id: z.number().optional(),
  categoryId: z.number(),
  amount: z.number(),
  month: z.string(),
  createdAt: z.string(),
});

const SettingsSchema = z.object({
  id: z.number().optional(),
  key: z.string(),
  value: z.string(),
});

const RecurringSchema = z.object({
  id: z.number().optional(),
  type: z.enum(["income", "expense"]),
  amount: z.number(),
  accountId: z.number(),
  categoryId: z.number().optional(),
  note: z.string(),
  interval: z.enum(["daily", "weekly", "monthly", "yearly"]),
  startDate: z.string(),
  nextDate: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

const TransactionSplitSchema = z.object({
  id: z.number().optional(),
  transactionId: z.number(),
  categoryId: z.number(),
  amount: z.number(),
  note: z.string(),
});

const DebtSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  type: z.enum(["owe", "owed"]),
  amount: z.number(),
  remaining: z.number(),
  dueDate: z.string().optional(),
  note: z.string(),
  accountId: z.number().optional(),
  isSettled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const DebtPaymentSchema = z.object({
  id: z.number().optional(),
  debtId: z.number(),
  amount: z.number(),
  date: z.string(),
  note: z.string(),
  accountId: z.number().optional(),
  createdAt: z.string(),
});

const AssetSchema = z.object({
  id: z.number().optional(),
  symbol: z.string(),
  name: z.string(),
  type: z.enum(["crypto", "stock_us", "stock_idx", "stock", "gold_physical", "gold_digital", "mutual_fund", "deposito"]),
  quantity: z.number(),
  avgBuyPrice: z.number(),
  coinGeckoId: z.string().optional(),
  manualPriceIdr: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const AssetPriceSchema = z.object({
  symbol: z.string(),
  priceIdr: z.number(),
  changePercent24h: z.number(),
  lastSynced: z.string(),
});

const PortfolioHistorySchema = z.object({
  id: z.number().optional(),
  date: z.string(),
  totalValue: z.number(),
});

const SyncLogAssetResultSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  status: z.enum(["synced", "failed", "skipped"]),
  oldPrice: z.number().nullable(),
  newPrice: z.number().nullable(),
});

const SyncLogEntrySchema = z.object({
  id: z.number().optional(),
  syncedAt: z.string(),
  results: z.array(SyncLogAssetResultSchema),
});

const BackupSchemaV1 = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  accounts: z.array(AccountSchema),
  categories: z.array(CategorySchema),
  transactions: z.array(TransactionSchema),
});

const BackupSchemaV2 = z.object({
  version: z.literal(2),
  exportedAt: z.string(),
  accounts: z.array(AccountSchema),
  categories: z.array(CategorySchema),
  transactions: z.array(TransactionSchema),
  budgets: z.array(BudgetSchema),
  recurring: z.array(RecurringSchema),
  transactionSplits: z.array(TransactionSplitSchema),
  debts: z.array(DebtSchema),
  debtPayments: z.array(DebtPaymentSchema),
});

const BackupSchemaV3 = z.object({
  version: z.literal(3),
  exportedAt: z.string(),
  accounts: z.array(AccountSchema),
  categories: z.array(CategorySchema),
  transactions: z.array(TransactionSchema),
  budgets: z.array(BudgetSchema),
  recurring: z.array(RecurringSchema),
  transactionSplits: z.array(TransactionSplitSchema),
  debts: z.array(DebtSchema),
  debtPayments: z.array(DebtPaymentSchema),
  assets: z.array(AssetSchema),
  assetPrices: z.array(AssetPriceSchema),
});

const BackupSchemaV4 = z.object({
  version: z.literal(4),
  exportedAt: z.string(),
  accounts: z.array(AccountSchema),
  categories: z.array(CategorySchema),
  transactions: z.array(TransactionSchema),
  settings: z.array(SettingsSchema),
  budgets: z.array(BudgetSchema),
  recurring: z.array(RecurringSchema),
  transactionSplits: z.array(TransactionSplitSchema),
  debts: z.array(DebtSchema),
  debtPayments: z.array(DebtPaymentSchema),
  assets: z.array(AssetSchema),
  assetPrices: z.array(AssetPriceSchema),
  portfolioHistory: z.array(PortfolioHistorySchema),
  syncLog: z.array(SyncLogEntrySchema),
});

const BackupSchema = z.union([BackupSchemaV4, BackupSchemaV3, BackupSchemaV2, BackupSchemaV1]);
export type BackupData = z.infer<typeof BackupSchemaV4>;

// ─── Export ────────────────────────────────────────────────────────────────────

export async function exportJSON(): Promise<void> {
  const [
    accounts,
    categories,
    transactions,
    settings,
    budgets,
    recurring,
    transactionSplits,
    debts,
    debtPayments,
    assets,
    assetPrices,
    portfolioHistory,
    syncLog,
  ] =
    await Promise.all([
      db.accounts.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
      db.settings.toArray(),
      db.budgets.toArray(),
      db.recurring.toArray(),
      db.transactionSplits.toArray(),
      db.debts.toArray(),
      db.debtPayments.toArray(),
      db.assets.toArray(),
      db.assetPrices.toArray(),
      db.portfolioHistory.toArray(),
      db.syncLog.toArray(),
    ]);

  const backup: BackupData = {
    version: 4,
    exportedAt: new Date().toISOString(),
    accounts,
    categories,
    transactions,
    settings,
    budgets,
    recurring,
    transactionSplits,
    debts,
    debtPayments,
    assets,
    assetPrices,
    portfolioHistory,
    syncLog,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  downloadBlob(blob, `wallet-backup-${dateStamp()}.json`);
}

export async function exportCSV(): Promise<void> {
  const transactions = await db.transactions.orderBy("date").reverse().toArray();
  const accounts = await db.accounts.toArray();
  const categories = await db.categories.toArray();

  const accountMap = Object.fromEntries(accounts.map((a) => [a.id!, a.name]));
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id!, c.name]));

  const header = ["Tanggal", "Tipe", "Jumlah", "Akun", "Ke Akun", "Kategori", "Catatan"];
  const rows = transactions.map((tx) => [
    tx.date,
    tx.type,
    tx.amount,
    accountMap[tx.accountId] ?? tx.accountId,
    tx.toAccountId ? (accountMap[tx.toAccountId] ?? tx.toAccountId) : "",
    tx.categoryId ? (categoryMap[tx.categoryId] ?? "") : "",
    `"${tx.note.replace(/"/g, '""')}"`,
  ]);

  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `wallet-transactions-${dateStamp()}.csv`);
}

// ─── Import ────────────────────────────────────────────────────────────────────

export async function importJSON(file: File, mode: "replace" | "merge"): Promise<void> {
  const text = await file.text();
  const raw = JSON.parse(text);
  const parsed = BackupSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error("File backup tidak valid: " + parsed.error.issues.map((i) => i.message).join(", "));
  }

  const backup = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = backup as any;

  // Normalise — older backups won't have the new tables, fill with empty arrays
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts: any[] = backup.accounts;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categories: any[] = backup.categories;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transactions: any[] = backup.transactions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings: any[] = b.settings ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const budgets: any[] = b.budgets ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recurring: any[] = b.recurring ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transactionSplits: any[] = b.transactionSplits ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debts: any[] = b.debts ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debtPayments: any[] = b.debtPayments ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assets: any[] = b.assets ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assetPrices: any[] = b.assetPrices ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const portfolioHistory: any[] = b.portfolioHistory ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncLog: any[] = b.syncLog ?? [];

  const allTables = [
    db.accounts, db.categories, db.transactions, db.settings,
    db.budgets, db.recurring, db.transactionSplits,
    db.debts, db.debtPayments, db.assets, db.assetPrices,
    db.portfolioHistory, db.syncLog,
  ] as const;

  if (mode === "replace") {
    await db.transaction("rw", allTables, async () => {
      await Promise.all(allTables.map((t) => t.clear()));
      await db.accounts.bulkAdd(accounts);
      await db.categories.bulkAdd(categories);
      await db.transactions.bulkAdd(transactions);
      await db.settings.bulkAdd(settings);
      await db.budgets.bulkAdd(budgets);
      await db.recurring.bulkAdd(recurring);
      await db.transactionSplits.bulkAdd(transactionSplits);
      await db.debts.bulkAdd(debts);
      await db.debtPayments.bulkAdd(debtPayments);
      await db.assets.bulkAdd(assets);
      await db.assetPrices.bulkPut(assetPrices);
      await db.portfolioHistory.bulkAdd(portfolioHistory);
      await db.syncLog.bulkAdd(syncLog);
    });
    // Re-seed any missing default categories (so app always has full category list)
    await seedMissingDefaultCategories();
  } else {
    // Merge: skip records that already exist by id
    await db.transaction("rw", allTables, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mergeTable = async (table: any, items: any[]) => {
        for (const item of items) {
          if (item.id && await table.get(item.id)) continue;
          await table.add(item);
        }
      };
      // settings: merge by unique key instead of id to avoid duplicate-key conflicts
      for (const setting of settings) {
        const existing = await db.settings.where("key").equals(setting.key).first();
        if (existing?.id) {
          await db.settings.put({ ...setting, id: existing.id });
        } else {
          await db.settings.add(setting);
        }
      }
      await mergeTable(db.accounts, accounts);
      await mergeTable(db.categories, categories);
      await mergeTable(db.transactions, transactions);
      await mergeTable(db.budgets, budgets);
      await mergeTable(db.recurring, recurring);
      await mergeTable(db.transactionSplits, transactionSplits);
      await mergeTable(db.debts, debts);
      await mergeTable(db.debtPayments, debtPayments);
      // assets: keyed by symbol — upsert
      for (const a of assets) {
        if (!await db.assets.where("symbol").equals(a.symbol).first()) {
          await db.assets.add(a);
        }
      }
      // assetPrices: keyed by symbol — upsert
      await db.assetPrices.bulkPut(assetPrices);
      // portfolioHistory: unique by date — upsert by date
      for (const p of portfolioHistory) {
        const existing = await db.portfolioHistory.where("date").equals(p.date).first();
        if (existing?.id) {
          await db.portfolioHistory.put({ ...p, id: existing.id });
        } else {
          await db.portfolioHistory.add(p);
        }
      }
      await mergeTable(db.syncLog, syncLog);
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function dateStamp(): string {
  return new Date().toISOString().split("T")[0];
}
