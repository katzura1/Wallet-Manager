import { useState, useRef, useEffect } from "react";
import { Modal, Button } from "@/components/ui";
import { parseChatMessage, type ParsedTransaction } from "@/lib/geminiParser";
import { addTransaction, addTransfer } from "@/db/transactions";
import { useWalletStore } from "@/stores/walletStore";
import { isAIOnline } from "@/lib/aiGuard";
import { ChatMessage } from "./ChatMessage";
import type { ChatMessage as ChatMessageType } from "./types";
import { Send, Loader2 } from "lucide-react";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const apiKey = localStorage.getItem("gemini_api_key") ?? "";
  const model = localStorage.getItem("gemini_model") ?? "gemini-2.5-flash";
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { accounts, categories, transactions, refreshAll } = useWalletStore();
  const currency = localStorage.getItem("wallet_currency") ?? "IDR";

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "Halo! Saya adalah asisten keuangan Anda. Ketik transaksi untuk mencatat, atau tanyakan tentang pengeluaran Anda.\n\nContoh:\n• beli kopi 15000\n• gaji 5000000\n• berapa pengeluaran minggu ini?",
          timestamp: new Date(),
          type: "text",
        },
      ]);
    }
  }, [open, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  function generateId() {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function addErrorMessage(content: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        role: "assistant",
        content,
        timestamp: new Date(),
        type: "error",
      },
    ]);
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || isProcessing) return;

    // Add user message
    const userMessage: ChatMessageType = {
      id: generateId(),
      role: "user",
      content: text,
      timestamp: new Date(),
      type: "text",
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");

    // Check online status
    if (!isAIOnline()) {
      addErrorMessage("Perangkat sedang offline. Fitur AI butuh koneksi internet.");
      return;
    }

    // Check API key
    if (!apiKey.trim()) {
      addErrorMessage("Gemini API key belum diset. Silakan set API key di Pengaturan.");
      return;
    }

    setIsProcessing(true);

    try {
      // Prepare recent transactions for context
      const recentTxs = transactions.slice(0, 30).map((tx) => ({
        type: tx.type,
        amount: tx.amount,
        date: tx.date,
      }));

      const result = await parseChatMessage(
        text,
        apiKey,
        accounts,
        categories,
        recentTxs,
        model,
      );

      if (result.type === "transaction" && result.transactions) {
        // Transaction found
        const assistantMessage: ChatMessageType = {
          id: generateId(),
          role: "assistant",
          content: `Saya mendeteksi ${result.transactions.length} transaksi. Silakan review dan konfirmasi:`,
          timestamp: new Date(),
          type: "transaction",
          transactions: result.transactions,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else if (result.type === "summary" && result.summaryData) {
        // Summary request
        const assistantMessage: ChatMessageType = {
          id: generateId(),
          role: "assistant",
          content: "",
          timestamp: new Date(),
          type: "summary",
          summaryData: result.summaryData,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        // Text response
        const assistantMessage: ChatMessageType = {
          id: generateId(),
          role: "assistant",
          content: result.text || "Maaf, saya tidak memahami permintaan Anda.",
          timestamp: new Date(),
          type: "text",
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Terjadi kesalahan saat memproses.";
      addErrorMessage(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleConfirmTransaction(tx: ParsedTransaction) {
    try {
      if (tx.type === "transfer" && tx.toAccountId) {
        await addTransfer(tx.accountId, tx.toAccountId, tx.amount, tx.date, tx.note);
      } else {
        await addTransaction({
          type: tx.type,
          amount: tx.amount,
          accountId: tx.accountId,
          categoryId: tx.categoryId,
          date: tx.date,
          note: tx.note,
        });
      }

      await refreshAll();

      // Add confirmation message
      const confirmMsg: ChatMessageType = {
        id: generateId(),
        role: "assistant",
        content: `Transaksi berhasil disimpan! ${tx.type === "income" ? "Pemasukan" : tx.type === "expense" ? "Pengeluaran" : "Transfer"} sebesar Rp ${tx.amount.toLocaleString("id-ID")} telah dicatat.`,
        timestamp: new Date(),
        type: "text",
      };
      setMessages((prev) => [...prev, confirmMsg]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Gagal menyimpan transaksi.";
      addErrorMessage(errorMsg);
    }
  }

  async function handleDeleteTransaction(messageId: string) {
    // Remove the transaction card from messages
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));

    const deleteMsg: ChatMessageType = {
      id: generateId(),
      role: "assistant",
      content: "Transaksi dibatalkan.",
      timestamp: new Date(),
      type: "text",
    };
    setMessages((prev) => [...prev, deleteMsg]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleClose() {
    setMessages([]);
    setInputText("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Asisten Keuangan" noScroll>
      <div className="flex flex-col min-h-0 flex-1">
        {/* Messages - scrollable */}
        <div className="flex-1 overflow-y-auto space-y-4 min-h-0 p-5 pb-4">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              accounts={accounts}
              categories={categories}
              currency={currency}
              onConfirmTransaction={handleConfirmTransaction}
              onDeleteTransaction={handleDeleteTransaction}
            />
          ))}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/96 px-4 py-3 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-[hsl(var(--primary))]" />
                <span className="text-sm text-[hsl(var(--muted-foreground))]">Memproses...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input - fixed at bottom */}
        <div className="flex-none border-t border-[hsl(var(--border))] p-5 pt-4">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ketik transaksi atau pertanyaan..."
              disabled={isProcessing}
              className="flex-1 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] disabled:opacity-50"
            />
            <Button
              onClick={handleSend}
              disabled={!inputText.trim() || isProcessing}
              size="icon"
              className="rounded-full w-12 h-12"
            >
              {isProcessing ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Send size={20} />
              )}
            </Button>
          </div>
          {!apiKey.trim() && (
            <p className="text-[10px] text-amber-500 mt-2 text-center">
              API key belum diset. Silakan set di Pengaturan.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
