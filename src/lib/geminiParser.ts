import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Account, Category } from "@/types";
import { todayISO } from "@/lib/utils";

export interface ParsedTransaction {
  type: "income" | "expense" | "transfer";
  amount: number;
  accountId: number;
  toAccountId?: number;
  categoryId?: number;
  date: string;
  note: string;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  raw?: string;
}

function buildPrompt(text: string, accounts: Account[], categories: Category[]): string {
  const accountList = accounts
    .filter((a) => !a.isArchived)
    .map((a) => `  - id:${a.id} name:"${a.name}" type:${a.type}`)
    .join("\n");

  const categoryList = categories
    .map((c) => `  - id:${c.id} name:"${c.name}" type:${c.type} icon:${c.icon}`)
    .join("\n");

  return `Kamu adalah parser transaksi keuangan yang cerdas. Tugasmu: ubah teks bahasa Indonesia (atau campur dengan bahasa Inggris) menjadi data transaksi terstruktur.

Tanggal hari ini: ${todayISO()}

Daftar akun yang tersedia:
${accountList || "  (tidak ada akun)"}

Daftar kategori yang tersedia:
${categoryList || "  (tidak ada kategori)"}

Aturan penting:
1. Return HANYA valid JSON array, tanpa penjelasan apapun.
2. Setiap transaksi memiliki field: type, amount, accountId, toAccountId (hanya untuk transfer), categoryId, date, note.
3. type bisa: "income", "expense", atau "transfer".
4. Cocokkan nama akun dari teks ke daftar akun - gunakan accountId yang sesuai. Jika tidak cocok, gunakan akun pertama.
5. Cocokkan kategori dari konteks (makanan, belanja, dll) ke daftar kategori - gunakan categoryId yang sesuai. Jika tidak ada yang cocok, abaikan categoryId.
6. Untuk transfer: isi toAccountId dengan id akun tujuan.
7. Konversi jumlah uang: "30rb" = 30000, "50k" = 50000, "500k" = 500000, "1jt" = 1000000, "1.5jt" = 1500000.
8. Jika tanggal tidak disebutkan, gunakan tanggal hari ini: ${todayISO()}.
9. Tanggal format: YYYY-MM-DD.
10. note: ringkasan singkat transaksi (bukan seluruh teks user).
11. Satu teks bisa menghasilkan LEBIH DARI SATU transaksi.

Contoh output:
[
  {"type":"expense","amount":50000,"accountId":1,"categoryId":3,"date":"${todayISO()}","note":"Beli makanan"},
  {"type":"transfer","amount":30000,"accountId":2,"toAccountId":1,"date":"${todayISO()}","note":"Bayar kartu kredit"}
]

Teks untuk diparse:
"${text}"`;
}

export const GEMINI_MODELS = [
  { value: "gemini-2.5-flash-preview", label: "Gemini 2.5 Flash Preview" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash (Fallback)" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (Fallback)" },
  { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite (Fallback)" },
  { value: "custom", label: "Custom (ketik manual)" },
];

export async function parseTransactionText(
  text: string,
  apiKey: string,
  accounts: Account[],
  categories: Category[],
  modelName = "gemini-2.5-flash",
): Promise<ParseResult> {
  if (!apiKey.trim()) {
    throw new Error("Gemini API key belum diset. Silakan set API key di Pengaturan.");
  }
  if (!text.trim()) {
    throw new Error("Teks tidak boleh kosong.");
  }

  const genAI = new GoogleGenerativeAI(apiKey.trim());
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = buildPrompt(text, accounts, categories);
  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  // Extract JSON array from response (handles markdown code blocks)
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Gemini tidak mengembalikan format yang valid. Coba tulis ulang kalimatnya.");
  }

  let parsed: ParsedTransaction[];
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Gagal memparse respons Gemini. Coba tulis ulang kalimatnya.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Tidak ada transaksi yang terdeteksi dari teks tersebut.");
  }

  // Validate and sanitize each transaction
  const validAccountIds = new Set(accounts.filter((a) => !a.isArchived).map((a) => a.id!));
  const validCategoryIds = new Set(categories.map((c) => c.id!));
  const fallbackAccountId = accounts.find((a) => !a.isArchived)?.id;

  const transactions: ParsedTransaction[] = parsed.map((tx) => {
    const accountId = validAccountIds.has(tx.accountId) ? tx.accountId : (fallbackAccountId ?? 0);
    const toAccountId = tx.type === "transfer" && tx.toAccountId && validAccountIds.has(tx.toAccountId)
      ? tx.toAccountId
      : undefined;
    const categoryId = tx.categoryId && validCategoryIds.has(tx.categoryId) ? tx.categoryId : undefined;

    return {
      type: ["income", "expense", "transfer"].includes(tx.type) ? tx.type : "expense",
      amount: Math.abs(Number(tx.amount) || 0),
      accountId,
      toAccountId,
      categoryId,
      date: /^\d{4}-\d{2}-\d{2}$/.test(tx.date) ? tx.date : todayISO(),
      note: String(tx.note ?? ""),
    };
  });

  return { transactions, raw };
}
