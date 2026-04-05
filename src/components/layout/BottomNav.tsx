import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { BarChart3, CandlestickChart, HandCoins, House, ReceiptText } from "lucide-react";

const navItems = [
  { to: "/", icon: House, label: "Beranda", exact: true },
  { to: "/transactions", icon: ReceiptText, label: "Transaksi", exact: false },
  { to: "/debts", icon: HandCoins, label: "Hutang", exact: false },
  { to: "/portfolio", icon: CandlestickChart, label: "Portofolio", exact: false },
  { to: "/reports", icon: BarChart3, label: "Laporan", exact: false },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-2 safe-bottom">
      <div className="mx-auto max-w-xl rounded-[28px] border border-white/10 bg-[hsl(var(--card))]/92 p-1.5 shadow-[0_-8px_40px_-24px_rgba(15,23,42,0.65)] backdrop-blur-xl">
        <div className="flex w-full">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 rounded-[22px] px-1 py-2.5 text-[10px] font-semibold transition-all min-w-11 min-h-14",
                  isActive ? "bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-2xl transition-all", isActive ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_10px_20px_-16px_hsl(var(--primary))]" : "bg-transparent")}> 
                    <item.icon size={16} strokeWidth={2.1} />
                  </span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
