import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { createPublicClient, defineChain, type Address } from "viem";
import type { MarketConfig } from "@stock-options-lab/sdk";
import records from "./generated/deployments.json";
import { curatedMarkets, marketCatalog } from "./catalog";
export type Token = {
  address: Address | null;
  symbol: string;
  decimals: number;
  isMock: boolean;
};
export type Deployment = {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  factory: Address | null;
  deploymentBlock: string | null;
  marketId?: string;
  label?: string;
  sandbox?: boolean;
  version?: 1 | 2 | 3;
  legacy?: boolean;
  markets?: Array<Pick<Deployment, "marketId" | "label" | "sandbox" | "factory" | "deploymentBlock" | "underlying" | "quote" | "version" | "legacy">>;
  underlying: Token;
  quote: Token;
};
const requested = String(import.meta.env.VITE_CHAIN_ID ?? "46630");
export const deployment = (records as Record<string, Deployment>)[requested];
if (!deployment) throw new Error(`Network not configured: ${requested}`);
export const chain = defineChain({
  id: deployment.chainId,
  name: deployment.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [deployment.rpcUrl] } },
  ...(deployment.explorerUrl
    ? {
        blockExplorers: {
          default: { name: "Explorer", url: deployment.explorerUrl },
        },
      }
    : {}),
  testnet: true,
});
export const config = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http() },
  ssr: true,
});
export const client = createPublicClient({
  chain,
  transport: http(deployment.rpcUrl, { retryCount: 1, batch: { batchSize: 64, wait: 5 } }),
  batch: { multicall: false },
});
export const ready = !!(
  deployment.factory &&
  deployment.underlying.address &&
  deployment.quote.address
);

const manifestMarkets: Deployment[] = [deployment, ...(deployment.markets ?? []).map(m => ({ ...deployment, ...m, markets: undefined }))].map((m, i) => ({ ...m, marketId: m.marketId ?? (i === 0 ? "primary" : `market-${i}`), label: m.label ?? `${m.underlying.symbol} / ${m.quote.symbol}`, sandbox: m.sandbox ?? m.underlying.isMock }));
export const marketRecords = curatedMarkets(manifestMarkets, marketCatalog[deployment.chainId] ?? []);
export const tradeMarkets = marketRecords.filter(m => !m.legacy);
export function asMarket(record: Deployment): MarketConfig | null {
  if (!record.factory || !record.underlying.address || !record.quote.address || record.deploymentBlock === null) return null;
  return { id: record.marketId ?? "primary", chainId: record.chainId, factory: record.factory, deploymentBlock: BigInt(record.deploymentBlock), version: record.version ?? 1, sandbox: record.sandbox ?? record.underlying.isMock,
    underlying: { ...record.underlying, address: record.underlying.address, adapter: record.underlying.isMock ? "erc20" : "robinhood" },
    quote: { ...record.quote, address: record.quote.address, adapter: "erc20" } };
}
export const configuredMarkets = marketRecords.map(asMarket).filter((m): m is MarketConfig => !!m);
