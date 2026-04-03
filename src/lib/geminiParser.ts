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
