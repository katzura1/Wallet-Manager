import type { ParsedTransaction } from "@/lib/geminiParser";

export interface SummaryData {
  type: "daily" | "weekly" | "monthly";
  period: string;
  income: number;
  expense: number;
  net: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  type?: "text" | "transaction" | "summary" | "error";
  transaction?: ParsedTransaction;
  transactions?: ParsedTransaction[];
  summaryData?: SummaryData;
}

export interface ChatState {
  messages: ChatMessage[];
  isOpen: boolean;
  isProcessing: boolean;
}
