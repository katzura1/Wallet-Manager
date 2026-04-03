import { GoogleGenerativeAI } from "@google/generative-ai";
import { formatCompactCurrency } from "@/lib/utils";
import { assertAIRequestAllowed, isAIOnline } from "@/lib/aiGuard";

interface InsightCategoryFact {
  name: string;
  value: number;
  icon: string;
}

interface InsightBudgetFact {
  overBudgetCount: number;
  nearLimitCount: number;
  trackedCategoryCount: number;
  unusedBudgetCount: number;
}

export interface MonthlyInsightInput {
  monthLabel: string;
  currency: string;
  summary: {
    income: number;
    expense: number;
    net: number;
  };
  previousSummary: {
    income: number;
    expense: number;
    net: number;
  } | null;
  topCategories: InsightCategoryFact[];
  budget: InsightBudgetFact;
}

export interface MonthlyInsightResult {
  headline: string;
  summary: string;
  highlights: string[];
  source: "ai" | "local";
  note: string;
}

interface AIInsightPayload {
  headline?: string;
  summary?: string;
  highlights?: string[];
}

const insightResultCache = new Map<string, MonthlyInsightResult>();
const insightInFlightCache = new Map<string, Promise<MonthlyInsightResult>>();

function getChangeText(current: number, previous: number, currency: string) {
  if (previous === 0) {
    if (current === 0) return "stabil dari bulan lalu";
    return `mulai muncul ${formatCompactCurrency(current, currency)}`;
  }

  const diff = current - previous;
  if (diff === 0) return "stabil dari bulan lalu";

  const pct = Math.round((Math.abs(diff) / Math.abs(previous)) * 100);
  return `${diff > 0 ? "naik" : "turun"} ${pct}% (${formatCompactCurrency(Math.abs(diff), currency)})`;
}

function normalizeAIAmounts(text: string, currency: string) {
  if (currency !== "IDR") return text;

  return text.replace(/Rp\s?([\d.]+(?:,\d+)?)/gi, (_, rawValue: string) => {
    const normalized = Number(rawValue.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(normalized)) return `Rp${rawValue}`;
    return formatCompactCurrency(normalized, currency);
  });
}

function cleanInsightText(text: string, currency: string) {
  return normalizeAIAmounts(text, currency).replace(/\s+/g, " ").trim();
}

function buildLocalInsight(input: MonthlyInsightInput, note: string): MonthlyInsightResult {
  const { summary, previousSummary, topCategories, budget, monthLabel, currency } = input;
  const topCategory = topCategories[0] ?? null;
  const surplus = summary.net >= 0;
  const topCategoryShare = topCategory && summary.expense > 0
    ? Math.round((topCategory.value / summary.expense) * 100)
    : 0;

  if (summary.income === 0 && summary.expense === 0) {
    return {
      headline: `Belum ada aktivitas di ${monthLabel}`,
      summary: "Belum ada transaksi yang cukup untuk diringkas. Begitu mulai mencatat, insight bulanannya akan langsung terisi.",
      highlights: [
        "Belum ada pemasukan maupun pengeluaran yang tercatat.",
        "Semakin rutin input transaksi, semakin tajam insight yang muncul.",
      ],
      source: "local",
      note,
    };
  }

  const comparisonSentence = previousSummary
    ? `Dibanding bulan lalu, pemasukan ${getChangeText(summary.income, previousSummary.income, currency)} dan pengeluaran ${getChangeText(summary.expense, previousSummary.expense, currency)}.`
    : "Belum ada data pembanding bulan lalu, jadi insight fokus pada kondisi bulan ini.";

  const highlights = [
    topCategory
      ? `${topCategory.icon} ${topCategory.name} paling dominan: ${formatCompactCurrency(topCategory.value, currency)} atau ${topCategoryShare}% dari pengeluaran.`
      : "Belum ada kategori dominan yang menonjol bulan ini.",
    budget.overBudgetCount > 0
      ? `${budget.overBudgetCount} budget sudah lewat limit. ${budget.nearLimitCount} kategori lain juga mulai ketat.`
      : budget.nearLimitCount > 0
        ? `${budget.nearLimitCount} kategori sudah mendekati limit, tapi belum ada yang benar-benar over budget.`
        : budget.trackedCategoryCount > 0
          ? `Budget masih aman. ${budget.unusedBudgetCount} kategori budget bahkan belum terpakai.`
          : "Belum ada budget aktif yang dipantau bulan ini.",
  ];

  if (previousSummary) {
    highlights.push(
      `Cashflow bersih ${surplus ? "masih surplus" : "sedang defisit"} ${formatCompactCurrency(Math.abs(summary.net), currency)} dan ${summary.net >= previousSummary.net ? "lebih baik" : "lebih lemah"} dari bulan lalu.`,
    );
  }

  return {
    headline: budget.overBudgetCount > 0
      ? `${budget.overBudgetCount} budget sudah lewat limit`
      : surplus
        ? `Cashflow ${monthLabel} masih positif`
        : `Cashflow ${monthLabel} sedang tertekan`,
    summary: `${monthLabel}: uang masuk ${formatCompactCurrency(summary.income, currency)}, keluar ${formatCompactCurrency(summary.expense, currency)}, jadi ${surplus ? "surplus" : "defisit"} ${formatCompactCurrency(Math.abs(summary.net), currency)}. ${comparisonSentence}`,
    highlights,
    source: "local",
    note,
  };
}

