"use client";

import type { ReactNode } from "react";
import type { Address } from "viem";
import { prepareCancelRequest, type BuyRequest, type PreparedOperation } from "@stock-options-lab/sdk";
import { asMarket, client, type Deployment } from "../lib/config";
import { units } from "../lib/options";
import { utcDeadline } from "../lib/expirations";
import { TradeTicket } from "./workspace-ui";

type Props = {
  net: Deployment; requests: BuyRequest[]; selectedId?: bigint; account?: Address; now: bigint;
  canAct: boolean; busy: boolean; unavailable: boolean; notification: ReactNode;
  onClose: () => void; onOption: (address: string) => void; onRefresh: () => void;
  onRun: (prepare: () => Promise<PreparedOperation>, success: string) => Promise<boolean>;
};
// Existing bid management lives in Portfolio. All buy/sell entry uses OrderTicket.
export default function BuyRequests(props: Props) {
  const { net, account, now, busy } = props;
  const selected = props.requests.find(r => r.id === props.selectedId);
  const own = selected?.buyer.toLowerCase() === account?.toLowerCase();
  return <TradeTicket title="Manage your bid" busy={busy} onClose={props.onClose}><div className="request-review">
    {props.notification}
    {selected && own ? <><h2>{selected.optionType === 0 ? "Call" : "Put"} · {units(selected.underlyingAmount, net.underlying.decimals)} {net.underlying.symbol}</h2>
      <dl><div><dt>{selected.state === 1 ? "Premium paid" : selected.state === 2 ? "Premium returned" : "Reserved premium"}</dt><dd>{units(selected.premium, net.quote.decimals)} {net.quote.symbol}</dd></div><div><dt>Exercise payment · total</dt><dd>{units(selected.strikeTotal, net.quote.decimals)} {net.quote.symbol}</dd></div><div><dt>Accept before</dt><dd>{utcDeadline(selected.acceptUntil)}</dd></div><div><dt>Exercise before</dt><dd>{utcDeadline(selected.expiry)}</dd></div></dl>
      {props.unavailable && <div role="alert">Could not refresh this market.<button className="button" onClick={props.onRefresh}>Retry connection</button></div>}
      {selected.state === 1 ? <button className="button" disabled={busy} onClick={() => props.onOption(selected.option)}>View created option</button> : selected.state === 2 ? <p>Bid canceled.</p> : <><p>{selected.acceptUntil <= now ? "The bid has expired. Recover its reserved premium." : "Cancel before a seller accepts to recover the full premium."}</p><button className="button dark" disabled={!props.canAct || props.unavailable} onClick={() => props.onRun(() => prepareCancelRequest(client, asMarket(net)!, account!, selected.id), "Bid canceled. The full premium was returned to your wallet.")}>Cancel bid & recover premium</button></>}
    </> : <p>This bid is not available for this wallet.</p>}
  </div></TradeTicket>;
}
