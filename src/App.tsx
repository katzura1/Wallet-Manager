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
            <Route path="/settings" element={<Settings />} />
            <Route path="/categories" element={<Categories />} />
          </Route>
        </Routes>
      </BrowserRouter>

      {showUpdateToast && (
        <div className="fixed left-4 right-4 bottom-20 z-50 sm:left-auto sm:right-6 sm:bottom-6 sm:w-80">
          <div className="rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 p-5 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.65)] backdrop-blur-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Pembaruan App</p>
            <p className="mt-1 text-base font-semibold text-[hsl(var(--foreground))]">Versi baru tersedia</p>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]" role="status" aria-live="polite">
              {swUpdateState === "ready" && "Update sekarang untuk melihat perubahan terbaru."}
              {swUpdateState === "updating" && "Sedang menerapkan update aplikasi..."}
              {swUpdateState === "updated" && "Update berhasil. Aplikasi akan dimuat ulang."}
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" disabled={swUpdateState !== "ready"} onClick={() => setShowUpdateToast(false)}>
                Nanti
              </Button>
              <Button size="sm" disabled={swUpdateState !== "ready"} onClick={() => void applyUpdate()}>
                {swUpdateState === "ready" && "Update"}
                {swUpdateState === "updating" && (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
                    Updating...
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
