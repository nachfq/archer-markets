"use client";

import type { ReactNode } from "react";
import type { Address } from "viem";
import { feeForV4, prepareCancelV4, type Bid, type PreparedOperation } from "@stock-options-lab/sdk";
import { asMarket, client, type Deployment } from "../lib/config";
import { units } from "../lib/options";
import { utcDeadline } from "../lib/expirations";
import { TradeTicket } from "./workspace-ui";

type Props = {
  net: Deployment; bids: Bid[]; selectedId?: bigint; account?: Address; now: bigint;
  canAct: boolean; busy: boolean; unavailable: boolean; notification: ReactNode;
  onClose: () => void; onOption: (address: string) => void; onRefresh: () => void;
  onRun: (prepare: () => Promise<PreparedOperation>, success: string) => Promise<boolean>;
};

export default function BidManager(props: Props) {
  const { net, account, now, busy } = props;
  const selected = props.bids.find(bid => bid.id === props.selectedId);
  const own = selected?.buyer.toLowerCase() === account?.toLowerCase();
  const market = asMarket(net);
  const fee = selected && market ? feeForV4(market, selected.premium) : 0n;
  return <TradeTicket title="Manage your bid" busy={busy} onClose={props.onClose}><div className="bid-review">
    {props.notification}
    {selected && own ? <><h2>{selected.optionType === 0 ? "Call" : "Put"} · {units(selected.underlyingAmount, net.underlying.decimals)} {net.underlying.symbol}</h2>
      <dl><div><dt>{selected.state === 1 ? "Premium paid" : selected.state === 2 ? "Premium returned" : "Reserved premium"}</dt><dd>{units(selected.premium, net.quote.decimals)} {net.quote.symbol}</dd></div><div><dt>{selected.state === 1 ? "Protocol fee paid" : selected.state === 2 ? "Protocol fee returned" : "Reserved protocol fee"}</dt><dd>{units(fee, net.quote.decimals)} {net.quote.symbol}</dd></div><div><dt>Exercise payment · total</dt><dd>{units(selected.strikeTotal, net.quote.decimals)} {net.quote.symbol}</dd></div><div><dt>Exercise before</dt><dd>{utcDeadline(selected.expiry)}</dd></div></dl>
      {props.unavailable && <div role="alert">Could not refresh this market.<button className="button" onClick={props.onRefresh}>Retry connection</button></div>}
      {selected.state === 1 ? <button className="button" disabled={busy} onClick={() => props.onOption(selected.option)}>View option</button> : selected.state === 2 ? <p>Bid canceled.</p> : <><p>{selected.expiry <= now ? "The bid has expired. Recover its reserved premium and fee." : "Cancel before execution to recover the full premium and reserved fee."}</p><button className="button dark" disabled={!props.canAct || props.unavailable} onClick={() => props.onRun(() => prepareCancelV4(client, market!, account!, selected.id), "Bid canceled. The full premium and reserved fee were returned to your wallet.")}>Cancel bid &amp; recover funds</button></>}
    </> : <p>This bid is not available for this wallet.</p>}
  </div></TradeTicket>;
}
