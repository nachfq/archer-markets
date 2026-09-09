"use client";

import { useState } from "react";
import { listedExpirations, perToken, strikeRows } from "../lib/chain";
import { readableNumber, units, type Position } from "../lib/options";
import { utcDeadline } from "../lib/expirations";

type Props = {
  positions: Position[]; now: bigint; selected?: Position; symbol: string;
  quoteSymbol: string; underlyingDecimals: number; quoteDecimals: number;
  loading: boolean; unavailable: boolean; configured: boolean; onSelect: (address: string) => void;
  onCreate: () => void; onRefresh: () => void;
};

export default function OptionsChain(props: Props) {
  const { positions, now, selected, symbol, quoteSymbol, underlyingDecimals, quoteDecimals } = props;
  const [chosenExpiry, setChosenExpiry] = useState<bigint | null>(null);
  const [allDates, setAllDates] = useState(false);
  const [allStrikes, setAllStrikes] = useState(false);
  const [mobileSide, setMobileSide] = useState<"calls" | "puts">("calls");
  const dates = listedExpirations(positions, now);
  const preferred = chosenExpiry ?? selected?.expiry;
  const expiry = preferred && dates.includes(preferred) ? preferred : dates[0];
  const rows = expiry ? strikeRows(positions, expiry, now) : [];
  const shownDates = allDates ? dates : dates.slice(0, 3);
  if (expiry && !shownDates.includes(expiry)) shownDates.push(expiry);
  const shownRows = allStrikes ? rows : rows.slice(0, 5);
  const price = (value: bigint, quantity: bigint) => readableNumber(perToken(value, quantity, underlyingDecimals, quoteDecimals), 2);

  function offerButton(offer: Position) {
    const active = selected?.address.toLowerCase() === offer.address.toLowerCase();
    return <button key={offer.address} className={`chain-offer ${active ? "chosen" : ""}`}
      data-offer={offer.address} aria-pressed={active} onClick={() => props.onSelect(offer.address)}
      aria-label={`${offer.optionType === 0 ? "Call" : "Put"}, strike ${price(offer.strikeTotal, offer.underlyingAmount)}, lot ${units(offer.underlyingAmount, underlyingDecimals)} ${symbol}, total premium ${units(offer.premium, quoteDecimals)} ${quoteSymbol}`}>
      <span className="quote-label">Total premium</span>
      <span className="quote-price">{readableNumber(units(offer.premium, quoteDecimals), 2)} <small>{quoteSymbol}</small></span>
      <span className="quote-lot">For {readableNumber(units(offer.underlyingAmount, underlyingDecimals))} {offer.underlyingAmount === 10n ** BigInt(underlyingDecimals) ? "token" : "tokens"}</span>
      <span className="quote-unit">{price(offer.premium, offer.underlyingAmount)} / token</span>
      <span className="quote-action">{active ? "✓ Selected" : "Review option →"}</span>
    </button>;
  }
  function side(offers: Position[]) {
    if (!offers.length) return <span className="no-quote">— <small>No offer</small></span>;
    return <>{offerButton(offers[0])}{offers.length > 1 && <details className="other-quotes"><summary>{offers.length - 1} more {offers.length === 2 ? "offer" : "offers"}</summary><p>Sorted by premium per token. Compare the lot sizes.</p>{offers.slice(1).map(offerButton)}</details>}</>;
  }
  return <section className="chain-panel" aria-label="Options chain">
    <div className="chain-heading"><div><h2>Choose an expiration</h2><p>Then select a call or put to review what you pay.</p></div><button className="icon-button" aria-label="Refresh options" disabled={props.loading || !props.configured} onClick={props.onRefresh}>↻</button></div>
    <div className="expiry-strip" aria-label="Listed expirations">
      {shownDates.map(date => <button key={date.toString()} className={expiry === date ? "active" : ""} aria-pressed={expiry === date}
        title={utcDeadline(date)} onClick={() => { setChosenExpiry(date); setAllStrikes(false); }}>
        <strong>{new Date(Number(date) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</strong>
        <small>{Math.max(0, Math.ceil(Number(date - now) / 86400))}d · {new Date(Number(date) * 1000).toISOString().slice(11, 16)} UTC</small>
      </button>)}
      {!dates.length && <span className="empty-expiry">No listed expirations</span>}
      {(dates.length > shownDates.length || allDates) && <button className="more-dates" onClick={() => setAllDates(!allDates)}>{allDates ? "Fewer dates" : `+${dates.length - shownDates.length} dates`}</button>}
    </div>
    <div className="mobile-side-picker" aria-label="Option type"><button aria-pressed={mobileSide === "calls"} onClick={() => setMobileSide("calls")}>Calls · Buy right</button><button aria-pressed={mobileSide === "puts"} onClick={() => setMobileSide("puts")}>Puts · Sell right</button></div>
    {props.unavailable && <div className="market-connection" role="status"><strong>{props.configured ? "Could not refresh this market" : "Trading is not available on this network yet"}</strong><p>{props.configured ? "Displayed offers may be outdated. Reconnect before trading." : "You can explore the interface. No contracts are configured for trading."}</p>{props.configured ? <button className="button" onClick={props.onRefresh}>Retry connection</button> : <button className="button" onClick={props.onCreate}>Preview an offer</button>}</div>}
    <div className={`chain-table-wrap show-${mobileSide}`}><table className="chain-table">
      <caption className="sr-only">Total premiums in {quoteSymbol}, with each offer&apos;s token quantity. Strike is the exercise price per token. Select an offer to review exact whole-lot amounts.</caption>
      <thead><tr><th className="call-heading" scope="col">Calls <small>Right to buy tokens</small></th><th className="strike-heading" scope="col">Strike<small>Exercise price<br />{quoteSymbol} / token</small></th><th className="put-heading" scope="col">Puts <small>Right to sell tokens</small></th></tr></thead>
      <tbody>{shownRows.map(row => <tr key={row.key}>
        <td className="call-side">{side(row.calls)}</td>
        <th scope="row" className="strike-cell">{price(row.numerator, row.denominator)}</th>
        <td className="put-side">{side(row.puts)}</td>
      </tr>)}</tbody>
    </table></div>
    {!rows.length && !props.unavailable && <div className="chain-empty" role={props.loading ? "status" : undefined}><span className="empty-cross">+</span><h3>{props.loading ? "Loading available options…" : "No options are listed yet"}</h3><p>{props.loading ? "Checking the market. This may take a moment." : "Create a fully funded offer for someone else to buy."}</p>{!props.loading && <button className="button" onClick={props.onCreate}>Create offer</button>}</div>}
    {rows.length > 5 && <button className="show-strikes" onClick={() => setAllStrikes(!allStrikes)}>{allStrikes ? "Show fewer strikes" : `Show all ${rows.length} strikes`}</button>}
    <div className="chain-foot"><span>{rows.length} {rows.length === 1 ? "strike" : "strikes"} · {dates.length} {dates.length === 1 ? "expiration" : "expirations"}</span><span>Manual exercise · No resale</span></div>
    <details className="chain-disclosure"><summary>How to compare these prices</summary><p>The total premium is what you pay to buy the entire option. Strike is the exercise price per token, paid or received later if you exercise. Offers can cover different quantities.</p><p>The lowest premium per token appears first at each strike. ≈ means a rounded comparison; your order uses the exact totals shown in the review.</p></details>
  </section>;
}
