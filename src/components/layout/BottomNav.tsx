import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: "🏠", label: "Beranda", exact: true },
  { to: "/transactions", icon: "📋", label: "Transaksi", exact: false },
  { to: "/debts", icon: "🤝", label: "Hutang", exact: false },
  { to: "/accounts", icon: "💳", label: "Akun", exact: false },
  { to: "/reports", icon: "📊", label: "Laporan", exact: false },
  { to: "/settings", icon: "⚙️", label: "Setelan", exact: false },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[hsl(var(--background))]/95 backdrop-blur border-t border-[hsl(var(--border))] safe-bottom">
      <div className="flex items-stretch max-w-lg mx-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 px-1 text-xs font-medium transition-colors",
                isActive ? "text-indigo-600 dark:text-indigo-400" : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn("text-xl leading-none rounded-xl px-3 py-1 transition-colors", isActive ? "bg-indigo-100 dark:bg-indigo-900/50" : "")}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
