import { db } from "@/db/db";
import type { RecurringInterval, RecurringTransaction, Transaction } from "@/types";

const DETECTION_INTERVALS: Array<{
  interval: RecurringInterval;
  expectedDays: number;
  tolerance: number;
  maxStalenessDays: number;
}> = [
  { interval: "daily", expectedDays: 1, tolerance: 0, maxStalenessDays: 7 },
  { interval: "weekly", expectedDays: 7, tolerance: 1, maxStalenessDays: 21 },
  { interval: "monthly", expectedDays: 30, tolerance: 4, maxStalenessDays: 75 },
  { interval: "yearly", expectedDays: 365, tolerance: 10, maxStalenessDays: 400 },
];

export interface RecurringDetectionSuggestion {
  key: string;
  type: "income" | "expense";
  accountId: number;
  categoryId?: number;
  note: string;
  amount: number;
  interval: RecurringInterval;
  nextDate: string;
  lastDate: string;
  occurrences: number;
  averageAmount: number;
  confidence: "medium" | "high";
}

function normalizeNote(note: string) {
  return note
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[0-9]+/g, "")
    .trim();
}

function toDay(date: string) {
  return new Date(`${date}T00:00:00`);
}

function toDateKey(date: Date) {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addInterval(date: string, interval: RecurringInterval) {
  const next = toDay(date);
  if (interval === "daily") next.setDate(next.getDate() + 1);
  if (interval === "weekly") next.setDate(next.getDate() + 7);
  if (interval === "monthly") next.setMonth(next.getMonth() + 1);
  if (interval === "yearly") next.setFullYear(next.getFullYear() + 1);
  return toDateKey(next);
}

function dayDiff(from: string, to: string) {
  return Math.round((toDay(to).getTime() - toDay(from).getTime()) / 86400000);
}

function calculateMedian(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function amountTolerance(amount: number) {
  return Math.max(5000, amount * 0.15);
}

function hasSimilarRecurring(recurringItems: RecurringTransaction[], tx: Transaction, interval: RecurringInterval, normalizedNote: string, amount: number) {
  return recurringItems.some((item) => {
    if (item.type !== tx.type) return false;
    if (item.accountId !== tx.accountId) return false;
    if ((item.categoryId ?? 0) !== (tx.categoryId ?? 0)) return false;
    if (item.interval !== interval) return false;

    const recurringNote = normalizeNote(item.note);
    if (normalizedNote && recurringNote && recurringNote !== normalizedNote) {
      return false;
    }

    return Math.abs(item.amount - amount) <= amountTolerance(amount);
  });
}

export async function getRecurringDetectionSuggestions(limit = 3, referenceDate = new Date()): Promise<RecurringDetectionSuggestion[]> {
  const referenceKey = toDateKey(referenceDate);
  const lookbackFrom = toDateKey(addDays(referenceDate, -400));
  const [transactions, recurringItems] = await Promise.all([
    db.transactions
      .where("date")
      .between(lookbackFrom, referenceKey, true, true)
      .filter((tx) => tx.type === "income" || tx.type === "expense")
      .toArray(),
    db.recurring.toArray(),
  ]);

  const groups = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    const normalizedNote = normalizeNote(tx.note);
    if (!normalizedNote && !tx.categoryId) continue;

    const key = [
      tx.type,
      tx.accountId,
      tx.categoryId ?? 0,
      normalizedNote || "__blank__",
    ].join("|");

    const items = groups.get(key) ?? [];
    items.push(tx);
    groups.set(key, items);
  }

  const suggestions: RecurringDetectionSuggestion[] = [];

  for (const [key, group] of groups) {
    if (group.length < 3) continue;

    const ordered = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const last = ordered[ordered.length - 1];
    if (!last.id) continue;
    if (last.type !== "income" && last.type !== "expense") continue;

    const intervals = ordered.slice(1).map((item, index) => dayDiff(ordered[index].date, item.date));
    if (intervals.length < 2) continue;

    const amounts = ordered.map((item) => item.amount);
    const medianAmount = calculateMedian(amounts);
    const consistentAmounts = ordered.filter((item) => Math.abs(item.amount - medianAmount) <= amountTolerance(medianAmount));
    if (consistentAmounts.length < 3) continue;

    const normalizedNote = normalizeNote(last.note);
    const matchedInterval = DETECTION_INTERVALS
      .map((rule) => ({
        ...rule,
        matches: intervals.filter((value) => Math.abs(value - rule.expectedDays) <= rule.tolerance).length,
      }))
      .filter((rule) => rule.matches >= 2)
      .sort((a, b) => b.matches - a.matches)[0];

    if (!matchedInterval) continue;

    const matchRatio = matchedInterval.matches / intervals.length;
    if (matchRatio < 0.6) continue;

    const daysSinceLast = dayDiff(last.date, referenceKey);
    if (daysSinceLast > matchedInterval.maxStalenessDays) continue;

    const averageAmount = amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
    if (hasSimilarRecurring(recurringItems, last, matchedInterval.interval, normalizedNote, averageAmount)) {
      continue;
    }

    suggestions.push({
      key,
      type: last.type,
      accountId: last.accountId,
      categoryId: last.categoryId,
      note: last.note,
      amount: Math.round(averageAmount),
      interval: matchedInterval.interval,
      nextDate: addInterval(last.date, matchedInterval.interval),
      lastDate: last.date,
      occurrences: ordered.length,
      averageAmount,
      confidence: matchRatio >= 0.8 || ordered.length >= 4 ? "high" : "medium",
    });
  }

  return suggestions
    .sort((a, b) => {
      if (a.confidence !== b.confidence) {
        return a.confidence === "high" ? -1 : 1;
      }
      if (b.occurrences !== a.occurrences) {
        return b.occurrences - a.occurrences;
      }
      return a.nextDate.localeCompare(b.nextDate);
    })
    .slice(0, limit);
}
