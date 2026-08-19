import type { ChatMessage as ChatMessageType } from "./types";
import type { Account, Category } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { ChatTransactionCard } from "./ChatTransactionCard";
import type { ParsedTransaction } from "@/lib/geminiParser";

interface ChatMessageProps {
  message: ChatMessageType;
  accounts: Account[];
  categories: Category[];
  currency: string;
  onConfirmTransaction: (tx: ParsedTransaction) => void;
  onDeleteTransaction: (txId: string) => void;
}

export function ChatMessage({
  message,
  accounts,
  categories,
  currency,
  onConfirmTransaction,
  onDeleteTransaction,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "order-2" : "order-1"}`}>
        {message.type === "transaction" && message.transactions ? (
          <div className="space-y-2">
            {message.transactions.map((tx, idx) => (
              <ChatTransactionCard
                key={`${message.id}-${idx}`}
                transaction={tx}
                accounts={accounts}
                categories={categories}
                currency={currency}
                onConfirm={onConfirmTransaction}
                onDelete={() => onDeleteTransaction(message.id)}
              />
            ))}
          </div>
        ) : message.type === "summary" && message.summaryData ? (
          <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/96 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.55)] backdrop-blur-sm p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))] mb-2">
              Ringkasan {message.summaryData.type === "daily" ? "Hari Ini" : message.summaryData.type === "weekly" ? "Minggu Ini" : "Bulan Ini"}
            </p>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))] mb-3">{message.summaryData.period}</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[hsl(var(--foreground))]">Pemasukan</span>
                <span className="text-sm font-semibold text-emerald-500">
                  {formatCurrency(message.summaryData.income, currency)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[hsl(var(--foreground))]">Pengeluaran</span>
                <span className="text-sm font-semibold text-red-500">
                  -{formatCurrency(message.summaryData.expense, currency)}
                </span>
              </div>
              <div className="border-t border-[hsl(var(--border))] pt-2 flex justify-between items-center">
                <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Saldo</span>
                <span className={`text-sm font-bold ${message.summaryData.net >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {formatCurrency(message.summaryData.net, currency)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-3xl px-4 py-3 text-sm leading-relaxed ${
              isUser
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "border border-[hsl(var(--border))] bg-[hsl(var(--card))]/96 text-[hsl(var(--foreground))] shadow-[0_18px_45px_-34px_rgba(15,23,42,0.55)] backdrop-blur-sm"
            }`}
          >
            {message.content}
          </div>
        )}
        <p className={`text-[10px] text-[hsl(var(--muted-foreground))] mt-1 ${isUser ? "text-right" : "text-left"}`}>
          {message.timestamp.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
