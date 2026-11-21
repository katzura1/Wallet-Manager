import { Link, NavLink, useLocation } from "react-router-dom";
import { BarChart3, House, Plus, ReceiptText, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

const itemClass = (active: boolean) => cn(
  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-1 py-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
  active ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]",
);

const assetPaths = ["/accounts", "/debts", "/portfolio", "/settings", "/categories"];

export function BottomNav() {
  const { pathname } = useLocation();
  const isAssets = assetPaths.includes(pathname);

  return (
    <nav aria-label="Navigasi utama" className="safe-bottom fixed inset-x-0 bottom-0 z-40 px-3 lg:hidden">
      <div className="mx-auto flex max-w-2xl items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1.5 shadow-lg">
        <NavLink to="/" end className={({ isActive }) => itemClass(isActive)}>
          <House size={20} aria-hidden="true" /><span>Beranda</span>
        </NavLink>
        <NavLink to="/transactions" className={({ isActive }) => itemClass(isActive)}>
          <ReceiptText size={20} aria-hidden="true" /><span>Transaksi</span>
        </NavLink>
        <div className="flex flex-1 justify-center">
          <Link
            to="/transactions?new=1"
            aria-label="Catat transaksi"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
          >
            <Plus size={26} aria-hidden="true" />
          </Link>
        </div>
        <NavLink to="/reports" className={({ isActive }) => itemClass(isActive)}>
          <BarChart3 size={20} aria-hidden="true" /><span>Laporan</span>
        </NavLink>
        <Link to="/accounts" aria-current={isAssets ? "page" : undefined} className={itemClass(isAssets)}>
          <WalletCards size={20} aria-hidden="true" /><span>Aset</span>
        </Link>
      </div>
    </nav>
  );
}
