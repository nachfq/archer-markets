import type { Metadata } from "next";
import { isAddress } from "viem";
import OptionsApp from "./options-app";
import { client, deployment as defaultDeployment, marketRecords, asMarket } from "../lib/config";
import { optionAbi, optionFactoryAbi } from "../lib/generated/abis";
import { units } from "../lib/options";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  if (params.view === "docs") {
    const title = "Documentation · Stock Options Lab";
    const description = "Understand whole-lot options, collateral, manual American exercise, token delivery and testnet limitations.";
    return { title, description, openGraph: { title, description }, twitter: { title, description } };
  }
  const selected = params.option;
  const deployment = marketRecords.find(m => m.marketId === params.market) ?? defaultDeployment;
  const ready = !!asMarket(deployment);
  if (!selected) return {};
  let title = "Option unavailable · Stock Options Lab";
  let description =
    "This option could not be verified in the configured factory. Check its status in the application.";
  if (
    typeof selected === "string" &&
    isAddress(selected) &&
    ready &&
    deployment.deploymentBlock
  ) {
    try {
      // Authenticate the address through the factory's indexed creation event before reading it.
      const events = await client.getContractEvents({
        address: deployment.factory!,
        abi: optionFactoryAbi,
        eventName: "OptionCreated",
        args: { option: selected },
        fromBlock: BigInt(deployment.deploymentBlock),
        toBlock: "latest",
      });
      if (events.length) {
        const [type, quantity, strike, premium] = await Promise.all([
          client.readContract({
            address: selected,
            abi: optionAbi,
            functionName: "optionType",
          }),
          client.readContract({
            address: selected,
            abi: optionAbi,
            functionName: "underlyingAmount",
          }),
          client.readContract({
            address: selected,
            abi: optionAbi,
            functionName: "strikeTotal",
          }),
          client.readContract({
            address: selected,
            abi: optionAbi,
            functionName: "premium",
          }),
        ]);
        const resale = (deployment.version ?? 1) >= 2 ? await client.readContract({ address: selected, abi: optionAbi, functionName: "resalePrice" }) : 0n;
        title = `${type === 0 ? "Call" : "Put"} · ${units(quantity, deployment.underlying.decimals)} ${deployment.underlying.symbol} · Stock Options Lab`;
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
  const initialView = view === "docs" ? "docs" : view === "portfolio" ? "mine" : view === "write" ? "create" : view === "activity" ? "activity" : view === "requests" ? "requests" : "market";
  return <OptionsApp initialMarketId={typeof market === "string" ? market : undefined} initialView={initialView} />;
}
