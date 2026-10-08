import { useRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { BarChart3, HandCoins, House, ReceiptText, WalletCards, CandlestickChart, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const itemClass = (active: boolean) => cn(
  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-1 py-2 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
  active ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))]",
);

export function BottomNav() {
  const { pathname } = useLocation();
  const financeMenu = useRef<HTMLDetailsElement>(null);
  const isFinance = ["/accounts", "/debts", "/portfolio"].includes(pathname);

  return (
    <nav aria-label="Navigasi utama" className="safe-bottom fixed inset-x-0 bottom-0 z-40 px-3 lg:hidden">
      <div className="mx-auto flex max-w-2xl items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1.5 shadow-lg">
        <NavLink to="/" end className={({ isActive }) => itemClass(isActive)}>
          <House size={18} /><span>Dashboard</span>
        </NavLink>
        <NavLink to="/transactions" className={({ isActive }) => itemClass(isActive)}>
          <ReceiptText size={18} /><span>Transaksi</span>
        </NavLink>
        <details ref={financeMenu} className="relative flex min-w-0 flex-1">
          <summary className={cn(itemClass(isFinance), "list-none cursor-pointer [&::-webkit-details-marker]:hidden")}>
            <WalletCards size={18} /><span>Keuangan</span>
          </summary>
          <div className="absolute bottom-[calc(100%+0.75rem)] left-1/2 w-52 -translate-x-1/2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-xl">
            <Link onClick={() => { financeMenu.current?.removeAttribute("open"); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-[hsl(var(--surface-2))]" to="/accounts"><WalletCards size={17} /> Akun</Link>
            <Link onClick={() => { financeMenu.current?.removeAttribute("open"); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-[hsl(var(--surface-2))]" to="/debts"><HandCoins size={17} /> Hutang &amp; Piutang</Link>
            <Link onClick={() => { financeMenu.current?.removeAttribute("open"); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-[hsl(var(--surface-2))]" to="/portfolio"><CandlestickChart size={17} /> Portofolio</Link>
          </div>
        </details>
        <NavLink to="/reports" className={({ isActive }) => itemClass(isActive)}>
          <BarChart3 size={18} /><span>Laporan</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => itemClass(isActive || pathname === "/categories")}>
          <Settings size={18} /><span>Pengaturan</span>
        </NavLink>
      </div>
    </nav>
  );
}
