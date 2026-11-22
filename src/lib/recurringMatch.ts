import type { RecurringTransaction } from "../types/index.ts";

export interface RecurringCandidate {
  type: "income" | "expense";
  accountId: number;
  categoryId?: number;
  note: string;
  amount: number;
}

/** Lowercase, collapse spaces, drop digits (dates, invoice numbers). */
export function normalizeRecurringNote(note: string): string {
  return note.toLowerCase().replace(/[0-9]+/g, "").replace(/\s+/g, " ").trim();
}

export function recurringAmountTolerance(amount: number): number {
  return Math.max(5000, amount * 0.15);
}

function notesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.includes(short);
}

/**
 * True when an existing schedule (active or paused) already covers the
 * detected pattern. Account and interval are ignored on purpose: a user often
 * schedules the same bill from another account or with a different cadence.
 */
export function matchesExistingRecurring(item: RecurringTransaction, candidate: RecurringCandidate): boolean {
  if (item.type !== candidate.type) return false;

  if (notesMatch(normalizeRecurringNote(item.note), normalizeRecurringNote(candidate.note))) return true;

  const sameCategory = (item.categoryId ?? 0) !== 0 && item.categoryId === candidate.categoryId;
  return sameCategory && Math.abs(item.amount - candidate.amount) <= recurringAmountTolerance(candidate.amount);
}
