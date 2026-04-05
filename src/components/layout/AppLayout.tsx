import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export function AppLayout() {
  return (
    <div className="app-shell min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-56 bg-[radial-gradient(circle_at_top,_hsla(192,72%,62%,0.12),_transparent_58%)] dark:bg-[radial-gradient(circle_at_top,_hsla(192,72%,62%,0.16),_transparent_58%)]" />
      <main className="relative z-10 max-w-xl mx-auto pb-36 min-h-screen">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
