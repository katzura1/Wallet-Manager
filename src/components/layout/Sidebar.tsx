import { Link, useLocation } from "react-router-dom";
import { BarChart3, CandlestickChart, HandCoins, House, MessageCircle, PiggyBank, Plus, ReceiptText, RefreshCw, Settings, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  onOpenChat: () => void;
}

interface SidebarItem {
  to: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string, params: URLSearchParams) => boolean;
}

const items: SidebarItem[] = [
  { to: "/", label: "Beranda", icon: House, isActive: (p) => p === "/" },
  { to: "/transactions", label: "Transaksi", icon: ReceiptText, isActive: (p, q) => p === "/transactions" && q.get("tab") !== "recurring" },
  { to: "/transactions?tab=recurring", label: "Terjadwal", icon: RefreshCw, isActive: (p, q) => p === "/transactions" && q.get("tab") === "recurring" },
  { to: "/reports", label: "Laporan", icon: BarChart3, isActive: (p) => p === "/reports" },
  { to: "/reports#anggaran", label: "Anggaran", icon: PiggyBank, isActive: () => false },
  { to: "/accounts", label: "Aset & akun", icon: WalletCards, isActive: (p) => p === "/accounts" },
  { to: "/debts", label: "Hutang & piutang", icon: HandCoins, isActive: (p) => p === "/debts" },
  { to: "/portfolio", label: "Portofolio", icon: CandlestickChart, isActive: (p) => p === "/portfolio" },
  { to: "/settings", label: "Pengaturan", icon: Settings, isActive: (p) => p === "/settings" || p === "/categories" },
];

const itemClass = (active: boolean) => cn(
  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
  active ? "bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]",
);

export function Sidebar({ onOpenChat }: SidebarProps) {
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);

  return (
    <header className="sticky top-0 hidden h-screen flex-col gap-4 border-r border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4 lg:flex">
      <div className="flex items-center gap-3 px-2 py-1 font-semibold tracking-tight">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
          <WalletCards size={18} aria-hidden="true" />
        </span>
        <span className="text-xl">Wallet</span>
      </div>

      <Link
        to="/transactions?new=1"
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
      >
        <Plus size={18} aria-hidden="true" /> Catat transaksi
      </Link>

      <nav aria-label="Navigasi utama" className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.map((item) => {
          const active = item.isActive(pathname, params);
          return (
            <Link key={item.to} to={item.to} aria-current={active ? "page" : undefined} className={itemClass(active)}>
              <item.icon size={18} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button type="button" onClick={onOpenChat} className={cn(itemClass(false), "w-full border border-[hsl(var(--border))]")}>
        <MessageCircle size={18} aria-hidden="true" />
        Chat AI
      </button>
    </header>
  );
}