function buildPrompt(input: MonthlyInsightInput) {
  return `Kamu adalah asisten keuangan pribadi. Tugasmu membuat insight bulanan singkat dalam bahasa Indonesia berdasarkan data numerik yang SUDAH dihitung aplikasi.

Aturan:
1. Gunakan hanya fakta yang diberikan. Jangan mengarang angka, kategori, atau rekomendasi yang tidak didukung data.
2. Tulis ringkas, jelas, dan actionable.
2a. Pakai format nominal ringkas seperti 2,5jt, 850rb, 12M. Jangan tulis Rp2.500.000.
2b. Fokus pada apa yang berubah, kategori terbesar, dan risiko budget bila ada.
3. Return HANYA JSON object valid dengan shape:
{
  "headline": "string pendek max 70 karakter",
  "summary": "1-2 kalimat singkat max 220 karakter",
  "highlights": ["bullet 1", "bullet 2", "bullet 3"]
}
4. Maksimal 3 highlights. Setiap highlight satu kalimat pendek.
5. Jangan gunakan markdown.

Data laporan:
${JSON.stringify(input, null, 2)}`;
}

function parseAIInsight(raw: string): AIInsightPayload {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI insight tidak valid");
  }

  const parsed = JSON.parse(jsonMatch[0]) as AIInsightPayload;
  return parsed;
}

export async function generateMonthlyInsight(input: MonthlyInsightInput): Promise<MonthlyInsightResult> {
  const apiKey = localStorage.getItem("gemini_api_key")?.trim() ?? "";
  const modelName = localStorage.getItem("gemini_model")?.trim() || "gemini-2.5-flash";
  const requestKey = JSON.stringify({
    input,
    hasApiKey: Boolean(apiKey),
    modelName,
    online: navigator.onLine,
  });

  const cachedResult = insightResultCache.get(requestKey);
  if (cachedResult) {
    return cachedResult;
  }

  const inFlight = insightInFlightCache.get(requestKey);
  if (inFlight) {
    return inFlight;
  }

  const task = (async () => {
    let result: MonthlyInsightResult;

    if (!apiKey) {
      result = buildLocalInsight(input, "Mode lokal: tambahkan Gemini API key untuk narasi AI.");
      insightResultCache.set(requestKey, result);
      return result;
    }

    if (!isAIOnline()) {
      result = buildLocalInsight(input, "Mode lokal: perangkat sedang offline.");
      insightResultCache.set(requestKey, result);
      return result;
    }

    try {
      assertAIRequestAllowed("ai-monthly-insight", 3000);
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });
      const response = await model.generateContent(buildPrompt(input));
      const payload = parseAIInsight(response.response.text().trim());
      const localInsight = buildLocalInsight(input, "Narasi AI dibuat dari agregat laporan lokal.");

      result = {
        headline: cleanInsightText((payload.headline ?? localInsight.headline).trim() || localInsight.headline, input.currency),
        summary: cleanInsightText((payload.summary ?? localInsight.summary).trim() || localInsight.summary, input.currency),
        highlights: Array.isArray(payload.highlights)
          ? (() => {
              const items = payload.highlights
                .map((item) => cleanInsightText(String(item), input.currency))
                .filter(Boolean)
                .slice(0, 3);
              return items.length > 0 ? items : localInsight.highlights;
            })()
          : localInsight.highlights,
        source: "ai",
        note: "Narasi AI dibuat dari agregat laporan lokal.",
      };
    } catch {
      result = buildLocalInsight(input, "Mode lokal: AI tidak tersedia, insight tetap dibuat dari data perangkat.");
    }

    insightResultCache.set(requestKey, result);
    return result;
  })();

  insightInFlightCache.set(requestKey, task);
  try {
    return await task;
  } finally {
    insightInFlightCache.delete(requestKey);
  }
}