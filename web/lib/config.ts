import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { createPublicClient, defineChain, type Address } from "viem";
import records from "./generated/deployments.json";
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
  transport: http(deployment.rpcUrl, { retryCount: 1 }),
  batch: { multicall: false },
});
export const ready = !!(
  deployment.factory &&
  deployment.underlying.address &&
  deployment.quote.address
);
