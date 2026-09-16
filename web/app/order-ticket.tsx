"use client";

import { useState, type ReactNode } from "react";
import type { Address } from "viem";
import { prepareCreateOffer, prepareCreateRequest, prepareAcceptRequest, prepareBuy, prepareBuyResale, type BuyRequest, type Portfolio, type PreparedOperation } from "@stock-options-lab/sdk";
import { asMarket, client, type Deployment } from "../lib/config";
import { expiration, isListed, optionPrice, optionSeller, units, type Position } from "../lib/options";
import { orderTotals, unitInput, type OrderSeed } from "../lib/order-ticket";
import { suggestedExpirations, utcDeadline } from "../lib/expirations";
import { TradeTicket } from "./workspace-ui";

export type QuoteSelection = { ask: Position } | { bid: BuyRequest };
type Props = {
  net: Deployment; seed: OrderSeed; quote?: QuoteSelection; positions: Position[]; requests: BuyRequest[];
  account?: Address; walletChainId?: number; now: bigint; portfolio?: Portfolio;
  canAct: boolean; busy: boolean; unavailable: boolean; notification: ReactNode;
  onClose: () => void; onConnect: () => void; onRefresh: () => void; onDone: () => void;
  onRun: (prepare: () => Promise<PreparedOperation>, success: string) => Promise<boolean>;
};
export default function OrderTicket(props: Props) {
  const { net, now, account, busy } = props;
  const market = asMarket(net);
  const [seed] = useState(props.seed);
  const [source] = useState(props.quote);
  const original = source && ("ask" in source ? source.ask : source.bid);
  const originalPremium = source && ("ask" in source ? optionPrice(source.ask) : source.bid.premium);
  const perUnit = (n: bigint) => unitInput(n, original!.underlyingAmount, net.underlying.decimals, net.quote.decimals);
  const [side, setSide] = useState(seed.side);
  const [kind, setKind] = useState(original?.optionType ?? seed.kind ?? 0);
  const [quantity, setQuantity] = useState(original ? units(original.underlyingAmount, net.underlying.decimals) : seed.quantity ?? "1");
  const [strike, setStrike] = useState(original ? perUnit(original.strikeTotal).value : seed.strike ?? "");
  const [price, setPrice] = useState(originalPremium !== undefined ? perUnit(originalPremium).value : "");
  const dates = suggestedExpirations(Number(now) * 1000);
  const [expiry, setExpiry] = useState(original?.expiry || seed.expiry ? new Date(Number(original?.expiry ?? seed.expiry) * 1000).toISOString() : dates[0]?.value ?? "");
  const [custom, setCustom] = useState(false);
  const [acceptUntil, setAcceptUntil] = useState("");
  const [mode, setMode] = useState<"accept" | "post">(source ? "accept" : "post");
  const [reviewed, setReviewed] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const context = `${account}:${props.walletChainId}`;
  const [previousContext, setPreviousContext] = useState(context);
  if (previousContext !== context) { setPreviousContext(context); setReviewed(null); setAcknowledged(false); }
  const edit = (fn: () => void) => { fn(); setMode("post"); setReviewed(null); setAcknowledged(false); };
  const restore = () => {
    if (!source || !original) return;
    setSide("ask" in source ? "buy" : "sell"); setKind(original.optionType);
    setQuantity(units(original.underlyingAmount, net.underlying.decimals)); setStrike(perUnit(original.strikeTotal).value); setPrice(perUnit(originalPremium!).value);
    setExpiry(new Date(Number(original.expiry) * 1000).toISOString()); setCustom(false); setMode("accept"); setReviewed(null); setAcknowledged(false);
  };
  let terms: ReturnType<typeof orderTotals> & { optionType: 0 | 1; expiry: bigint; acceptUntil: bigint } | undefined;
  let error = "";
  try {
    if (mode === "accept" && original) terms = { quantity: original.underlyingAmount, strikeTotal: original.strikeTotal, premium: originalPremium!, optionType: original.optionType as 0 | 1, expiry: original.expiry, acceptUntil: "bid" in source! ? source.bid.acceptUntil : original.expiry - 1n };
    else if (quantity && strike && price && expiry) {
      const end = expiration(expiry, Number(now) * 1000);
      const until = acceptUntil ? expiration(acceptUntil, Number(now) * 1000) : end - 3600n;
      if (side === "buy" && (until <= now || until >= end)) throw new Error("The bid deadline must be in the future and before expiration.");
      terms = { ...orderTotals(quantity, strike, price, net.underlying.decimals, net.quote.decimals, { strike: original && strike === perUnit(original.strikeTotal).value ? { total: original.strikeTotal, quantity: original.underlyingAmount } : strike === seed.strike ? seed.strikeRatio : undefined, premium: original && price === perUnit(originalPremium!).value ? { total: originalPremium!, quantity: original.underlyingAmount } : undefined }), optionType: kind as 0 | 1, expiry: end, acceptUntil: until };
    }
  } catch (e) { error = e instanceof Error ? e.message : "Check the order terms."; }
  const liveAsk = source && "ask" in source ? props.positions.find(p => p.address.toLowerCase() === source.ask.address.toLowerCase()) : undefined;
  const liveBid = source && "bid" in source ? props.requests.find(r => r.id === source.bid.id) : undefined;
  const validQuote = !source || ("ask" in source
    ? !!liveAsk && isListed(liveAsk, now) && optionPrice(liveAsk) === optionPrice(source.ask) && liveAsk.listingNonce === source.ask.listingNonce && optionSeller(liveAsk).toLowerCase() === optionSeller(source.ask).toLowerCase() && liveAsk.writer.toLowerCase() !== account?.toLowerCase() && optionSeller(liveAsk).toLowerCase() !== account?.toLowerCase()
    : !!liveBid && liveBid.state === 0 && liveBid.acceptUntil > now && liveBid.buyer.toLowerCase() !== account?.toLowerCase());
  if (mode === "accept" && !validQuote) error = "This quote is no longer available for this wallet. Refresh or post your own order.";
  const fundingToken = side === "buy" || kind === 1 ? net.quote : net.underlying;
  const funding = terms ? side === "buy" ? terms.premium : kind === 0 ? terms.quantity : terms.strikeTotal : undefined;
  const available = props.portfolio?.tokens.find(t => t.token.address.toLowerCase() === fundingToken.address?.toLowerCase())?.available;
  if (funding !== undefined && available !== undefined && funding > available) error = `Not enough ${fundingToken.symbol} for the upfront payment. The incoming premium cannot fund collateral.`;
  const supported = !!market && !net.legacy && (mode === "accept" || side === "sell" || market.version === 3);
  const fingerprint = JSON.stringify([context, side, kind, quantity, strike, price, expiry, acceptUntil, mode, validQuote]);
  const reviewing = reviewed === fingerprint;
  const fmt = (n: bigint | undefined, token = net.quote) => n === undefined ? "—" : `${units(n, token.decimals)} ${token.symbol}`;
  const valid = !!terms && !error && !props.unavailable && supported;
  async function confirm() {
    if (!valid || !reviewing || !account || !terms || !acknowledged || !props.canAct) return;
    const accepted = mode === "accept";
    const success = accepted ? side === "buy" ? "Option purchased. Manage it in Portfolio." : "Option sold. Collateral deposited and premium received." : side === "buy" ? "Bid posted. Premium reserved; waiting for a seller." : "Ask posted. Collateral deposited; waiting for a buyer.";
    if (await props.onRun(async () => {
      if (accepted && source) {
        if ("bid" in source) return prepareAcceptRequest(client, market!, account, source.bid.id);
        if (source.ask.state === 1) return prepareBuyResale(client, market!, account, source.ask.address, { seller: source.ask.buyer, price: optionPrice(source.ask), nonce: source.ask.listingNonce! });
        return prepareBuy(client, market!, account, source.ask.address);
      }
      return side === "buy" ? prepareCreateRequest(client, market!, account, terms!) : prepareCreateOffer(client, market!, account, terms!);
    }, success)) props.onDone();
  }
  const expirations = [...new Set([...dates.map(d => d.value), ...(custom || !expiry ? [] : [expiry])])].sort();
  return <TradeTicket title="Order ticket" busy={busy} onClose={props.onClose}>
    <div className={`unified-order ${side}`}>
      <form onSubmit={e => { e.preventDefault(); if (valid) setReviewed(fingerprint); }}>
        <fieldset className="order-fields" disabled={busy}>
          <div className="order-side" role="group" aria-label="Order side"><button type="button" aria-pressed={side === "buy"} onClick={() => { if (side !== "buy") edit(() => setSide("buy")); }}>Buy</button><button type="button" aria-pressed={side === "sell"} onClick={() => { if (side !== "sell") edit(() => setSide("sell")); }}>Sell</button></div>
          <label>Quantity · {net.underlying.symbol}<input aria-label="Order quantity" inputMode="decimal" value={quantity} onChange={e => edit(() => setQuantity(e.target.value))} /></label>
          <label>Expiration<select aria-label="Order expiration" value={custom ? "custom" : expiry} onChange={e => edit(() => { setCustom(e.target.value === "custom"); if (e.target.value !== "custom") setExpiry(e.target.value); else setExpiry(""); })}>{expirations.map(d => <option key={d} value={d}>{utcDeadline(BigInt(Date.parse(d) / 1000))}</option>)}<option value="custom">Custom…</option></select></label>
          <label>Strike · {net.quote.symbol} / token<input aria-label="Order strike" inputMode="decimal" value={strike} onChange={e => edit(() => setStrike(e.target.value))} /></label>
          <label>Type<select aria-label="Order option type" value={kind} onChange={e => edit(() => setKind(Number(e.target.value)))}><option value="0">Call</option><option value="1">Put</option></select></label>
          <label>Premium · {net.quote.symbol} / token<input aria-label="Order premium" inputMode="decimal" value={price} onChange={e => edit(() => setPrice(e.target.value))} /></label>
          {custom && <label>Expiration · local time<input type="datetime-local" aria-label="Custom order expiration" value={expiry} onChange={e => edit(() => setExpiry(e.target.value))} /></label>}
        </fieldset>
        <div className="order-execution"><strong>{mode === "accept" ? `Accept selected ${side === "buy" ? "ask" : "bid"}` : `Post new ${side === "buy" ? "bid" : "ask"}`}</strong><span>{mode === "accept" ? "Full quantity at the quoted price." : "Waits for another trader. No automatic matching."}</span>{source && <button type="button" className="text-button" disabled={busy} onClick={() => mode === "accept" ? edit(() => {}) : restore()}>{mode === "accept" ? "Post my own price instead" : "Restore selected quote"}</button>}</div>
        {original && ((strike === perUnit(original.strikeTotal).value && perUnit(original.strikeTotal).approximate) || (price === perUnit(originalPremium!).value && perUnit(originalPremium!).approximate)) && <p className="fine">Some unit prices are approximate. Their exact ratios are preserved until you edit that price; the totals below are exact.</p>}
        <dl className="order-totals"><div><dt>Premium · total</dt><dd>{fmt(terms?.premium)}</dd></div><div><dt>Exercise payment · total</dt><dd>{fmt(terms?.strikeTotal)}</dd></div><div><dt>{side === "buy" ? mode === "post" ? "Reserve now" : "Pay now" : "Collateral to deposit"}</dt><dd>{fmt(funding, fundingToken)}</dd></div><div><dt>Available</dt><dd>{account ? fmt(available, fundingToken) : "Connect wallet"}</dd></div></dl>
        {side === "sell" && <p className="fine">Premium received {mode === "accept" ? "upon acceptance" : "when a buyer accepts"}: {fmt(terms?.premium)}. {kind === 0 ? "Stock backs the call." : "The full exercise payment backs the put."}</p>}
        {mode === "post" && side === "buy" && <details className="order-validity"><summary>Bid deadline: {terms ? utcDeadline(terms.acceptUntil) : "one hour before expiration"}</summary><label>Custom bid deadline · local time<input aria-label="Bid deadline" type="datetime-local" disabled={busy} value={acceptUntil} onChange={e => edit(() => setAcceptUntil(e.target.value))} /></label><p className="fine">Cancel an unaccepted bid in Portfolio to recover its premium.</p></details>}
        {props.notification}
        {!supported && <p role="status">Preview only. A compatible deployment is required to trade.</p>}
        {props.unavailable && <div role="alert">Could not refresh this market.<button type="button" className="button" onClick={props.onRefresh}>Retry connection</button></div>}
        {error && <p className="banner error" role="alert">{error}</p>}
        {reviewing && <label className="order-ack"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={e => setAcknowledged(e.target.checked)} />I understand: full quantity, manual exercise before expiration, and no premium refund after purchase.</label>}
        <div className="order-footer"><strong>{side.toUpperCase()} {quantity || "—"} {net.underlying.symbol} · {kind === 0 ? "CALL" : "PUT"} · Strike {strike || "—"} · Premium {price || "—"} / token</strong>{!reviewing ? <button className="button dark" type="submit" disabled={!valid || busy}>Review order</button> : !account ? <button className="button dark" type="button" onClick={props.onConnect}>Connect wallet</button> : <button className="button dark" type="button" disabled={!valid || !props.canAct || !acknowledged || available === undefined} onClick={confirm}>Confirm {side === "buy" ? "buy" : "sell"}</button>}</div>
      </form>
    </div>
  </TradeTicket>;
}
