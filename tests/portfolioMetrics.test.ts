import test from "node:test";
import assert from "node:assert/strict";
import { getPortfolioMetrics, getSyncablePortfolioAssets } from "../src/lib/portfolioMetrics.ts";
import type { Asset } from "../src/types/index.ts";

const asset = (symbol: string, quantity: number, avgBuyPrice: number, manualPriceIdr?: number): Asset => ({
  symbol,
  name: symbol,
  type: "crypto",
  quantity,
  avgBuyPrice,
  manualPriceIdr,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

test("keeps cost basis complete and hides portfolio gain when an asset is unpriced", () => {
  const metrics = getPortfolioMetrics(
    [asset("BTC", 2, 100), asset("ETH", 1, 50)],
    { BTC: { symbol: "BTC", priceIdr: 125, changePercent24h: 0, lastSynced: "2026-01-01" } },
  );

  assert.equal(metrics.totalValue, 250);
  assert.equal(metrics.totalCost, 250);
  assert.equal(metrics.totalGain, null);
  assert.equal(metrics.unpricedAssetCount, 1);
});

test("uses manual prices and calculates gain when all assets have a value", () => {
  const metrics = getPortfolioMetrics([asset("MF", 3, 10, 10)], {});
  assert.equal(metrics.totalValue, 30);
  assert.equal(metrics.totalCost, 30);
  assert.equal(metrics.totalGain, 0);
  assert.equal(metrics.totalGainPct, 0);
});

test("keeps local deposito calculations in sync and excludes manual mutual funds", () => {
  const assets = [
    { ...asset("DEP", 1, 100), type: "deposito" as const },
    { ...asset("NAV", 1, 100, 100), type: "mutual_fund" as const },
  ];
  assert.deepEqual(getSyncablePortfolioAssets(assets).map(({ symbol }) => symbol), ["DEP"]);
});
