import type { Debt } from "../types/index.ts";

export type AttentionItem = {
  kind: "bill" | "budget" | "debt";
  key: string;
  title: string;
  detail: string;
  amount?: number;
  percent?: number;
  href: string;
};

const DAY_MS = 86_400_000;
const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const daysUntil = (today: string, date: string) => Math.round((toUtc(date) - toUtc(today)) / DAY_MS);
const dueText = (days: number) => (days <= 0 ? "Jatuh tempo hari ini" : `Jatuh tempo ${days} hari lagi`);

export function getAttentionItems(
  input: {
    today: string;
    bills: { id: number; name: string; amount: number; nextDate: string }[];
    budgets: { categoryId: number; name: string; used: number; limit: number }[];
    debts: Debt[];
  },
  max = 3,
): AttentionItem[] {
  const { today } = input;

  const debts: AttentionItem[] = input.debts
    .filter((d) => !d.isSettled && d.dueDate && daysUntil(today, d.dueDate) <= 7)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .map((d) => {
      const days = daysUntil(today, d.dueDate!);
      return {
        kind: "debt",
        key: `debt-${d.id}`,
        title: d.name,
        detail: days < 0 ? "Lewat jatuh tempo" : dueText(days),
        amount: d.remaining,
        href: "/debts",
      };
    });

  const bills: AttentionItem[] = input.bills
    .filter((b) => {
      const days = daysUntil(today, b.nextDate);
      return days >= 0 && days <= 7;
    })
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .map((b) => ({
      kind: "bill",
      key: `bill-${b.id}`,
      title: b.name,
      detail: dueText(daysUntil(today, b.nextDate)),
      amount: b.amount,
      href: "/transactions?tab=recurring",
    }));

  const budgets: AttentionItem[] = input.budgets
    .filter((b) => b.limit > 0 && b.used / b.limit >= 0.8)
    .map((b) => ({ b, percent: Math.round((b.used / b.limit) * 100) }))
    .sort((x, y) => y.percent - x.percent)
    .map(({ b, percent }) => ({
      kind: "budget",
      key: `budget-${b.categoryId}`,
      title: `Anggaran ${b.name}`,
      detail: `${percent}% terpakai`,
      percent,
      href: "/reports#anggaran",
    }));

  return [...debts, ...bills, ...budgets].slice(0, max);
}
