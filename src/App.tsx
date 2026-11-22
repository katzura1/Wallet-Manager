import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
  const [swUpdateState, setSwUpdateState] = useState<"ready" | "updating" | "updated">("ready");
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const { isLocked } = usePinStore();

  useEffect(() => {
    updateSWRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setSwUpdateState("ready");
        setShowUpdateToast(true);
      },
    });
  }, []);

  const applyUpdate = async () => {
    if (!updateSWRef.current || swUpdateState === "updating") return;

    setSwUpdateState("updating");
    try {
      await updateSWRef.current(false);
      setSwUpdateState("updated");
      window.setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch {
      setSwUpdateState("ready");
    }
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
            <Route path="/ledger" element={<Navigate to="/reports?tab=ledger" replace />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/categories" element={<Categories />} />
          </Route>
        </Routes>
      </BrowserRouter>

      {showUpdateToast && (
        <div className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 sm:bottom-6 sm:left-auto sm:right-6 sm:w-80">
          <div className="rounded-2xl bg-[hsl(var(--foreground))] p-4 text-[hsl(var(--background))] shadow-lg">
            <p className="text-xs font-medium opacity-70">Pembaruan aplikasi</p>
            <p className="mt-1 text-base font-semibold">Versi baru tersedia</p>
            <p className="mt-1 text-xs opacity-70" role="status" aria-live="polite">
              {swUpdateState === "ready" && "Perbarui sekarang untuk melihat perubahan terbaru."}
              {swUpdateState === "updating" && "Sedang menerapkan update aplikasi..."}
              {swUpdateState === "updated" && "Update berhasil. Aplikasi akan dimuat ulang."}
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" className="min-h-11 text-[hsl(var(--background))] hover:bg-[hsl(var(--background))]/15 hover:text-[hsl(var(--background))]" disabled={swUpdateState !== "ready"} onClick={() => setShowUpdateToast(false)}>
                Nanti
              </Button>
              <Button size="sm" className="min-h-11" disabled={swUpdateState !== "ready"} onClick={() => void applyUpdate()}>
                {swUpdateState === "ready" && "Perbarui"}
                {swUpdateState === "updating" && (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
                    Memperbarui...
                  </>
                )}
                {swUpdateState === "updated" && "Berhasil"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
