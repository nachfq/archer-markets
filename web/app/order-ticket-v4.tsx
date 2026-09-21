"use client";
import { useState, type ReactNode } from "react";
import type { Address } from "viem";
import { feeForV4, prepareOrderV4, prepareResaleV4, priceTicks, type Bid, type Portfolio, type PreparedOperation } from "@stock-options-lab/sdk";
import { asMarket, client, type Deployment } from "../lib/config";
import { expiration, isListed, optionPrice, optionSeller, units } from "../lib/options";
import { suggestedExpirations, utcDeadline } from "../lib/expirations";
import { orderTotals, type OrderSeed } from "../lib/order-ticket";
import { TradeTicket } from "./workspace-ui";
import type { Position } from "../lib/options";
export type QuoteSelection = { ask: Position } | { bid: Bid };
export type OrderTicketProps = {
    resale?: Position;
    net: Deployment;
    seed: OrderSeed;
    quote?: QuoteSelection;
    positions: Position[];
    bids: Bid[];
    account?: Address;
    walletChainId?: number;
    now: bigint;
    portfolio?: Portfolio;
    canAct: boolean;
    busy: boolean;
    unavailable: boolean;
    notification: ReactNode;
    onClose: () => void;
    onConnect: () => void;
    onRefresh: () => void;
    onDone: () => void;
    onRun: (prepare: () => Promise<PreparedOperation>, success: string) => Promise<boolean>;
};
export default function OrderTicketV4(props: OrderTicketProps) {
    const { net, account, now, busy, resale } = props;
    const market = asMarket(net);
    const [source] = useState(props.quote);
    const original = resale ?? (source && ('ask' in source ? source.ask : source.bid));
    const [side, setSide] = useState(resale ? 'sell' : props.seed.side);
    const [kind, setKind] = useState(original?.optionType ?? props.seed.kind ?? 0);
    const [strike, setStrike] = useState(original ? units(original.strikeTotal, net.quote.decimals) : props.seed.strike ?? '');
    const [price, setPrice] = useState(source ? units('ask' in source ? optionPrice(source.ask) : source.bid.premium, net.quote.decimals) : '');
    const suggestions = suggestedExpirations(Number(now) * 1000);
    const [expiry, setExpiry] = useState(original?.expiry || props.seed.expiry ? new Date(Number(original?.expiry ?? props.seed.expiry) * 1000).toISOString() : suggestions[0]?.value ?? '');
    const [custom, setCustom] = useState(false);
    const [review, setReview] = useState<string | null>(null);
    const [ack, setAck] = useState(false);
    const context = `${account}:${props.walletChainId}`;
    const [previousContext, setPreviousContext] = useState(context);
    if (context !== previousContext) {
        setPreviousContext(context);
        setReview(null);
        setAck(false);
    }
    const edit = (fn: () => void) => { fn(); setReview(null); setAck(false); };
    let terms: ReturnType<typeof orderTotals> & {
        expiry: bigint;
        optionType: 0 | 1;
    } | undefined;
    let error = '';
    try {
        if (strike && price && expiry) {
            const amounts = orderTotals(strike, price, net.underlying.decimals, net.quote.decimals);
            priceTicks(amounts.strikeTotal, net.quote.decimals);
            priceTicks(amounts.premium, net.quote.decimals);
            terms = { ...amounts, expiry: expiration(expiry, Number(now) * 1000), optionType: kind as 0 | 1 };
        }
    }
    catch (e) {
        error = e instanceof Error ? e.message : 'Check order terms.';
    }
    const asks = props.positions.filter(p => terms && isListed(p, now) && p.optionType === kind && p.strikeTotal === terms.strikeTotal && p.expiry === terms.expiry).sort((a, b) => optionPrice(a) < optionPrice(b) ? -1 : optionPrice(a) > optionPrice(b) ? 1 : Number((a.orderId ?? 0n) - (b.orderId ?? 0n)));
    const bids = props.bids.filter(r => terms && r.state === 0 && r.expiry > now && r.optionType === kind && r.strikeTotal === terms.strikeTotal && r.expiry === terms.expiry).sort((a, b) => a.premium > b.premium ? -1 : a.premium < b.premium ? 1 : Number(a.id - b.id));
    const best = side === 'buy' ? asks[0] : bids[0];
    const bestPrice = best ? (side === 'buy' ? optionPrice(asks[0]) : bids[0].premium) : undefined;
    const crosses = terms && bestPrice !== undefined && (side === 'buy' ? bestPrice <= terms.premium : bestPrice >= terms.premium);
    const counterparty = side === 'buy' ? (asks[0] && optionSeller(asks[0])) : bids[0]?.buyer;
    if (crosses && account && (counterparty?.toLowerCase() === account.toLowerCase() || (side === 'buy' && asks[0].writer.toLowerCase() === account.toLowerCase()) || (resale && bids[0]?.buyer.toLowerCase() === resale.writer.toLowerCase())))
        error = 'The best order is yours or would return an option to its writer. Cancel the conflicting order or change your limit.';
    if (resale && (resale.buyer.toLowerCase() !== account?.toLowerCase() || resale.state !== 1 || (resale.resalePrice ?? 0n) > 0n))
        error = 'Only the holder can sell an unlisted, active option.';
    const token = side === 'buy' || kind === 1 ? net.quote : net.underlying;
    const maximumFee = terms && market && side === 'buy' ? feeForV4(market, terms.premium) : 0n;
    const executionFee = crosses && bestPrice !== undefined && market && side === 'buy' ? feeForV4(market, bestPrice) : undefined;
    const funding = resale ? 0n : terms ? (side === 'buy' ? terms.premium + maximumFee : kind === 0 ? terms.quantity : terms.strikeTotal) : undefined;
    const available = props.portfolio?.tokens.find(t => t.token.address.toLowerCase() === token.address?.toLowerCase())?.available;
    if (funding !== undefined && available !== undefined && funding > available)
        error = `Not enough ${token.symbol} for the required funds. Incoming premium cannot fund collateral.`;
    const valid = !!terms && !error && !props.unavailable && !!market;
    const fingerprint = JSON.stringify([context, net.marketId, resale?.address, side, kind, strike, price, expiry]);
    const reviewing = review === fingerprint;
    const fmt = (value: bigint | undefined, symbol = net.quote.symbol, decimals = net.quote.decimals) => value === undefined ? '—' : `${units(value, decimals)} ${symbol}`;
    async function confirm() {
        if (!valid || !reviewing || !ack || !account || !props.canAct || !terms || !market)
            return;
        if (await props.onRun(() => resale ? prepareResaleV4(client, market, account, resale.address, terms.premium) : prepareOrderV4(client, market, account, { ...terms, buy: side === 'buy' }), 'Order confirmed. Check its executed or open status in Portfolio.'))
            props.onDone();
    }
    const dates = [...new Set([...suggestions.map(s => s.value), ...(!custom && expiry ? [expiry] : [])])].sort();
    return <TradeTicket title="Order ticket" busy={busy} onClose={props.onClose}><div className={`unified-order ${side}`}>
    <form onSubmit={e => { e.preventDefault(); if (valid)
        setReview(fingerprint); }}>
      {resale && <p className="fine">Reselling your option. Its collateral stays in the same contract.</p>}
      <fieldset className="order-fields" disabled={busy}>
        <div className="order-side" role="group" aria-label="Order side"><button type="button" disabled={!!resale} aria-pressed={side === 'buy'} onClick={() => edit(() => setSide('buy'))}>Buy</button><button type="button" aria-pressed={side === 'sell'} onClick={() => edit(() => setSide('sell'))}>Sell</button></div>
        <label>Options<input aria-label="Order quantity" value="1" readOnly/><small>Covers 1 {net.underlying.symbol}</small></label>
        <label>Expiration<select aria-label="Order expiration" disabled={!!resale} value={custom ? 'custom' : expiry} onChange={e => edit(() => { setCustom(e.target.value === 'custom'); setExpiry(e.target.value === 'custom' ? '' : e.target.value); })}>{dates.map(d => <option key={d} value={d}>{utcDeadline(BigInt(Date.parse(d) / 1000))}</option>)}<option value="custom">Custom…</option></select></label>
        <label>Strike · {net.quote.symbol}<input aria-label="Order strike" readOnly={!!resale} inputMode="decimal" value={strike} onChange={e => edit(() => setStrike(e.target.value))}/></label>
        <label>Type<select aria-label="Order option type" disabled={!!resale} value={kind} onChange={e => edit(() => setKind(Number(e.target.value)))}><option value="0">Call</option><option value="1">Put</option></select></label>
        <label>Limit premium · {net.quote.symbol}<input aria-label="Order premium" inputMode="decimal" value={price} onChange={e => edit(() => setPrice(e.target.value))}/></label>
        {custom && <label>Expiration · local time<input type="datetime-local" aria-label="Custom order expiration" value={expiry} onChange={e => edit(() => setExpiry(e.target.value))}/></label>}
      </fieldset>
      <div className="order-execution"><strong>{crosses ? 'Estimated: executes now' : terms ? 'Estimated: open order' : 'Enter order terms'}</strong></div>
      <dl className="order-totals"><div><dt>{side === 'buy' ? 'Limit premium' : 'Asking premium'}</dt><dd>{fmt(terms?.premium)}</dd></div>{crosses && <div><dt>Matching premium</dt><dd>{fmt(bestPrice)}</dd></div>}{side === 'buy' && <div><dt>{crosses ? 'Trading fee' : 'Fee reserved'}</dt><dd>{fmt(crosses ? executionFee : terms ? maximumFee : undefined)}</dd></div>}<div><dt>{resale ? 'Additional collateral' : side === 'buy' ? 'Maximum to reserve' : 'Collateral to deposit'}</dt><dd>{fmt(funding, token.symbol, token.decimals)}</dd></div><div><dt>Available</dt><dd>{account ? fmt(available, token.symbol, token.decimals) : 'Connect wallet'}</dd></div></dl>
      {terms && <p className="fine">Exercise later requires {kind === 0 ? fmt(terms.strikeTotal) : `1 ${net.underlying.symbol}`} from the holder before expiration.</p>}
      {props.notification}
      {!market && <p role="status">Preview only. A verified V4 deployment is required to trade.</p>}
      {props.unavailable && <div role="alert">Could not refresh this market.<button type="button" className="button" onClick={props.onRefresh}>Retry connection</button></div>}
      {error && <p className="banner error" role="alert">{error}</p>}
      {reviewing && <label className="order-ack"><input type="checkbox" checked={ack} disabled={busy} onChange={e => setAck(e.target.checked)}/>I understand that exercise is manual and must happen before expiration.</label>}
      <div className="order-footer"><strong>{side.toUpperCase()} 1 {net.underlying.symbol} · {kind === 0 ? 'CALL' : 'PUT'} · Strike {strike || '—'} · Limit {price || '—'}</strong>{!reviewing ? <button className="button dark" disabled={!valid || busy} type="submit">Review order</button> : !account ? <button className="button dark" type="button" onClick={props.onConnect}>Connect wallet</button> : <button className="button dark" type="button" disabled={!valid || busy || !props.canAct || !ack || available === undefined} onClick={confirm}>Confirm {side}</button>}</div>
    </form>
  </div></TradeTicket>;
}
