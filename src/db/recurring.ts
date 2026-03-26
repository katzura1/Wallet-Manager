import { db } from "./db";
import { addTransaction } from "./transactions";
import { todayISO } from "@/lib/utils";
import type { RecurringTransaction, RecurringInterval } from "@/types";

function advanceDate(dateStr: string, interval: RecurringInterval): string {
  const d = new Date(dateStr + "T00:00:00");
  switch (interval) {
    case "daily":   d.setDate(d.getDate() + 1); break;
    case "weekly":  d.setDate(d.getDate() + 7); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "yearly":  d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().split("T")[0];
}

export type RecurringDueTone = "overdue" | "today" | "soon" | "upcoming";

export function getRecurringDueInfo(date: string, referenceDate = todayISO()): {
  diffDays: number;
  label: string;
  tone: RecurringDueTone;
} {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date(`${referenceDate}T00:00:00`);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return {
      diffDays,
      label: `${Math.abs(diffDays)} hari lewat`,
      tone: "overdue",
    };
  }
  if (diffDays === 0) {
    return {
      diffDays,
      label: "Hari ini",
      tone: "today",
    };
  }
  if (diffDays === 1) {
    return {
      diffDays,
      label: "Besok",
      tone: "soon",
    };
  }

  return {
    diffDays,
    label: `${diffDays} hari lagi`,
    tone: "upcoming",
  };
}

export function getNextRecurringDates(startDate: string, interval: RecurringInterval, count = 3): string[] {
  const dates: string[] = [];
  let cursor = startDate;
  for (let i = 0; i < count; i += 1) {
    dates.push(cursor);
    cursor = advanceDate(cursor, interval);
  }
  return dates;
}

export async function getRecurringTransactions(): Promise<RecurringTransaction[]> {
  return db.recurring.orderBy("nextDate").toArray();
}

// get all recurring where nextDate is next 7 days
export async function getUpcomingRecurringTransactions(): Promise<RecurringTransaction[]> {
  const today = todayISO();
  const nextWeek = advanceDate(today, "weekly");
  return db.recurring
    .where("nextDate").between(today, nextWeek, true, true)
    .toArray();
}

export async function addRecurring(data: Omit<RecurringTransaction, "id" | "createdAt">): Promise<void> {
  await db.recurring.add({ ...data, createdAt: new Date().toISOString() });
}

export async function updateRecurring(id: number, data: Partial<Omit<RecurringTransaction, "id">>): Promise<void> {
  await db.recurring.update(id, data);
}

export async function deleteRecurring(id: number): Promise<void> {
  await db.recurring.delete(id);
}

export async function skipNextRecurring(id: number): Promise<void> {
  const recurring = await db.recurring.get(id);
  if (!recurring) return;
  await db.recurring.update(id, { nextDate: advanceDate(recurring.nextDate, recurring.interval) });
}

export async function runRecurringNow(id: number): Promise<void> {
  const recurring = await db.recurring.get(id);
  if (!recurring) return;

  const runDate = todayISO();
  await addTransaction({
    type: recurring.type,
    amount: recurring.amount,
    accountId: recurring.accountId,
    categoryId: recurring.categoryId,
    date: runDate,
    note: recurring.note,
  });

  await db.recurring.update(id, { nextDate: advanceDate(runDate, recurring.interval) });
}

/** Called on app startup: generates all overdue recurring transactions. */
export async function processRecurringTransactions(): Promise<number> {
  const today = todayISO();
  const all = await db.recurring.toArray();
  const due = all.filter((r) => r.isActive && r.nextDate <= today);

  for (const rec of due) {
    let nextDate = rec.nextDate;
    while (nextDate <= today) {
      await addTransaction({
        type: rec.type,
        amount: rec.amount,
        accountId: rec.accountId,
        categoryId: rec.categoryId,
        date: nextDate,
        note: rec.note,
      });
      nextDate = advanceDate(nextDate, rec.interval);
    }
    await db.recurring.update(rec.id!, { nextDate });
  }
  return due.length;
}
