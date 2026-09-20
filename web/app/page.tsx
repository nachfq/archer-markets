import type { Metadata } from "next";
import { createPublicClient, http, isAddress } from "viem";
import OptionsApp from "./options-app";
import { deployment as defaultDeployment, marketRecords, asMarket } from "../lib/config";
import { optionMarketV4Abi, optionV4Abi } from "../lib/generated/abis";
import { units } from "../lib/options";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  if (params.view === "docs") {
    const title = "Documentation · Archer Markets";
    const description = "Understand one-token options, collateral, manual American exercise, token delivery and testnet limitations.";
    return { title, description, openGraph: { title, description }, twitter: { title, description } };
  }
  const selected = params.option;
  const deployment = marketRecords.find(m => m.marketId === params.market) ?? defaultDeployment;
  const ready = !!asMarket(deployment);
  if (!selected) return {};
  let title = "Option unavailable · Archer Markets";
  let description =
    "This option could not be verified in the configured factory. Check its status in the application.";
  if (
    typeof selected === "string" &&
    isAddress(selected) &&
    ready &&
    deployment.deploymentBlock
  ) {
    try {
      // Each Worker request owns its RPC work. A shared HTTP batch can resolve
      // another request's promises after its context was canceled.
      const client = createPublicClient({
        transport: http(deployment.rpcUrl, { batch: false, retryCount: 1, timeout: 5000 }),
        cacheTime: 0,
      });
      // Authenticate the address through the factory's indexed creation event before reading it.
      const events = await client.getContractEvents({
        address: deployment.factory!,
        abi: optionMarketV4Abi,
        eventName: "OptionCreated",
        args: { option: selected },
        fromBlock: BigInt(deployment.deploymentBlock),
        toBlock: "latest",
      });
      if (events.length) {
        const [type, quantity, strike, premium] = await Promise.all([
          client.readContract({
            address: selected,
            abi: optionV4Abi,
            functionName: "optionType",
          }),
          client.readContract({
            address: selected,
            abi: optionV4Abi,
            functionName: "underlyingAmount",
          }),
          client.readContract({
            address: selected,
            abi: optionV4Abi,
            functionName: "strikeTotal",
          }),
          client.readContract({
            address: selected,
            abi: optionV4Abi,
            functionName: "premium",
          }),
        ]);
        const resale = await client.readContract({ address: selected, abi: optionV4Abi, functionName: "resalePrice" });
        title = `${type === 0 ? "Call" : "Put"} · ${units(quantity, deployment.underlying.decimals)} ${deployment.underlying.symbol} · Archer Markets`;
        description = `${resale > 0n ? "Resale asking price" : "Original option price"} — total ${units(resale > 0n ? resale : premium, deployment.quote.decimals)} ${deployment.quote.symbol}; exercise payment — total ${units(strike, deployment.quote.decimals)} ${deployment.quote.symbol}. Verify current availability in the app. Token delivery, manual exercise. Testnet only.`;
      }
    } catch {
      /* Shareable links remain renderable during an RPC outage. */
    }
  }
  // An individual position has no image. Never inherit the generic site card.
  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { market, view } = await searchParams;
  const initialView = view === "docs" ? "docs" : view === "portfolio" ? "mine" : view === "write" ? "create" : view === "activity" ? "activity" : view === "bids" ? "bids" : "market";
  return <OptionsApp initialMarketId={typeof market === "string" ? market : undefined} initialView={initialView} />;
}
