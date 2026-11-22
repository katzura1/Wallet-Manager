import { useCallback, useState } from "react";
import { Outlet } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import type { AppLayoutContext } from "./appLayoutContext";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const [chatOpen, setChatOpen] = useState(false);
  const openChat = useCallback(() => setChatOpen(true), []);
  const actionContext: AppLayoutContext = { openChat };

  return (
    <div className="app-shell min-h-screen print:block lg:grid lg:grid-cols-[240px_1fr] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <Sidebar onOpenChat={openChat} />

      <main className="mx-auto min-h-screen w-full max-w-[1440px] min-w-0 pb-32 lg:px-8 lg:pb-12">
        <Outlet context={actionContext} />
      </main>

      <BottomNav />

      {!chatOpen && (
        <button
          type="button"
          onClick={openChat}
          aria-label="Chat AI"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)" }}
          className="no-print fixed right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--primary))] shadow-lg transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] lg:hidden"
        >
          <MessageCircle size={22} aria-hidden="true" />
        </button>
      )}

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
