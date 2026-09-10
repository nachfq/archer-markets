"use client";

import { useEffect, useRef, useState } from "react";
import { FontIcon } from "./asset-ui";
import { listedExpirations, perToken, strikeRows } from "../lib/chain";
import { readableNumber, short, units, type Position } from "../lib/options";
import { utcDeadline } from "../lib/expirations";

type Props = {
  account?: string; positions: Position[]; now: bigint; selected?: Position; symbol: string;
  quoteSymbol: string; underlyingDecimals: number; quoteDecimals: number;
  loading: boolean; unavailable: boolean; configured: boolean; onSelect: (address: string) => void;
  onCreate: () => void; onRefresh: () => void;
};

export default function OptionsChain(props: Props) {
  const { positions, now, selected, symbol, quoteSymbol, underlyingDecimals, quoteDecimals } = props;
  const [chosenExpiry, setChosenExpiry] = useState<bigint | null>(null);
  const [strikeCount, setStrikeCount] = useState("10");
  const [mobileSide, setMobileSide] = useState("calls");
  const expirationStrip = useRef<HTMLDivElement>(null);
  const isMine = (offer: Position) => !!props.account && offer.writer.toLowerCase() === props.account.toLowerCase();
  const open = positions.filter(p => p.state === 0 && p.expiry > now);
  const dates = listedExpirations(open, now);
  const preferred = chosenExpiry ?? selected?.expiry;
  const expiry = preferred && dates.includes(preferred) ? preferred : dates[0];
  const rows = expiry ? strikeRows(open, expiry, now) : [];
  const shownRows = strikeCount === "all" ? rows : rows.slice(0, Number(strikeCount));
  const price = (value: bigint, quantity: bigint) => readableNumber(perToken(value, quantity, underlyingDecimals, quoteDecimals), 2);
  useEffect(() => {
    expirationStrip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [expiry]);

  function offerButton(offer: Position) {
    const active = selected?.address.toLowerCase() === offer.address.toLowerCase();
    const own = isMine(offer);
    const quantity = readableNumber(units(offer.underlyingAmount, underlyingDecimals));
    return <button key={offer.address} className={`chain-offer ${own ? "own-option" : "other-option"} ${active ? "chosen" : ""}`}
      data-offer={offer.address} data-owner={own ? "you" : "other"} aria-pressed={active} onClick={() => props.onSelect(offer.address)}
      aria-label={`${own ? "You wrote this" : `Written by ${short(offer.writer)}`}: ${offer.optionType === 0 ? "Call" : "Put"}, strike ${price(offer.strikeTotal, offer.underlyingAmount)}, lot ${quantity} ${symbol}, total premium ${units(offer.premium, quoteDecimals)} ${quoteSymbol}. ${own ? "Manage written option" : "Review purchase"}`}>
      <span className="quote-unit">{price(offer.premium, offer.underlyingAmount)}</span>
      <span className="quote-lot">{quantity}</span>
      <span className="quote-price">{readableNumber(units(offer.premium, quoteDecimals), 2)}</span>
      <span className="offer-action">{own && <span title="You wrote this option"><FontIcon name="user-pen" /></span>}{own ? "Manage" : "Buy"}</span>
    </button>;
  }
  function side(offers: Position[]) {
    if (!offers.length) return <span className="no-quote">— <span className="sr-only">No written option</span></span>;
    return offers.map(offerButton);
  }
  return <section className="chain-panel" aria-label="Options chain">
    <div className="chain-heading"><h2>Option chain <span className="count-badge">{open.length} offers</span></h2><button className="icon-button" aria-label="Refresh options" disabled={props.loading || !props.configured} onClick={props.onRefresh}>↻</button></div>
    <div className="chain-controls">
      <div className="expiration-navigation"><span className="term-label">Expiration · UTC</span><div className="expiration-controls">
        <button className="icon-button" aria-label="Earlier expirations" disabled={!dates.length} onClick={() => expirationStrip.current?.scrollBy({ left: -240, behavior: "smooth" })}><FontIcon name="chevron-left" /></button>
        <div className="expiration-strip" ref={expirationStrip} role="group" aria-label="Expiration">
          {!dates.length && <span className="fine">No expirations</span>}
          {dates.map(date => <button key={date.toString()} data-expiration={date.toString()} aria-pressed={date === expiry} title={utcDeadline(date)} onClick={() => setChosenExpiry(date)}>
            <strong>{new Date(Number(date) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</strong>
            <small>{date - now >= 86400n ? `${(date - now) / 86400n}d remaining` : date - now >= 3600n ? `${(date - now) / 3600n}h remaining` : `${(date - now) / 60n}m remaining`}</small>
          </button>)}
        </div>
        <button className="icon-button" aria-label="Later expirations" disabled={!dates.length} onClick={() => expirationStrip.current?.scrollBy({ left: 240, behavior: "smooth" })}><FontIcon name="chevron-right" /></button>
      </div></div>
      <label className="mobile-side-picker">Type<select aria-label="Option type" value={mobileSide} onChange={event => setMobileSide(event.target.value)}><option value="calls">Calls</option><option value="puts">Puts</option></select></label>
    </div>
    {props.unavailable && <div className="market-connection" role="status"><strong>{props.configured ? "Could not refresh this market" : "Trading is not available on this network yet"}</strong><p>{props.configured ? "Offers may be outdated. Reconnect before trading." : "No contracts are configured. You can preview writing an option."}</p>{props.configured ? <button className="button" onClick={props.onRefresh}>Retry connection</button> : <button className="button" onClick={props.onCreate}>Preview writing an option</button>}</div>}
    <div className={`chain-table-wrap show-${mobileSide}`}><table className="chain-table">
      <caption className="sr-only">Premiums in {quoteSymbol}. Each offer is a whole lot of {symbol} tokens. Strike is the exercise price per token.</caption>
      <thead><tr><th className="call-heading" scope="col"><span className="side-title">Calls <small>Right to buy</small></span><span className="quote-columns"><span>Premium / token</span><span>Lot</span><span>Total premium</span><span className="sr-only">Action</span></span></th><th className="strike-heading" scope="col">Strike<small>{quoteSymbol} / token</small><select aria-label="Strikes" value={strikeCount} onChange={event => setStrikeCount(event.target.value)}><option value="5">5 strikes</option><option value="10">10 strikes</option><option value="all">All strikes</option></select></th><th className="put-heading" scope="col"><span className="side-title">Puts <small>Right to sell</small></span><span className="quote-columns"><span>Premium / token</span><span>Lot</span><span>Total premium</span><span className="sr-only">Action</span></span></th></tr></thead>
      <tbody>{shownRows.map(row => <tr key={row.key}><td className="call-side">{side(row.calls)}</td><th scope="row" className="strike-cell">{price(row.numerator, row.denominator)}</th><td className="put-side">{side(row.puts)}</td></tr>)}</tbody>
    </table></div>
    {!rows.length && !props.unavailable && <div className="chain-empty" role={props.loading ? "status" : undefined}><h3>{props.loading ? "Loading available options…" : "No options are listed yet"}</h3><p>{props.loading ? "Reading onchain offers." : "Create a collateralized offer for another trader to buy."}</p>{!props.loading && <button className="button" onClick={props.onCreate}>Write option</button>}</div>}
    <div className="chain-foot"><span>{shownRows.length} of {rows.length} strikes · Premiums in {quoteSymbol}</span><span>Whole lots · Manual exercise · No resale</span></div>
    <details className="chain-disclosure"><summary>About these quotes</summary><p>Total premium buys the entire lot. Strike is per token; the exercise total is shown in review. All offers are sorted by premium per token. Tinted offers with a writer icon are your own. ≈ marks a comparison approximation; transactions use exact totals.</p></details>
  </section>;
}
