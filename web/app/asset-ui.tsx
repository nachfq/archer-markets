"use client";

import { useEffect, useRef, useState } from "react";
import type { Portfolio } from "@stock-options-lab/sdk";
import type { Deployment } from "../lib/config";
import { assetPresentation, catalogAssets, type AssetPresentation } from "../lib/catalog";
import { readableNumber, short, units } from "../lib/options";

export function FontIcon({ name }: { name: "triangle-exclamation" | "building" | "coins" | "user-pen" | "chevron-down" | "chevron-left" | "chevron-right" }) {
  return <i className={`fa-solid fa-${name}`} aria-hidden="true" />;
}

export function AssetLogo({ presentation }: { presentation: AssetPresentation }) {
  const [failed, setFailed] = useState<string>();
  return <span className={`asset-logo ${presentation.kind}`} aria-hidden="true">
    {presentation.logo && failed !== presentation.logo
      // Small owner-supplied logos use their original local asset and an error fallback.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={presentation.logo} alt="" width={36} height={36} onError={() => setFailed(presentation.logo)} />
      : <FontIcon name={presentation.kind === "stock" ? "building" : "coins"} />}
  </span>;
}

export function MarketList({ markets, selected, disabled, onSelect }: { markets: Deployment[]; selected: string; disabled: boolean; onSelect: (id: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { const node = list.current?.querySelector<HTMLElement>('[aria-pressed="true"]'); if (node && list.current && list.current.scrollWidth > list.current.clientWidth) list.current.scrollTo({ left: Math.max(0, node.offsetLeft - list.current.offsetLeft), behavior: "smooth" }); }, [selected]);
  return <aside className="market-list" aria-label="Markets"><h2>Markets <span className="count-badge">{markets.length}</span></h2><div className="market-list-items" ref={list}>
    {markets.map(market => <button key={market.marketId} data-market={market.marketId} aria-pressed={market.marketId === selected} disabled={disabled}
      onClick={() => onSelect(market.marketId!)}>
      <AssetLogo presentation={assetPresentation(market, "underlying")} /><span><strong>{market.underlying.symbol}</strong><span>{assetPresentation(market, "underlying").name}</span><small>{market.quote.symbol} · {market.sandbox ? "Practice" : "Testnet"}</small></span>
    </button>)}
  </div><p className="fine">Curated markets · Test funds only</p></aside>;
}

export function BalanceTables({ markets, portfolio, stale }: { markets: Deployment[]; portfolio?: Portfolio; stale: boolean }) {
  const assets = catalogAssets(markets);
  return <section className="capital-overview" aria-label="Balances and collateral">
    <div className="section-head"><h2>Your capital</h2><span className="fine">{stale ? "Balances unavailable — refresh required" : portfolio ? `Block ${portfolio.blockNumber}` : "Connect to load available balances"}</span></div>
    {(["stock", "stablecoin"] as const).map(kind => <section className="balance-section" key={kind} aria-label={kind === "stock" ? "Stock Tokens" : "Stablecoins"}>
      <h3>{kind === "stock" ? "Stock Tokens" : "Stablecoins"}</h3>{/* Keyboard users can scroll the table horizontally. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="table-scroll" tabIndex={0} role="region" aria-label={`${kind === "stock" ? "Stock Token" : "Stablecoin"} balances`}><table className="balance-table">
        <thead><tr>{["Asset", "Available", "Open asks", "Active collateral", "Reclaimable", "Open bids", "Refundable bids", "Total tracked"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{assets.filter(asset => asset.presentation.kind === kind).map(({ key, token, presentation }) => {
          const row = stale ? undefined : portfolio?.tokens.find(row => row.token.address.toLowerCase() === token.address?.toLowerCase());
          return <tr key={key}><th scope="row"><div className="asset-cell"><AssetLogo presentation={presentation} /><span>{presentation.name}<small>{token.symbol} · {token.address ? short(token.address) : "Not configured"}</small></span></div></th>
            {(["available", "openCollateral", "activeCollateral", "reclaimable", "openBidPremium", "refundableBidPremium", "totalTracked"] as const).map(field => <td key={field}>{row ? readableNumber(units(row[field], token.decimals), kind === "stablecoin" ? 2 : 0) : "—"}</td>)}
          </tr>;
        })}</tbody>
      </table></div>
    </section>)}
    <p className="fine">Amounts are token units, not portfolio value. Bid totals include premium plus the refundable fee reserve; purchased rights appear below. Gas is separate in your wallet menu.</p>
  </section>;
}
