import test from "node:test";
import assert from "node:assert/strict";
import { getNetWorth } from "../src/lib/netWorth.ts";
import type { Account, AccountType, Debt, DebtType } from "../src/types/index.ts";

const acc = (name: string, type: AccountType, currentBalance: number, isArchived = false, id = 1): Account => ({
  id,
  name,
  type,
  color: "#000000",
  icon: "wallet",
  initialBalance: 0,
  currentBalance,
  isArchived,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

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

test("net worth skips archived accounts and credit-card owe debts", () => {
  const r = getNetWorth(
    [acc("BCA", "bank", 1000, false, 1), acc("Lama", "bank", 500, true, 2), acc("CC", "credit", -200, false, 9)],
    { totalValue: 300, unpricedAssetCount: 0 },
    [debt("owe", 200, 9), debt("owe", 100), debt("owed", 50)],
  );
  assert.deepEqual(r, { cash: 800, investments: 300, debtNet: -50, total: 1050, unpricedAssetCount: 0 });
});

test("net worth ignores settled debts", () => {
  const r = getNetWorth(
    [acc("BCA", "bank", 1000)],
    { totalValue: 0, unpricedAssetCount: 2 },
    [debt("owe", 100, undefined, undefined, true), debt("owed", 50, undefined, undefined, true)],
  );
  assert.deepEqual(r, { cash: 1000, investments: 0, debtNet: 0, total: 1000, unpricedAssetCount: 2 });
});

test("net worth subtracts owe debt on an archived credit account", () => {
  const r = getNetWorth(
    [acc("CC", "credit", -200, true, 9)],
    { totalValue: 0, unpricedAssetCount: 0 },
    [debt("owe", 200, 9)],
  );
  assert.deepEqual(r, { cash: 0, investments: 0, debtNet: -200, total: -200, unpricedAssetCount: 0 });
});

test("net worth subtracts owe debt on an active non-credit account", () => {
  const r = getNetWorth(
    [acc("BCA", "bank", 1000, false, 1)],
    { totalValue: 0, unpricedAssetCount: 0 },
    [debt("owe", 100, 1)],
  );
  assert.deepEqual(r, { cash: 1000, investments: 0, debtNet: -100, total: 900, unpricedAssetCount: 0 });
});
