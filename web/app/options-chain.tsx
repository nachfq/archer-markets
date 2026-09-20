"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { bookExpirations, openBids, orderBook, perToken, type Bid, type BookSide } from "../lib/chain";
import { isListed, optionPrice, optionSeller, readableNumber, units, type Position } from "../lib/options";
import { unitInput, type OrderSeed } from "../lib/order-ticket";
import { utcDeadline } from "../lib/expirations";

type Props = {
  version?: number; account?: string; positions: Position[]; requests: Bid[]; now: bigint; selected?: Position; symbol: string;
  quoteSymbol: string; underlyingDecimals: number; quoteDecimals: number;
  loading: boolean; unavailable: boolean; configured: boolean; disabled: boolean;
  onSelect: (address: string) => void; onBid: (id: bigint) => void;
  onCreate: (side: "buy" | "sell", context?: Omit<OrderSeed, "side">) => void; onContext: (context: Omit<OrderSeed, "side">) => void; onRefresh: () => void;
  onDepth?: (kind: 0 | 1, strikeTotal: bigint, expiry: bigint) => Promise<{ positions: Position[]; requests: Bid[] }>;
};

export default function OptionsChain(props: Props) {
  const { positions, requests, now, symbol, quoteSymbol, underlyingDecimals, quoteDecimals } = props;
  const [chosenExpiry, setChosenExpiry] = useState<bigint | null>(null);
  const [mobileSide, setMobileSide] = useState("calls");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [depth, setDepth] = useState<{ key: string; loading: boolean; positions: Position[]; requests: Bid[]; error?: string }>();
  const depthRequest = useRef(0);
  const dates = bookExpirations(positions, requests, now);
  const preferred = chosenExpiry ?? props.selected?.expiry;
  const expiry = preferred && dates.includes(preferred) ? preferred : dates[0];
  const onContext = props.onContext;
  useEffect(() => { if (expiry) onContext({ expiry }); }, [expiry, onContext]);
  const rows = expiry ? orderBook(positions, requests, expiry, now) : [];
  const price = (total: bigint, quantity: bigint) => readableNumber(perToken(total, quantity, underlyingDecimals, quoteDecimals), 2);
  function quoteButton(quote: Position | Bid | undefined, bid: boolean, count?: bigint) {
    if (!quote) return <span className="book-no-quote">—</span>;
    const total = bid ? quote.premium : optionPrice(quote as Position);
    const mine = (bid ? (quote as Bid).buyer : optionSeller(quote as Position)).toLowerCase() === props.account?.toLowerCase();
    const quantity = units(quote.underlyingAmount, underlyingDecimals);
    const key = bid ? String((quote as Bid).id) : (quote as Position).address;
    return <button key={key} className={`book-quote ${bid ? "bid" : "ask"} ${mine ? "own-quote" : ""}`}
      disabled={props.disabled || props.unavailable}
      data-request={bid ? key : undefined} data-offer={bid ? undefined : key}
      aria-label={`${mine ? "Manage your" : bid ? "Sell at" : "Buy at"} ${bid ? "bid" : "ask"}: ${quote.optionType === 0 ? "Call" : "Put"}, ${quantity} ${symbol}, premium total ${units(total, quoteDecimals)} ${quoteSymbol}${count ? `, ${count} contracts available` : ""}`}
      onClick={() => bid ? props.onBid((quote as Bid).id) : props.onSelect((quote as Position).address)}>
      <strong>{price(total, quote.underlyingAmount)}</strong>
      <small>{count ? `${count} contract${count === 1n ? "" : "s"}` : `${quantity} tokens`}{mine ? " · Yours" : !bid && quote.state === 1 ? " · Resale" : ""}</small>
    </button>;
  }
  function levels(quotes: (Position | Bid)[], bid: boolean, depth: boolean) {
    if (props.version !== 4) return depth ? quotes.map(q=>quoteButton(q,bid)) : quoteButton(quotes[0],bid);
    const groups = new Map<string,(Position|Bid)[]>();
    for (const q of quotes) { const key=String(bid?q.premium:optionPrice(q as Position)); groups.set(key,[...(groups.get(key)??[]),q]); }
    const entries=[...groups.values()];
    return (depth?entries:entries.slice(0,1)).map(group=>quoteButton(group[0],bid,group[0].bookSize ?? BigInt(group.length)));
  }
  const side = (quotes: BookSide, depth = false) => <div className="book-side"><div>{quotes.bids.length?levels(quotes.bids,true,depth):quoteButton(undefined,true)}</div><div>{quotes.asks.length?levels(quotes.asks,false,depth):quoteButton(undefined,false)}</div></div>;
  async function toggleDepth(row: (typeof rows)[number], series: Omit<OrderSeed, "side">) {
    if (expanded === row.key) { depthRequest.current++; setExpanded(null); return; }
    setExpanded(row.key);
    props.onContext(series);
    if (props.version !== 4 || !props.onDepth || !expiry) return;
    const request = ++depthRequest.current;
    const strikeTotal = row.numerator * 10n ** BigInt(underlyingDecimals) / row.denominator;
    setDepth({ key: row.key, loading: true, positions: [], requests: [] });
    try {
      const pages = await Promise.all(([0, 1] as const).map(kind => props.onDepth!(kind, strikeTotal, expiry)));
      if (depthRequest.current === request) setDepth({ key: row.key, loading: false, positions: pages.flatMap(page => page.positions), requests: pages.flatMap(page => page.requests) });
    } catch {
      if (depthRequest.current === request) setDepth({ key: row.key, loading: false, positions: [], requests: [], error: "Could not load depth. Close and retry." });
    }
  }
  return <section className="chain-panel" aria-label="Options chain">
    <div className="chain-heading"><div><h2>Option chain</h2><p className="fine">{openBids(requests, now).length} bid series · {positions.filter(p => isListed(p, now)).length} ask series · Premiums in {quoteSymbol} per token</p></div><button className="button" aria-label="Refresh options" disabled={props.loading || !props.configured || props.disabled} onClick={props.onRefresh}>↻</button></div>
    <div className="chain-controls"><div className="expiration-navigation"><span className="term-label">Expiration · UTC</span><div className="expiration-strip" role="group" aria-label="Expiration">
      {dates.map(date => <button key={String(date)} data-expiration={String(date)} aria-pressed={date === expiry} title={utcDeadline(date)} onClick={() => { setChosenExpiry(date); setExpanded(null); props.onContext({ expiry: date, strike: undefined, strikeRatio: undefined, quantity: undefined }); }}>
        <strong>{new Date(Number(date) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</strong><small>{utcDeadline(date).slice(11, 16)} UTC</small>
      </button>)}
    </div></div><label className="mobile-side-picker">Type<select aria-label="Option type" value={mobileSide} onChange={event => setMobileSide(event.target.value)}><option value="calls">Calls</option><option value="puts">Puts</option></select></label></div>
    {props.unavailable && <div className="market-connection" role="status"><strong>{props.configured ? "Could not refresh this market" : "Trading is not available on this network yet"}</strong><p>{props.configured ? "Reconnect to load current quotes." : "No contracts are configured. Order tickets are previews only."}</p></div>}
    <div className={`chain-table-wrap show-${mobileSide}`}><table className="chain-table bid-ask-table">
      <caption className="sr-only">Calls and puts by strike. Click a bid to sell a new option or an ask to buy. Each quote is for its full token quantity.</caption>
      <thead><tr><th className="call-heading" scope="col"><span className="side-title">Calls</span><div className="book-side book-labels"><span>Bid <small>Sell</small></span><span>Ask <small>Buy</small></span></div></th><th className="strike-heading" scope="col">Strike<small>{quoteSymbol} / token</small></th><th className="put-heading" scope="col"><span className="side-title">Puts</span><div className="book-side book-labels"><span>Bid <small>Sell</small></span><span>Ask <small>Buy</small></span></div></th></tr></thead>
      <tbody>{rows.map(row => {
        const opened = expanded === row.key;
        const first = row.calls.asks[0] ?? row.calls.bids[0] ?? row.puts.asks[0] ?? row.puts.bids[0];
        const series = { expiry, strike: unitInput(row.numerator, row.denominator, underlyingDecimals, quoteDecimals).value, strikeRatio: { total: row.numerator, quantity: row.denominator }, quantity: first ? units(first.underlyingAmount, underlyingDecimals) : "1" };
        const loaded = depth?.key === row.key && !depth.loading ? orderBook(depth.positions, depth.requests, expiry!, now).find(item => item.key === row.key) : undefined;
        return <Fragment key={row.key}><tr><td className="call-side">{side(row.calls)}</td><th scope="row" className="strike-cell"><button aria-label={`Strike ${price(row.numerator, row.denominator)}`} aria-expanded={opened} onClick={() => void toggleDepth(row, series)}>{price(row.numerator, row.denominator)}<small>{opened ? "Hide depth" : "Market depth"}</small></button></th><td className="put-side">{side(row.puts)}</td></tr>
          {opened && <tr className="book-depth"><td className="call-side">{side(loaded?.calls ?? row.calls, true)}</td><td className="strike-cell"><small>{depth?.key === row.key && depth.loading ? "Loading depth…" : depth?.key === row.key && depth.error ? depth.error : "Price levels"}</small></td><td className="put-side">{side(loaded?.puts ?? row.puts, true)}</td></tr>}
        </Fragment>;
      })}</tbody>
    </table></div>
    {!rows.length && !props.unavailable && <div className="chain-empty" role="status"><h3>{props.loading ? "Loading quotes…" : "No orders yet"}</h3><p>Post a bid to buy or an ask to sell a new option.</p><button className="button" disabled={props.disabled} onClick={() => props.onCreate("buy")}>Buy</button> <button className="button" disabled={props.disabled} onClick={() => props.onCreate("sell")}>Sell</button></div>}
    <div className="chain-foot"><span>Click bid to sell · Click ask to buy</span><span>{props.version === 4 ? "One contract per order · Onchain matching" : "Full lots · Manual acceptance"}</span></div>
    <details className="chain-disclosure"><summary>How to read this chain</summary><p>{props.version === 4 ? "Bid is the highest buy limit; ask is the lowest sell limit. Counts combine orders at the same price. Each order trades one token, at the resting price with oldest-first priority. Unmatched orders remain open until canceled or expiration. Resales share the same book." : <>Bid is the highest premium offered by a buyer; ask is the lowest premium a seller wants, per token. Quantities may differ: expand a strike to see every order. The ticket shows exact totals before approval. Buy / Sell posts your own price with no automatic matching. Selling a new call locks stock; selling a new put locks its exercise payment. Resale asks transfer an existing option. Manage your holdings and resales in Portfolio.</>}</p></details>
  </section>;
}
