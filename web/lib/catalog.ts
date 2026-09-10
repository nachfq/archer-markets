import type { Deployment, Token } from "./config.ts";

export type AssetPresentation = { name: string; kind: "stock" | "stablecoin"; logo?: string };
export type CatalogEntry = { marketId: string; visible: boolean; underlying: AssetPresentation; quote: AssetPresentation };

// Owner-curated order and presentation only. Addresses and deployment validity stay in the manifests.
export const marketCatalog: Record<number, CatalogEntry[]> = {
  31337: [
    { marketId: "primary", visible: true, underlying: { name: "Mock Stock", kind: "stock" }, quote: { name: "Mock US Dollar", kind: "stablecoin" } },
    { marketId: "practice", visible: true, underlying: { name: "Practice Stock", kind: "stock" }, quote: { name: "Mock US Dollar", kind: "stablecoin" } },
  ],
  46630: [
    { marketId: "primary", visible: true, underlying: { name: "Tesla Stock Token", kind: "stock" }, quote: { name: "Mock US Dollar", kind: "stablecoin" } },
  ],
};

export function curatedMarkets(records: Deployment[], entries: CatalogEntry[]): Deployment[] {
  return entries.filter(entry => entry.visible).flatMap(entry => {
    const record = records.find(record => record.marketId === entry.marketId);
    return record ? [record] : [];
  });
}
export function assetPresentation(market: Deployment, role: "underlying" | "quote"): AssetPresentation {
  return marketCatalog[market.chainId]?.find(entry => entry.marketId === market.marketId)?.[role]
    ?? { name: market[role].symbol, kind: role === "underlying" ? "stock" : "stablecoin" };
}
export function catalogAssets(markets: Deployment[]): Array<{ key: string; token: Token; presentation: AssetPresentation }> {
  const assets = new Map<string, { key: string; token: Token; presentation: AssetPresentation }>();
  for (const market of markets) for (const role of ["underlying", "quote"] as const) {
    const token = market[role];
    // Unknown addresses are not evidence that two tokens are the same asset.
    const key = `${market.chainId}:${token.address?.toLowerCase() ?? `${market.marketId}:${role}:unconfigured`}`;
    if (!assets.has(key)) assets.set(key, { key, token, presentation: assetPresentation(market, role) });
  }
  return [...assets.values()];
}
