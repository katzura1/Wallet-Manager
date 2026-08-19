import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Account, Category } from "@/types";
import { todayISO } from "@/lib/utils";
import { assertAIRequestAllowed, isAIOnline } from "@/lib/aiGuard";

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

interface ImageParseInput {
  mimeType: string;
  base64Data: string;
}

function buildAccountList(accounts: Account[]) {
  return accounts
    .filter((a) => !a.isArchived)
    .map((a) => `  - id:${a.id} name:"${a.name}" type:${a.type}`)
    .join("\n");
}

function buildCategoryList(categories: Category[]) {
  return categories
    .map((c) => `  - id:${c.id} name:"${c.name}" type:${c.type} icon:${c.icon}`)
    .join("\n");
}

function buildPrompt(text: string, accounts: Account[], categories: Category[]): string {
  const accountList = buildAccountList(accounts);
  const categoryList = buildCategoryList(categories);

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

function buildReceiptPrompt(accounts: Account[], categories: Category[]): string {
  const accountList = buildAccountList(accounts);
  const categoryList = buildCategoryList(categories);

  return `Kamu adalah parser transaksi keuangan dari foto struk atau receipt. Tugasmu: baca gambar struk lalu ubah menjadi data transaksi terstruktur.

Tanggal hari ini: ${todayISO()}

Daftar akun yang tersedia:
${accountList || "  (tidak ada akun)"}

Daftar kategori yang tersedia:
${categoryList || "  (tidak ada kategori)"}

Aturan penting:
1. Return HANYA valid JSON array, tanpa penjelasan apapun.
2. Setiap transaksi memiliki field: type, amount, accountId, toAccountId (hanya untuk transfer), categoryId, date, note.
3. Untuk struk belanja biasa, default type adalah "expense". Gunakan "income" hanya jika benar-benar terlihat sebagai pemasukan atau refund.
4. Fokus ke total akhir yang paling mungkin dibayar user. Jangan ambil subtotal kalau ada grand total atau total bayar.
5. Cocokkan kategori dari merchant, item, atau konteks struk.
6. Pilih accountId akun pertama yang tersedia jika gambar tidak memberi petunjuk akun pembayaran.
7. Jika tanggal tidak terbaca jelas, gunakan ${todayISO()}.
8. Tanggal format: YYYY-MM-DD.
9. note harus singkat dan informatif, misalnya nama merchant atau ringkasan pembelian.
10. Biasanya hasilnya satu transaksi, tapi jika gambar jelas memuat lebih dari satu transaksi, boleh return lebih dari satu.
11. Jangan pernah membuat transfer kecuali gambar jelas menunjukkan perpindahan antar akun.

Contoh output:
[
  {"type":"expense","amount":125000,"accountId":1,"categoryId":3,"date":"${todayISO()}","note":"Belanja Indomaret"}
]`;
}

function sanitizeTransactions(parsed: ParsedTransaction[], accounts: Account[], categories: Category[]): ParsedTransaction[] {
  const validAccountIds = new Set(accounts.filter((a) => !a.isArchived).map((a) => a.id!));
  const validCategoryIds = new Set(categories.map((c) => c.id!));
  const fallbackAccountId = accounts.find((a) => !a.isArchived)?.id;

  return parsed.map((tx) => {
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
      note: String(tx.note ?? "").trim(),
    };
  }).filter((tx) => tx.amount > 0 && tx.accountId > 0);
}

function extractTransactions(raw: string) {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Gemini tidak mengembalikan format yang valid. Coba lagi.");
  }

  let parsed: ParsedTransaction[];
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Gagal memparse respons Gemini. Coba lagi.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Tidak ada transaksi yang terdeteksi.");
  }

  return parsed;
}

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
  if (!isAIOnline()) {
    throw new Error("Perangkat sedang offline. Fitur AI butuh koneksi internet.");
  }

  assertAIRequestAllowed("ai-parse-text", 2000);

  const genAI = new GoogleGenerativeAI(apiKey.trim());
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = buildPrompt(text, accounts, categories);
  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  const parsed = extractTransactions(raw);
  const transactions = sanitizeTransactions(parsed, accounts, categories);

  if (transactions.length === 0) {
    throw new Error("Tidak ada transaksi valid yang terdeteksi dari teks tersebut.");
  }

  return { transactions, raw };
}

