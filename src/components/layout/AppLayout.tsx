import { useCallback, useState } from "react";
import { Outlet } from "react-router-dom";
import { Plus } from "lucide-react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Button } from "@/components/ui";
import type { AppLayoutContext, RegisteredPageAction } from "./appLayoutContext";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const [pageAction, setPageAction] = useState<RegisteredPageAction | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const registerPageAction = useCallback((action: RegisteredPageAction | null) => setPageAction(action), []);
  const openChat = useCallback(() => setChatOpen(true), []);
  const actionContext: AppLayoutContext = { registerPageAction, openChat };

  return (
    <div className="app-shell min-h-screen print:block lg:grid lg:grid-cols-[240px_1fr] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <Sidebar onOpenChat={openChat} />

      <main className="mx-auto min-h-screen w-full max-w-[1440px] min-w-0 pb-32 lg:px-8 lg:pb-12">
        {pageAction && (
          <div className="hidden justify-end pt-6 lg:flex">
            <Button className="whitespace-nowrap" onClick={pageAction.onClick}><Plus size={18} /> {pageAction.label}</Button>
          </div>
        )}
        <Outlet context={actionContext} />
      </main>

      <BottomNav />

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
