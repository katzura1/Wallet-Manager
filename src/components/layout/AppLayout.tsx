import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { MessageCircle, Plus, WalletCards, X } from "lucide-react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Button } from "@/components/ui";
import type { AppLayoutContext, RegisteredPageAction } from "./appLayoutContext";
import { BottomNav } from "./BottomNav";

const primaryLinks = [
  { to: "/", label: "Ringkasan", end: true },
  { to: "/transactions", label: "Transaksi" },
];

export function AppLayout() {
  const { pathname } = useLocation();
  const actionSheetRef = useRef<HTMLDivElement>(null);
  const actionSheetCloseRef = useRef<HTMLButtonElement>(null);
  const [pageAction, setPageAction] = useState<RegisteredPageAction | null>(null);
  const [actionSheetPath, setActionSheetPath] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const registerPageAction = useCallback((action: RegisteredPageAction | null) => setPageAction(action), []);
  const openChat = useCallback(() => setChatOpen(true), []);
  const closeActionSheet = useCallback(() => setActionSheetPath(null), []);
  const actionContext: AppLayoutContext = { registerPageAction, openChat };
  const mobileActions = pageAction?.getMobileActions() ?? [];
  const actionSheetOpen = actionSheetPath === pathname;
  useEffect(() => {
    if (!actionSheetOpen) return;
    actionSheetCloseRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActionSheetPath(null);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = actionSheetRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionSheetOpen]);

  return (
    <div className="app-shell min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="hidden border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] lg:block">
        <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-4 px-5 xl:gap-8 xl:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-3 font-semibold tracking-tight" aria-label="Wallet, ke ringkasan">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
              <WalletCards size={20} />
            </span>
            <span className="text-xl">Wallet</span>
          </Link>

          <nav aria-label="Navigasi utama" className="flex items-center gap-1 xl:gap-2">
            {primaryLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `whitespace-nowrap rounded-full px-3 py-3 text-sm font-medium transition-colors xl:px-5 ${isActive ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"}`}
              >
                {item.label}
              </NavLink>
            ))}
            <details key={pathname} className="relative">
              <summary className={`cursor-pointer list-none whitespace-nowrap rounded-full px-3 py-3 text-sm font-medium transition-colors xl:px-5 [&::-webkit-details-marker]:hidden ${["/accounts", "/debts", "/portfolio"].includes(pathname) ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : "bg-[hsl(var(--card))] hover:bg-[hsl(var(--surface-2))]"}`}>
                Keuangan <span aria-hidden="true" className="ml-1 text-[hsl(var(--muted-foreground))]">⌄</span>
              </summary>
              <div className="absolute left-0 top-[calc(100%+0.5rem)] z-50 min-w-52 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-lg">
                <Link className="block rounded-xl px-3 py-2.5 text-sm hover:bg-[hsl(var(--surface-2))]" to="/accounts">Akun</Link>
                <Link className="block rounded-xl px-3 py-2.5 text-sm hover:bg-[hsl(var(--surface-2))]" to="/debts">Hutang &amp; Piutang</Link>
                <Link className="block rounded-xl px-3 py-2.5 text-sm hover:bg-[hsl(var(--surface-2))]" to="/portfolio">Portofolio</Link>
              </div>
            </details>
            <NavLink to="/reports" className={({ isActive }) => `whitespace-nowrap rounded-full px-3 py-3 text-sm font-medium transition-colors xl:px-5 ${isActive ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : "bg-[hsl(var(--card))] hover:bg-[hsl(var(--surface-2))]"}`}>Laporan</NavLink>
            <NavLink to="/settings" className={({ isActive }) => `whitespace-nowrap rounded-full px-3 py-3 text-sm font-medium transition-colors xl:px-5 ${isActive || pathname === "/categories" ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : "bg-[hsl(var(--card))] hover:bg-[hsl(var(--surface-2))]"}`}>Pengaturan</NavLink>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="icon" className="hidden lg:inline-flex xl:hidden" onClick={openChat} aria-label="Chat AI" title="Chat AI">
              <MessageCircle size={17} />
            </Button>
            <Button variant="outline" className="hidden xl:inline-flex" onClick={openChat}>
              <MessageCircle size={17} /> Chat AI
            </Button>
            {pageAction && <Button className="whitespace-nowrap" onClick={pageAction.onClick}><Plus size={18} /> {pageAction.label}</Button>}
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-screen w-full max-w-[1440px] pb-32 lg:px-8 lg:pb-12">
        <Outlet context={actionContext} />
      </main>

      <BottomNav />

      {pageAction && (
        <button
          type="button"
          className="app-floating-action fixed bottom-[calc(5.875rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 lg:hidden"
          onClick={() => mobileActions.length > 0 ? setActionSheetPath(pathname) : pageAction.onClick()}
          aria-label={mobileActions.length > 0 ? "Buka aksi cepat" : pageAction.label}
        >
          <Plus size={24} />
        </button>
      )}

      {actionSheetOpen && pageAction && (
        <div ref={actionSheetRef} data-action-sheet className="fixed inset-0 z-50 flex items-end bg-slate-950/35 p-3 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={closeActionSheet}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-actions-title"
            className="mx-auto w-full max-w-lg rounded-3xl bg-[hsl(var(--card))] p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 id="quick-actions-title" className="text-lg font-semibold">Aksi cepat</h2>
              <button ref={actionSheetCloseRef} type="button" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[hsl(var(--surface-2))]" onClick={closeActionSheet} aria-label="Tutup aksi cepat">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-1">
              {mobileActions.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-[hsl(var(--surface-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  onClick={() => { closeActionSheet(); item.onClick(); }}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--surface-2))] text-[hsl(var(--primary))]">
                    <item.icon size={19} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-[hsl(var(--muted-foreground))]">{item.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
