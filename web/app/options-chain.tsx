"use client";

import { useState } from "react";
import { listedExpirations, perToken, strikeRows } from "../lib/chain";
import { units, type Position } from "../lib/options";
import { utcDeadline } from "../lib/expirations";

type Props = {
  positions: Position[]; now: bigint; selected?: Position; symbol: string;
  quoteSymbol: string; underlyingDecimals: number; quoteDecimals: number;
  loading: boolean; unavailable: boolean; onSelect: (address: string) => void;
  onCreate: () => void; onRefresh: () => void;
};

export default function OptionsChain(props: Props) {
  const { positions, now, selected, symbol, quoteSymbol, underlyingDecimals, quoteDecimals } = props;
  const [chosenExpiry, setChosenExpiry] = useState<bigint | null>(null);
  const [allDates, setAllDates] = useState(false);
  const [allStrikes, setAllStrikes] = useState(false);
  const dates = listedExpirations(positions, now);
  const preferred = chosenExpiry ?? selected?.expiry;
  const expiry = preferred && dates.includes(preferred) ? preferred : dates[0];
  const rows = expiry ? strikeRows(positions, expiry, now) : [];
  const shownDates = allDates ? dates : dates.slice(0, 3);
  if (expiry && !shownDates.includes(expiry)) shownDates.push(expiry);
  const shownRows = allStrikes ? rows : rows.slice(0, 5);
  const price = (value: bigint, quantity: bigint) => perToken(value, quantity, underlyingDecimals, quoteDecimals);

  function offerButton(offer: Position) {
    const active = selected?.address.toLowerCase() === offer.address.toLowerCase();
    return <button key={offer.address} className={`chain-offer ${active ? "chosen" : ""}`}
      data-offer={offer.address} aria-pressed={active} onClick={() => props.onSelect(offer.address)}
      aria-label={`${offer.optionType === 0 ? "Call" : "Put"}, strike ${price(offer.strikeTotal, offer.underlyingAmount)}, lot ${units(offer.underlyingAmount, underlyingDecimals)} ${symbol}, total premium ${units(offer.premium, quoteDecimals)} ${quoteSymbol}`}>
      <span className="quote-price">{price(offer.premium, offer.underlyingAmount)}</span>
      <span className="quote-lot">{units(offer.underlyingAmount, underlyingDecimals)} tokens</span>
      <span className="quote-action">Review ↗</span>
    </button>;
  }
  function side(offers: Position[]) {
    if (!offers.length) return <span className="no-quote">— <small>No offer</small></span>;
    return <>{offerButton(offers[0])}{offers.length > 1 && <details className="other-quotes"><summary>+{offers.length - 1} offers</summary>{offers.slice(1).map(offerButton)}</details>}</>;
  }
  return <section className="chain-panel" aria-label="Options chain">
    <div className="chain-heading"><div><h2>Options chain</h2><p>{symbol} / {quoteSymbol} <span>· Fully collateralized</span></p></div><button className="icon-button" aria-label="Refresh options" disabled={props.loading || props.unavailable} onClick={props.onRefresh}>↻</button></div>
    <div className="expiry-strip" aria-label="Listed expirations">
      {shownDates.map(date => <button key={date.toString()} className={expiry === date ? "active" : ""} aria-pressed={expiry === date}
        title={utcDeadline(date)} onClick={() => { setChosenExpiry(date); setAllStrikes(false); }}>
        <strong>{new Date(Number(date) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</strong>
        <small>{Math.max(0, Math.ceil(Number(date - now) / 86400))}d · {new Date(Number(date) * 1000).toISOString().slice(11, 16)} UTC</small>
      </button>)}
      {!dates.length && <span className="empty-expiry">No listed expirations</span>}
      {(dates.length > shownDates.length || allDates) && <button className="more-dates" onClick={() => setAllDates(!allDates)}>{allDates ? "Fewer dates" : `+${dates.length - shownDates.length} dates`}</button>}
    </div>
    <div className="chain-table-wrap"><table className="chain-table">
      <caption className="sr-only">Calls and puts by strike. Premium and strike are per token in {quoteSymbol}. Select an offer to review exact whole-lot amounts.</caption>
      <thead><tr><th className="call-heading" scope="col">Calls <small>Ask / token · Lot</small></th><th className="strike-heading" scope="col">Strike<small>{quoteSymbol} / token</small></th><th className="put-heading" scope="col">Puts <small>Ask / token · Lot</small></th></tr></thead>
      <tbody>{shownRows.map(row => <tr key={row.key}>
        <td className="call-side">{side(row.calls)}</td>
        <th scope="row" className="strike-cell">{price(row.numerator, row.denominator)}</th>
        <td className="put-side">{side(row.puts)}</td>
      </tr>)}</tbody>
    </table></div>
    {!rows.length && <div className="chain-empty"><span className="empty-cross">+</span><h3>{props.loading ? "Reading offers…" : props.unavailable ? "Market connection unavailable" : "This market starts with an offer."}</h3><p>{props.loading ? "Fetching contracts from the configured factory." : props.unavailable ? "Live quotes require a configured, reachable deployment." : "Only funded offers appear here. Write a call or put to start the chain."}</p><button className="button dark" onClick={props.onCreate}>Create offer</button></div>}
    {rows.length > 5 && <button className="show-strikes" onClick={() => setAllStrikes(!allStrikes)}>{allStrikes ? "Show fewer strikes" : `Show all ${rows.length} strikes`}</button>}
    <div className="chain-foot"><span>{rows.length} strikes · {dates.length} expirations in loaded offers</span><span>Primary offers only</span></div>
    <p className="chain-disclosure">Quotes are writer asks, not executed trades. Lots may differ. ≈ indicates a rounded display; the trade ticket shows exact totals. No resale market.</p>
  </section>;
}
