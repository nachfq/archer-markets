"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { Address } from "viem";
import { prepareCreateRequest, prepareAcceptRequest, prepareCancelRequest, validateLotQuantity, type BuyRequest, type Portfolio, type PreparedOperation } from "@stock-options-lab/sdk";
import { client, asMarket, type Deployment } from "../lib/config";
import { amount, expiration, units, readableNumber, short } from "../lib/options";
import { suggestedExpirations, utcDeadline } from "../lib/expirations";
import WriteOptionForm, { type WriteTerms } from "./write-option-form";
import { TradeTicket } from "./workspace-ui";

type Props = {
  net: Deployment; requests: BuyRequest[]; account?: Address; walletChainId?: number; now: bigint; portfolio?: Portfolio;
  canAct: boolean; busy: boolean; unavailable: boolean; loading: boolean;
  notification: ReactNode; selectedId?: bigint; onClose: () => void;
  onRun: (prepare: () => Promise<PreparedOperation>, success: string) => Promise<boolean>;
  onOption: (address: string) => void; onConnect: () => void; onRefresh: () => void;
};
const blank: WriteTerms = { kind: 0, quantity: "", strike: "", premium: "", expiry: "", expiryMode: "suggested", presetExpiry: "" };
export default function BuyRequests(props: Props) {
  const { net, requests, account, now, portfolio, canAct, busy, unavailable } = props;
  const market = asMarket(net);
  const supported = market?.version === 3 && !net.legacy;
  const creating = props.selectedId === undefined;
  const [values, setValues] = useState<WriteTerms>(blank);
  const [acceptance, setAcceptance] = useState("");
  const [reviewValue, setReviewValue] = useState<"create" | bigint | null>(props.selectedId ?? null);
  const context = `${account?.toLowerCase()}:${props.walletChainId}`;
  const [reviewContext, setReviewContext] = useState(context);
  // Discard approval of the review when the wallet context changes. Returning to
  // the old account/network must not resurrect an earlier confirmation screen.
  if (reviewContext !== context) {
    setReviewContext(context);
    setReviewValue(null);
  }
  const review = reviewContext === context ? reviewValue : null;
  const setReview = (value: typeof reviewValue) => { setReviewContext(context); setReviewValue(value); };
  const suggestions = suggestedExpirations(Number(now) * 1000);
  const effectiveExpiry = values.expiryMode === "custom" ? values.expiry : values.presetExpiry || suggestions[0]?.value || "";
  const fmt = (value: bigint, token = net.quote) => `${readableNumber(units(value, token.decimals), token === net.quote ? 2 : 0)} ${token.symbol}`;
  const available = (token = net.quote) => portfolio?.tokens.find(t => t.token.address.toLowerCase() === token.address?.toLowerCase())?.available;
  let terms: Parameters<typeof prepareCreateRequest>[3] | undefined;
  let error = "";
  if (values.quantity && values.strike && values.premium && acceptance && effectiveExpiry) {
    try {
      const quantity = amount(values.quantity, net.underlying.decimals);
      validateLotQuantity(quantity, net.underlying.decimals);
      const expiry = expiration(effectiveExpiry, Number(now) * 1000);
      const acceptUntil = expiration(acceptance, Number(now) * 1000);
      if (acceptUntil >= expiry) throw new Error("Acceptance must end before the option expires.");
      const premium = amount(values.premium, net.quote.decimals);
      if (available() !== undefined && premium > available()!) throw new Error(`Not enough ${net.quote.symbol} to reserve this premium.`);
      terms = { optionType: values.kind as 0 | 1, quantity, strikeTotal: amount(values.strike, net.quote.decimals), premium, expiry, acceptUntil };
    } catch (err) { error = err instanceof Error ? err.message : "Check request terms."; }
  }
  const changing = Object.fromEntries(Object.keys(blank).map(key => [key, (value: string | number) => { setReview(null); setValues(previous => ({ ...previous, [key]: value })); }])) as { [K in keyof WriteTerms]: (value: WriteTerms[K]) => void };
  const selected = typeof review === "bigint" ? requests.find(r => r.id === review) : undefined;
  const own = selected?.buyer.toLowerCase() === account?.toLowerCase();
  const collateralToken = selected?.optionType === 0 ? net.underlying : net.quote;
  const collateral = selected?.optionType === 0 ? selected.underlyingAmount : selected?.strikeTotal;
  const insufficient = selected && !own && collateral !== undefined && available(collateralToken) !== undefined && collateral > available(collateralToken)!;
  async function submit(event: FormEvent) { event.preventDefault(); if (terms) setReview("create"); }
  const connectionError = unavailable && <div className="banner error" role="alert">Could not refresh this market. Actions are disabled.<button className="button" onClick={props.onRefresh}>Retry connection</button></div>;
  return <section className="requests-panel" aria-label="Buy orders">
    {creating && review === null && <TradeTicket title="Buy · Post a bid" busy={busy} onClose={props.onClose}><div className="create-layout"><WriteOptionForm requestMode values={values} onChange={changing} underlying={net.underlying} quote={net.quote} busy={busy || review !== null} effectiveExpiry={effectiveExpiry} suggestions={suggestions} canMax={false} onMax={() => {}} canReview={!!terms && !!supported && !unavailable} onReview={submit}>
      <label className="field">Accept until · your local time<input type="datetime-local" aria-label="Request acceptance deadline" value={acceptance} required disabled={busy || review !== null} onChange={event => { setAcceptance(event.target.value); setReview(null); }} /><small>A writer must accept before this deadline. Set it earlier than the exercise expiration.</small></label>
      {props.notification}
      {!supported && <p role="status">Preview only. Bids require a configured version 3 market.</p>}
      {unavailable && <p role="alert">Could not refresh this market. Trading is disabled.</p>}
      <p className="fine">Available for premium: {available() !== undefined ? fmt(available()!) : "Connect to view"}. No exercise funds are reserved now.</p>
      {error && <div className="banner error" role="alert">{error}</div>}
    </WriteOptionForm></div></TradeTicket>}
    {review === "create" && <TradeTicket title="Review buy order · Reserve premium" busy={busy} onClose={() => setReview(null)}><div className="request-review">{connectionError}
      <h2>Buy one {values.kind === 0 ? "call" : "put"}</h2>{props.notification}
      {terms ? <><dl><div><dt>Complete quantity</dt><dd>{fmt(terms.quantity, net.underlying)}</dd></div><div><dt>Deposit now · premium</dt><dd>{fmt(terms.premium)}</dd></div><div><dt>Available after deposit</dt><dd>{available() !== undefined ? fmt(available()! - terms.premium) : "Connect to view"}</dd></div><div><dt>Exercise payment · total</dt><dd>{fmt(terms.strikeTotal)}</dd></div><div><dt>Accept before</dt><dd>{utcDeadline(terms.acceptUntil)}</dd></div><div><dt>Exercise before</dt><dd>{utcDeadline(terms.expiry)}</dd></div></dl>
        <p>You can cancel until accepted and recover the full reserved premium. Acceptance pays the writer and creates your option; the premium is then non-refundable. Exercise is manual and requires the full payment or tokens before expiration.</p></> : <p role="alert">{error || "Review the request terms again."}</p>}
      {!account ? <button className="button dark" onClick={props.onConnect}>Connect wallet to continue</button> : <button className="button dark" disabled={!canAct || unavailable || !terms || !supported} onClick={async () => { if (await props.onRun(() => prepareCreateRequest(client, market!, account, terms!), "Bid posted. Premium is reserved until a seller accepts or you cancel.")) { setReview(null); props.onClose(); } }}>Post bid & reserve premium</button>}
    </div></TradeTicket>}
    {selected && <TradeTicket title={own ? "Manage your bid" : "Sell · Accept bid"} busy={busy} onClose={props.onClose}><div className="request-review">{connectionError}{props.notification}<h2>{selected.optionType === 0 ? "Call" : "Put"} · {fmt(selected.underlyingAmount, net.underlying)}</h2>
      <dl><div><dt>Buyer</dt><dd>{short(selected.buyer)}</dd></div><div><dt>{selected.state === 1 ? "Premium paid to writer" : selected.state === 2 ? "Premium returned" : own ? "Your reserved premium" : "You receive upon acceptance"}</dt><dd>{fmt(selected.premium)}</dd></div><div><dt>{selected.state === 1 ? "Collateral deposited in the option" : "Writer deposits"}</dt><dd>{fmt(collateral!, collateralToken)}</dd></div>{!own && selected.state === 0 && <><div><dt>Available collateral</dt><dd>{available(collateralToken) !== undefined ? fmt(available(collateralToken)!, collateralToken) : "Connect to view"}</dd></div><div><dt>Available after collateral deposit, before premium receipt</dt><dd>{available(collateralToken) !== undefined ? insufficient ? "Insufficient balance" : fmt(available(collateralToken)! - collateral!, collateralToken) : "Connect to view"}</dd></div></>}<div><dt>Exercise payment · total</dt><dd>{fmt(selected.strikeTotal)}</dd></div><div><dt>Accept before</dt><dd>{utcDeadline(selected.acceptUntil)}</dd></div><div><dt>Exercise before</dt><dd>{utcDeadline(selected.expiry)}</dd></div></dl>
      <p>{own ? "Cancel an unaccepted request to recover its entire premium. After acceptance, manage the created option in Portfolio." : "You accept the entire quantity. Your collateral backs one independent option; the buyer may exercise before expiration without another signature from you. You cannot cancel an accepted option."}</p>
      {selected.state !== 0 ? <p role="status">This request is {selected.state === 1 ? "accepted" : "canceled"}.{selected.state === 1 && <button className="button" disabled={busy} onClick={() => props.onOption(selected.option)}>View created option</button>}</p>
      : !account ? <button className="button dark" onClick={props.onConnect}>Connect wallet to continue</button>
      : own ? <button className="button dark" disabled={!canAct || unavailable} onClick={() => props.onRun(() => prepareCancelRequest(client, market!, account, selected.id), "Bid canceled. The full premium was returned to your wallet.")}>Cancel bid & recover premium</button>
      : <><p className="fine">{insufficient ? "Add collateral before accepting. The premium cannot fund your upfront deposit." : selected.acceptUntil <= now ? "The acceptance deadline has passed." : "Approval permits spending; acceptance deposits collateral and pays the premium atomically."}</p><button className="button dark" disabled={!canAct || unavailable || !!insufficient || !portfolio || selected.acceptUntil <= now} onClick={() => props.onRun(() => prepareAcceptRequest(client, market!, account, selected.id), "Option sold. One funded option was created and the premium was paid to you.")}>Sell & deposit collateral</button></>}
    </div></TradeTicket>}
  </section>;
}
