import Dexie, { type EntityTable } from "dexie";
import type { Account, Transaction, Category, Settings, Budget, RecurringTransaction, TransactionSplit, Debt, DebtPayment } from "@/types";

class WalletDB extends Dexie {
  accounts!: EntityTable<Account, "id">;
  transactions!: EntityTable<Transaction, "id">;
  categories!: EntityTable<Category, "id">;
  settings!: EntityTable<Settings, "id">;
  budgets!: EntityTable<Budget, "id">;
  recurring!: EntityTable<RecurringTransaction, "id">;
  transactionSplits!: EntityTable<TransactionSplit, "id">;
  debts!: EntityTable<Debt, "id">;
  debtPayments!: EntityTable<DebtPayment, "id">;

  constructor() {
    super("WalletDB");
    this.version(1).stores({
      accounts: "++id, type, isArchived, createdAt",
      transactions: "++id, type, accountId, toAccountId, transferPairId, categoryId, date, createdAt",
      categories: "++id, type, isDefault",
      settings: "++id, &key",
    });
    this.version(2).stores({
      budgets: "++id, categoryId, month",
      recurring: "++id, type, accountId, nextDate",
    });
    this.version(3).stores({
      transactionSplits: "++id, transactionId, categoryId",
      debts: "++id, type, isSettled, createdAt",
      debtPayments: "++id, debtId, date",
    });
  }
}

export const db = new WalletDB();

// Master list of all default categories
export const DEFAULT_CATEGORIES: Omit<Category, "id" | "createdAt">[] = [
  // ── Expense ──
  { name: "Makan & Minum",       icon: "🍜", color: "#f97316", type: "expense", isDefault: true },
  { name: "Transport",            icon: "🚗", color: "#3b82f6", type: "expense", isDefault: true },
  { name: "Belanja Kebutuhan",    icon: "🛒", color: "#ec4899", type: "expense", isDefault: true },
  { name: "Rumah & Sewa",         icon: "🏠", color: "#0ea5e9", type: "expense", isDefault: true },
  { name: "Tagihan & Utilitas",   icon: "💡", color: "#f59e0b", type: "expense", isDefault: true },
  { name: "Komunikasi",           icon: "📱", color: "#6366f1", type: "expense", isDefault: true },
  { name: "Hiburan",              icon: "🎬", color: "#8b5cf6", type: "expense", isDefault: true },
  { name: "Kesehatan",            icon: "🏥", color: "#10b981", type: "expense", isDefault: true },
  { name: "Pendidikan",           icon: "📚", color: "#06b6d4", type: "expense", isDefault: true },
  { name: "Pakaian & Fashion",    icon: "👕", color: "#f43f5e", type: "expense", isDefault: true },
  { name: "Perjalanan & Liburan", icon: "✈️", color: "#14b8a6", type: "expense", isDefault: true },
  { name: "Olahraga & Fitness",   icon: "🏋️", color: "#84cc16", type: "expense", isDefault: true },
  { name: "Perawatan Diri",       icon: "💆", color: "#d946ef", type: "expense", isDefault: true },
  { name: "Asuransi",             icon: "🛡️", color: "#64748b", type: "expense", isDefault: true },
  { name: "Donasi & Sosial",      icon: "❤️", color: "#ef4444", type: "expense", isDefault: true },
  { name: "Lain-lain",            icon: "📦", color: "#6b7280", type: "expense", isDefault: true },
  // ── Income ──
  { name: "Gaji",                 icon: "💼", color: "#22c55e", type: "income",  isDefault: true },
  { name: "Bonus",                icon: "🎯", color: "#10b981", type: "income",  isDefault: true },
  { name: "Freelance",            icon: "💻", color: "#14b8a6", type: "income",  isDefault: true },
  { name: "Bisnis",               icon: "🏪", color: "#f97316", type: "income",  isDefault: true },
  { name: "Investasi & Dividen",  icon: "📈", color: "#a855f7", type: "income",  isDefault: true },
  { name: "Sewa",                 icon: "🏘️", color: "#0ea5e9", type: "income",  isDefault: true },
  { name: "Cashback & Reward",    icon: "💳", color: "#f59e0b", type: "income",  isDefault: true },
  { name: "Hadiah",               icon: "🎁", color: "#f43f5e", type: "income",  isDefault: true },
  { name: "Pendapatan Lain",      icon: "💰", color: "#84cc16", type: "income",  isDefault: true },
];

// Seed default categories on first run
export async function seedDefaultCategories() {
  const count = await db.categories.count();
  if (count > 0) return;

  const now = new Date().toISOString();
  await db.categories.bulkAdd(DEFAULT_CATEGORIES.map((c) => ({ ...c, createdAt: now })));
}

// Add any missing default categories (safe to call on existing databases)
export async function seedMissingDefaultCategories() {
  const existing = await db.categories.toArray();
  const existingNames = new Set(existing.map((c) => c.name));
  const now = new Date().toISOString();
  const missing = DEFAULT_CATEGORIES.filter((c) => !existingNames.has(c.name));
  if (missing.length > 0) {
    await db.categories.bulkAdd(missing.map((c) => ({ ...c, createdAt: now })));
  }
  return missing.length;
}

// Default settings
export async function seedDefaultSettings() {
  const currency = await db.settings.where("key").equals("currency").first();
  if (!currency) {
    await db.settings.bulkAdd([
      { key: "currency", value: "IDR" },
      { key: "dateFormat", value: "dd MMM yyyy" },
      { key: "theme", value: "light" },
    ]);
  }
}