export async function parseReceiptImage(
  image: ImageParseInput,
  apiKey: string,
  accounts: Account[],
  categories: Category[],
  modelName = "gemini-2.5-flash",
): Promise<ParseResult> {
  if (!apiKey.trim()) {
    throw new Error("Gemini API key belum diset. Silakan set API key di Pengaturan.");
  }
  if (!image.base64Data.trim()) {
    throw new Error("Gambar struk belum dipilih.");
  }
  if (!isAIOnline()) {
    throw new Error("Perangkat sedang offline. Scan struk AI butuh koneksi internet.");
  }

  assertAIRequestAllowed("ai-parse-receipt", 3000);

  const genAI = new GoogleGenerativeAI(apiKey.trim());
  const model = genAI.getGenerativeModel({ model: modelName });
  const prompt = buildReceiptPrompt(accounts, categories);
  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: image.mimeType,
        data: image.base64Data,
      },
    },
  ]);
  const raw = result.response.text().trim();
  const parsed = extractTransactions(raw);
  const transactions = sanitizeTransactions(parsed, accounts, categories);

  if (transactions.length === 0) {
    throw new Error("Struk terbaca, tapi belum ada transaksi valid yang bisa dibuat.");
  }

  return { transactions, raw };
}

// Chat-specific types and functions

export interface ChatParseResult {
  type: "transaction" | "summary" | "text";
  transactions?: ParsedTransaction[];
  summaryData?: { type: "daily" | "weekly" | "monthly"; period: string; income: number; expense: number; net: number };
  text?: string;
  raw?: string;
}

function buildRecentSummary(transactions: { type: string; amount: number; categoryId?: number; date: string }[]): string {
  const recent = transactions
    .filter((tx) => tx.type === "expense" || tx.type === "income")
    .slice(0, 20);

  if (recent.length === 0) return "(belum ada transaksi)";

  const totalIncome = recent.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = recent.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);

  return `Total pemasukan: Rp ${totalIncome.toLocaleString("id-ID")}, Total pengeluaran: Rp ${totalExpense.toLocaleString("id-ID")}, Jumlah transaksi: ${recent.length}`;
}

function buildChatPrompt(
  text: string,
  accounts: Account[],
  categories: Category[],
  recentTransactions: { type: string; amount: number; date: string }[],
): string {
  const accountList = buildAccountList(accounts);
  const categoryList = buildCategoryList(categories);
  const recentSummary = buildRecentSummary(recentTransactions);

  return `Kamu adalah asisten keuangan pribadi yang cerdas dalam bahasa Indonesia.

Tanggal hari ini: ${todayISO()}

Daftar akun yang tersedia:
${accountList || "  (tidak ada akun)"}

Daftar kategori yang tersedia:
${categoryList || "  (tidak ada kategori)"}

Ringkasan transaksi terakhir:
${recentSummary}

TUGAS UTAMA:
1. Jika input adalah transaksi keuangan → return JSON array transaksi
2. Jika input adalah pertanyaan tentang ringkasan/summary → hitung dari data yang tersedia
3. Jika input adalah pertanyaan umum → jawab dengan natural

ATURAN PARSING TRANSAKSI:
- Return HANYA JSON array jika input adalah transaksi
- Setiap transaksi: type, amount, accountId, toAccountId (transfer), categoryId, date, note
- Konversi: "30rb" = 30000, "50k" = 50000, "500k" = 500000, "1jt" = 1000000
- Cocokkan akun/kategori dari teks ke daftar yang tersedia
- Jika tidak ada kategori yang cocok, abaikan categoryId
- Jika tanggal tidak disebutkan, gunakan tanggal hari ini: ${todayISO()}

ATURAN RINGKASAN:
- Hitung total pemasukan/pengeluaran/net dari data transaksi
- Format jawaban: "Pengeluaran minggu ini: Rp X (kategori1: Rp Y, kategori2: Rp Z)"
- Gunakan data dari ringkasan transaksi terakhir

ATURAN JAWABAN UMUM:
- Format jawaban dalam bahasa Indonesia yang natural
- Jika ada transaksi, selalu konfirmasi sebelum simpan

CONTOH INPUT TRANSAKSI:
Input: "beli kopi 15000"
Output: [{"type":"expense","amount":15000,"accountId":1,"categoryId":1,"date":"${todayISO()}","note":"Beli kopi"}]

CONTOH PERTANYAAN RINGKASAN:
Input: "berapa pengeluaran minggu ini?"
Output: "Berdasarkan data transaksi terakhir, pengeluaran Anda adalah Rp 1.250.000. Rincian: Makan & Minum (Rp 450.000), Transport (Rp 200.000), Belanja (Rp 600.000)."

CONTOH PERTANYAAN UMUM:
Input: "tips menabung"
Output: "Beberapa tips menabung: 1. Atur budget bulanan, 2. Catat semua pengeluaran, 3. Kurangi belanja non-esensial."

INPUT USER:
"${text}"`;
}

