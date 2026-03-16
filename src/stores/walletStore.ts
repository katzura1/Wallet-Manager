import { create } from "zustand";
import { getAccounts } from "@/db/accounts";
import { getCategories } from "@/db/categories";
import { getTransactions, type TransactionFilter } from "@/db/transactions";
import type { Account, Category, Transaction } from "@/types";

interface WalletState {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  filter: TransactionFilter;
  isLoading: boolean;

  loadAccounts: () => Promise<void>;
  loadCategories: () => Promise<void>;
  loadTransactions: (filter?: TransactionFilter) => Promise<void>;
  setFilter: (filter: TransactionFilter) => void;
  refreshAll: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  accounts: [],
  categories: [],
  transactions: [],
  filter: {},
  isLoading: false,

  loadAccounts: async () => {
    const accounts = await getAccounts();
    set({ accounts });
  },

  loadCategories: async () => {
    const categories = await getCategories();
    set({ categories });
  },

  loadTransactions: async (filter) => {
    const f = filter ?? get().filter;
    set({ isLoading: true, filter: f });
    const transactions = await getTransactions(f);
    set({ transactions, isLoading: false });
  },

  setFilter: (filter) => {
    set({ filter });
    void get().loadTransactions(filter);
  },

  refreshAll: async () => {
    await Promise.all([get().loadAccounts(), get().loadCategories(), get().loadTransactions()]);
  },
}));

// Settings store (theme, currency, etc.)
interface SettingsState {
  theme: "light" | "dark";
  currency: string;
  dateFormat: string;
  setTheme: (theme: "light" | "dark") => void;
  setCurrency: (c: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: (localStorage.getItem("theme") as "light" | "dark") ?? "light",
  currency: localStorage.getItem("currency") ?? "IDR",
  dateFormat: localStorage.getItem("dateFormat") ?? "dd MMM yyyy",

  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    set({ theme });
  },
  setCurrency: (currency) => {
    localStorage.setItem("currency", currency);
    set({ currency });
  },
}));
