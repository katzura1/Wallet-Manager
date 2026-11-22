import { useCallback, useState } from "react";
import { Outlet } from "react-router-dom";
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

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
