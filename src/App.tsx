import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { AppLayout } from "@/components/layout/AppLayout";
import { LockScreen } from "@/components/LockScreen";
import { Button } from "@/components/ui";
import Accounts from "@/pages/Accounts";
import Categories from "@/pages/Categories";
import Dashboard from "@/pages/Dashboard";
import Debts from "@/pages/Debts";
import Portfolio from "@/pages/Portfolio";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import Transactions from "@/pages/Transactions";
import { usePinStore } from "@/stores/walletStore";

export default function App() {
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const { isLocked } = usePinStore();

  useEffect(() => {
    updateSWRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setShowUpdateToast(true);
      },
    });
  }, []);

  const applyUpdate = async () => {
    if (!updateSWRef.current) return;
    await updateSWRef.current(true);
  };

  if (isLocked) return <LockScreen />;

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/debts" element={<Debts />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/categories" element={<Categories />} />
          </Route>
        </Routes>
      </BrowserRouter>

      {showUpdateToast && (
        <div className="fixed left-4 right-4 bottom-20 z-50 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[360px]">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xl">
            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Versi baru tersedia</p>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Update sekarang untuk melihat perubahan terbaru.</p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowUpdateToast(false)}>
                Nanti
              </Button>
              <Button size="sm" onClick={() => void applyUpdate()}>
                Update
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
