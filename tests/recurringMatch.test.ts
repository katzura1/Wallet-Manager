import test from "node:test";
import assert from "node:assert/strict";
import { matchesExistingRecurring } from "../src/lib/recurringMatch.ts";
import type { RecurringTransaction } from "../src/types/index.ts";

const base: RecurringTransaction = {
  type: "expense",
  amount: 450000,
  accountId: 1,
  categoryId: 4,
  note: "Listrik PLN",
  interval: "monthly",
  startDate: "2026-10-01",
  nextDate: "2026-12-01",
  isActive: true,
  createdAt: "2026-10-01T00:00:00Z",
};

const candidate = { type: "expense" as const, accountId: 1, categoryId: 4, note: "Listrik PLN", amount: 450000 };

test("same note matches even when account, interval or amount differ", () => {
  assert.equal(matchesExistingRecurring(base, { ...candidate, accountId: 2, amount: 900000 }), true);
  assert.equal(matchesExistingRecurring({ ...base, interval: "weekly" }, candidate), true);
});

test("note match ignores case, spacing and digits", () => {
  assert.equal(matchesExistingRecurring(base, { ...candidate, note: "  listrik  pln 11/2026 " }), true);
});

test("note contained in the other matches", () => {
  assert.equal(matchesExistingRecurring({ ...base, note: "Netflix" }, { ...candidate, categoryId: 9, note: "Netflix premium" }), true);
});

test("same category with similar amount matches when notes differ", () => {
  assert.equal(matchesExistingRecurring(base, { ...candidate, note: "Token listrik", amount: 470000, accountId: 3 }), true);
});

test("same category but clearly different amount and note does not match", () => {
  assert.equal(matchesExistingRecurring(base, { ...candidate, note: "Internet", amount: 300000 }), false);
});

test("different type never matches", () => {
  assert.equal(matchesExistingRecurring(base, { ...candidate, type: "income" }), false);
});

test("inactive schedules still count as existing", () => {
  assert.equal(matchesExistingRecurring({ ...base, isActive: false }, candidate), true);
});