export async function parseChatMessage(
  text: string,
  apiKey: string,
  accounts: Account[],
  categories: Category[],
  recentTransactions: { type: string; amount: number; date: string }[],
  modelName = "gemini-2.5-flash",
): Promise<ChatParseResult> {
  if (!apiKey.trim()) {
    throw new Error("Gemini API key belum diset. Silakan set API key di Pengaturan.");
  }
  if (!text.trim()) {
    throw new Error("Teks tidak boleh kosong.");
  }
  if (!isAIOnline()) {
    throw new Error("Perangkat sedang offline. Fitur AI butuh koneksi internet.");
  }

  assertAIRequestAllowed("chatbot", 2000);

  const genAI = new GoogleGenerativeAI(apiKey.trim());
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = buildChatPrompt(text, accounts, categories, recentTransactions);
  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  // Try to parse as transaction first
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed: ParsedTransaction[] = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const transactions = sanitizeTransactions(parsed, accounts, categories);
        if (transactions.length > 0) {
          return { type: "transaction", transactions, raw };
        }
      }
    } catch {
      // Not valid JSON, continue to other types
    }
  }

  // Try to detect summary request
  const summaryKeywords = ["ringkasan", "total", "berapa", "pengeluaran", "pemasukan", "saldo", "minggu ini", "bulan ini", "hari ini"];
  const isSummaryRequest = summaryKeywords.some((keyword) => text.toLowerCase().includes(keyword));

  if (isSummaryRequest) {
    // Calculate summary from recent transactions
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let periodTransactions = recentTransactions;
    let periodType: "daily" | "weekly" | "monthly" = "weekly";
    let periodLabel = "Minggu ini";

    if (text.toLowerCase().includes("hari ini")) {
      const today = now.toISOString().split("T")[0];
      periodTransactions = recentTransactions.filter((tx) => tx.date === today);
      periodType = "daily";
      periodLabel = "Hari ini";
    } else if (text.toLowerCase().includes("bulan ini")) {
      const monthPrefix = now.toISOString().slice(0, 7);
      periodTransactions = recentTransactions.filter((tx) => tx.date.startsWith(monthPrefix));
      periodType = "monthly";
      periodLabel = "Bulan ini";
    } else {
      periodTransactions = recentTransactions.filter((tx) => new Date(tx.date) >= weekAgo);
    }

    const income = periodTransactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
    const expense = periodTransactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);

    return {
      type: "summary",
      summaryData: {
        type: periodType,
        period: periodLabel,
        income,
        expense,
        net: income - expense,
      },
      text: raw,
      raw,
    };
  }

  // Default to text response
  return { type: "text", text: raw, raw };
}
