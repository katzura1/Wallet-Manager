export type AccountType = "bank" | "ewallet" | "cash" | "credit" | "investment";
export type TransactionType = "income" | "expense" | "transfer";

export interface Account {
  id?: number;
  name: string;
  type: AccountType;
  color: string;
  icon: string;
  initialBalance: number;
  currentBalance: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id?: number;
  name: string;
  icon: string;
  color: string;
  type: "income" | "expense" | "both";
  isDefault: boolean;
  createdAt: string;
}

export interface Transaction {
  id?: number;
  type: TransactionType;
  amount: number;
  accountId: number;
  toAccountId?: number; // for transfer: destination account
  transferPairId?: number; // for transfer: links the two transactions together
  categoryId?: number;
  date: string; // ISO date string YYYY-MM-DD
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  id?: number;
  key: string;
  value: string;
}

export interface TransactionSplit {
  id?: number;
  transactionId: number;
  categoryId: number;
  amount: number;
  note: string;
}

export type DebtType = "owe" | "owed"; // owe = kita hutang, owed = orang lain hutang ke kita

export interface Debt {
  id?: number;
  name: string;          // nama orang
  type: DebtType;
  amount: number;        // jumlah asal
  remaining: number;     // sisa belum dilunasi
  dueDate?: string;      // YYYY-MM-DD
  note: string;
  accountId?: number;    // akun yang terlibat
  isSettled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DebtPayment {
  id?: number;
  debtId: number;
  amount: number;
  date: string;
  note: string;
  createdAt: string;
}

export type RecurringInterval = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurringTransaction {
  id?: number;
  type: "income" | "expense";
  amount: number;
  accountId: number;
  categoryId?: number;
  note: string;
  interval: RecurringInterval;
  startDate: string; // YYYY-MM-DD
  nextDate: string;  // YYYY-MM-DD next due date
  isActive: boolean;
  createdAt: string;
}

export interface Budget {
  id?: number;
  categoryId: number;
  amount: number;
  month: string; // YYYY-MM
  createdAt: string;
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export type AssetType = "crypto" | "stock_us" | "stock_idx" | "stock" | "gold_physical" | "gold_digital" | "mutual_fund";
// "stock" is legacy alias for stock_us

export interface Asset {
  id?: number;
  symbol: string;            // BTC, AAPL, BBCA.JK
  name: string;              // Bitcoin, Apple Inc
  type: AssetType;
  quantity: number;
  avgBuyPrice: number;       // average buy price in IDR
  coinGeckoId?: string;      // e.g. "bitcoin" — used for CoinGecko sync
  manualPriceIdr?: number;   // user-entered fallback when API is unavailable
  createdAt: string;
  updatedAt: string;
}

export interface AssetPrice {
  symbol: string;            // primary key (matches Asset.symbol)
  priceIdr: number;
  changePercent24h: number;
  lastSynced: string;
}

export interface AccountWithBalance extends Account {
  id: number;
  balance: number;
}

export interface TransactionWithDetails extends Transaction {
  id: number;
  account?: Account;
  toAccount?: Account;
  category?: Category;
}
