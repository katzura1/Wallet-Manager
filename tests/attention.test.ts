import test from "node:test";
import assert from "node:assert/strict";
import { getAttentionItems } from "../src/lib/attention.ts";
import type { Debt, DebtType } from "../src/types/index.ts";

const debt = (type: DebtType, remaining: number, accountId?: number, dueDate?: string, isSettled = false, id = 1): Debt => ({
  id,
  name: "Debt",
  type,
  amount: remaining,
  remaining,
  dueDate,
  note: "",
  accountId,
  isSettled,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});
const bill = (name: string, amount: number, nextDate: string, id = 1) => ({ id, name, amount, nextDate });
const budget = (name: string, used: number, limit: number, categoryId = 1) => ({ categoryId, name, used, limit });

test("attention: bills within 7 days, budgets >= 80%, debts due within 7 days or overdue", () => {
  const items = getAttentionItems(
    {
      today: "2026-11-21",
      bills: [bill("PLN", 450000, "2026-11-24"), bill("Netflix", 54000, "2026-12-05", 2)],
      budgets: [budget("Makan", 1770000, 2050000), budget("Transport", 600000, 1200000, 2)],
      debts: [debt("owe", 800000, undefined, "2026-11-20")],
    },
    3,
  );
  assert.deepEqual(items.map((i) => i.key), ["debt-1", "bill-1", "budget-1"]);
});

test("attention ignores settled debts and debts without due date", () => {
  const items = getAttentionItems({
    today: "2026-11-21",
    bills: [],
    budgets: [],
    debts: [debt("owe", 100, undefined, "2026-11-20", true), debt("owe", 100, undefined, undefined, false, 2)],
  });
  assert.deepEqual(items, []);
});

test("attention returns [] when nothing qualifies", () => {
  const items = getAttentionItems({
    today: "2026-11-21",
    bills: [bill("Netflix", 54000, "2026-11-29")],
    budgets: [budget("Transport", 600000, 1200000), budget("Zero", 5, 0, 2)],
    debts: [debt("owe", 100, undefined, "2026-11-29")],
  });
  assert.deepEqual(items, []);
});

test("attention caps at max, includes 7-day boundary, sorts debts by date and budgets by percent", () => {
  const items = getAttentionItems(
    {
      today: "2026-11-21",
      bills: [bill("B", 1, "2026-11-28")],
      budgets: [budget("A", 80, 100, 1), budget("C", 95, 100, 2)],
      debts: [debt("owed", 1, undefined, "2026-11-25", false, 1), debt("owe", 1, undefined, "2026-11-22", false, 2)],
    },
    10,
  );
  assert.deepEqual(items.map((i) => i.key), ["debt-2", "debt-1", "bill-1", "budget-2", "budget-1"]);
  assert.equal(getAttentionItems({ today: "2026-11-21", bills: [], budgets: [budget("A", 80, 100)], debts: [] }, 0).length, 0);
});
