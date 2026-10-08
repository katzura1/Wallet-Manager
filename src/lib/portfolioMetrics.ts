import type { Asset, AssetPrice } from "@/types";

export function getSyncablePortfolioAssets(assets: Asset[]): Asset[] {
  return assets.filter((asset) => asset.type !== "mutual_fund");
}

export function getPortfolioMetrics(assets: Asset[], prices: Record<string, AssetPrice>) {
  const priced = assets.flatMap((asset) => {
    const price = prices[asset.symbol]?.priceIdr ?? asset.manualPriceIdr;
    return price === undefined ? [] : [{ asset, value: asset.quantity * price }];
  });
  const totalValue = priced.reduce((sum, item) => sum + item.value, 0);
  const totalCost = assets.reduce((sum, asset) => sum + asset.quantity * asset.avgBuyPrice, 0);
  const hasMissingPrices = priced.length < assets.length;
  const totalGain = hasMissingPrices ? null : totalValue - totalCost;

  return {
    totalValue,
    totalCost,
    totalGain,
    totalGainPct: totalGain !== null && totalCost > 0 ? (totalGain / totalCost) * 100 : null,
    hasMissingPrices,
    unpricedAssetCount: assets.length - priced.length,
    priced,
  };
}
