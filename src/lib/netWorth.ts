import type { Account, Debt } from "../types/index.ts";

export function getNetWorth(
  accounts: Account[],
  portfolio: { totalValue: number; unpricedAssetCount: number },
  debts: Debt[],
): { cash: number; investments: number; debtNet: number; total: number; unpricedAssetCount: number } {
  const active = accounts.filter((a) => !a.isArchived);
  const cash = active.reduce((sum, a) => sum + a.currentBalance, 0);
  const creditIds = new Set(active.filter((a) => a.type === "credit").map((a) => a.id));
  let debtNet = 0;
  for (const d of debts) {
    if (d.isSettled) continue;
    if (d.type === "owed") debtNet += d.remaining;
    else if (d.accountId === undefined || !creditIds.has(d.accountId)) debtNet -= d.remaining;
  }
  const investments = portfolio.totalValue;
  return { cash, investments, debtNet, total: cash + investments + debtNet, unpricedAssetCount: portfolio.unpricedAssetCount };
}
