import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <main className="max-w-lg mx-auto pb-24 min-h-screen">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
