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
    const accounts = await getAccounts(true);
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

// PIN lock store
interface PinState {
  pin: string | null;
  isLocked: boolean;
  setPin: (pin: string | null) => void;
  unlock: () => void;
  lock: () => void;
}

export const usePinStore = create<PinState>((set) => ({
  pin: localStorage.getItem("wallet_pin"),
  isLocked: !!localStorage.getItem("wallet_pin") && !sessionStorage.getItem("wallet_unlocked"),
  setPin: (pin) => {
    if (pin) {
      localStorage.setItem("wallet_pin", pin);
    } else {
      localStorage.removeItem("wallet_pin");
      sessionStorage.removeItem("wallet_unlocked");
    }
    set({ pin, isLocked: false });
  },
  unlock: () => {
    sessionStorage.setItem("wallet_unlocked", "1");
    set({ isLocked: false });
  },
  lock: () => {
    sessionStorage.removeItem("wallet_unlocked");
    set({ isLocked: true });
  },
}));
