import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "IDR"): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string, fmt = "dd MMM yyyy"): string {
  try {
    return format(parseISO(dateStr), fmt, { locale: idLocale });
  } catch {
    return dateStr;
  }
}

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: "Bank",
  ewallet: "E-Wallet",
  cash: "Tunai",
  credit: "Kartu Kredit",
  investment: "Investasi",
};

export const TRANSACTION_TYPE_COLORS: Record<string, string> = {
  income: "text-emerald-500",
  expense: "text-red-500",
  transfer: "text-amber-500",
};

export const TRANSACTION_TYPE_BG: Record<string, string> = {
  income: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  expense: "bg-red-500/10 text-red-600 dark:text-red-400",
  transfer: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export const ACCOUNT_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#06b6d4",
  "#84cc16",
  "#6b7280",
];

export const ACCOUNT_ICONS: Record<string, string> = {
  bank: "🏦",
  ewallet: "📱",
  cash: "💵",
  credit: "💳",
  investment: "📈",
};
