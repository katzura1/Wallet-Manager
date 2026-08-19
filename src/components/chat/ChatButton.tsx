import { MessageCircle } from "lucide-react";

interface ChatButtonProps {
  onClick: () => void;
  hasNewMessage?: boolean;
}

export function ChatButton({ onClick, hasNewMessage = false }: ChatButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] right-4 z-40 w-11 h-11 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_12px_24px_-8px_hsl(var(--primary))] flex items-center justify-center hover:scale-105 transition-transform active:scale-95 sm:bottom-24"
      aria-label="Buka Asisten Keuangan"
    >
      <MessageCircle size={24} />
      {hasNewMessage && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
          !
        </span>
      )}
    </button>
  );
}
