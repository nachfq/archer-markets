"use client";

import { useState } from "react";
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
  const [allDates, setAllDates] = useState(false);
  const [allStrikes, setAllStrikes] = useState(false);
  const [mobileSide, setMobileSide] = useState<"calls" | "puts">("calls");
  const [ownership, setOwnership] = useState<"all" | "others" | "mine">("all");
  const isMine = (offer: Position) => !!props.account && offer.writer.toLowerCase() === props.account.toLowerCase();
  const open = positions.filter(p => p.state === 0 && p.expiry > now);
  const ownCount = open.filter(isMine).length;
  const effectiveOwnership = props.account ? ownership : "all";
  const filtered = open.filter(p => effectiveOwnership === "all" || (effectiveOwnership === "mine" ? isMine(p) : !isMine(p)));
  const dates = listedExpirations(filtered, now);
  const preferred = chosenExpiry ?? selected?.expiry;
  const expiry = preferred && dates.includes(preferred) ? preferred : dates[0];
  const rows = expiry ? strikeRows(filtered, expiry, now) : [];
  const shownDates = allDates ? dates : dates.slice(0, 3);
  if (expiry && !shownDates.includes(expiry)) shownDates.push(expiry);
  const shownRows = allStrikes ? rows : rows.slice(0, 5);
  const price = (value: bigint, quantity: bigint) => readableNumber(perToken(value, quantity, underlyingDecimals, quoteDecimals), 2);

  function offerButton(offer: Position) {
    const active = selected?.address.toLowerCase() === offer.address.toLowerCase();
    const own = isMine(offer);
    const quantity = `${readableNumber(units(offer.underlyingAmount, underlyingDecimals))} ${symbol}`;
    const total = `${readableNumber(units(offer.strikeTotal, quoteDecimals), 2)} ${quoteSymbol}`;
    return <button key={offer.address} className={`chain-offer ${own ? "own-option" : "other-option"} ${active ? "chosen" : ""}`}
      data-offer={offer.address} data-owner={own ? "you" : "other"} aria-pressed={active} onClick={() => props.onSelect(offer.address)}
      aria-label={`${own ? "You wrote this" : `Written by ${short(offer.writer)}`}: ${offer.optionType === 0 ? "Call" : "Put"}, strike ${price(offer.strikeTotal, offer.underlyingAmount)}, lot ${quantity}, total premium ${units(offer.premium, quoteDecimals)} ${quoteSymbol}. ${own ? "Manage written option" : "Review purchase"}`}>
      <span className={`writer-badge ${own ? "is-you" : ""}`}>{own ? "You wrote this" : "Available to buy"}</span>
      <span className="quote-state">Awaiting buyer</span>
      <span className="quote-label">{own ? "You earn when bought" : "Cost to buy · total premium"}</span>
      <span className="quote-price">{readableNumber(units(offer.premium, quoteDecimals), 2)} <small>{quoteSymbol}</small></span>
      <span className="quote-right">{own ? "Buyer’s right" : "Your right if purchased"}: <strong>{offer.optionType === 0 ? "buy" : "sell"} {quantity}</strong></span>
      <span className="quote-exercise">For <strong>{total}</strong> at exercise</span>
      <span className="quote-unit">Premium: {price(offer.premium, offer.underlyingAmount)} {quoteSymbol} / token</span>
      {own ? <span className="quote-writer">Your collateral: {offer.optionType === 0 ? quantity : total} deposited</span> : <span className="quote-writer" title={offer.writer}>Written by {short(offer.writer)}</span>}
      <span className="quote-action">{active ? "✓ Selected · " : ""}{own ? "Manage written option →" : "Review purchase →"}</span>
    </button>;
  }
  function group(offers: Position[], own: boolean) {
    if (!offers.length) return null;
    return <div className="writer-group" key={own ? "you" : "others"}>{offerButton(offers[0])}{offers.length > 1 && <details className="other-quotes"><summary>{offers.length - 1} more {own ? "you wrote" : "from other writers"}</summary><p>Sorted by premium per token. Each option is a separate whole-lot purchase.</p>{offers.slice(1).map(offerButton)}</details>}</div>;
  }
  function side(offers: Position[]) {
    if (!offers.length) return <span className="no-quote">— <small>No written option</small></span>;
    return <>{group(offers.filter(p => !isMine(p)), false)}{group(offers.filter(isMine), true)}</>;
  }
  return <section className="chain-panel" aria-label="Options chain">
    <div className="chain-heading"><div><h2>Written options awaiting buyers</h2><p>Each option was written and collateralized by a wallet. Buy from another writer, or manage an option you wrote.</p></div><button className="icon-button" aria-label="Refresh options" disabled={props.loading || !props.configured} onClick={props.onRefresh}>↻</button></div>
    <div className="ownership-filters" aria-label="Filter by writer">
      <button aria-pressed={effectiveOwnership === "all"} onClick={() => setOwnership("all")}>All written options <span>{open.length}</span></button>
      <button aria-pressed={effectiveOwnership === "others"} disabled={!props.account} onClick={() => setOwnership("others")}>Available to buy <span>{props.account ? open.length - ownCount : "—"}</span></button>
      <button aria-pressed={effectiveOwnership === "mine"} disabled={!props.account} onClick={() => setOwnership("mine")}>My written options <span>{props.account ? ownCount : "—"}</span></button>
    </div>
    {!props.account && <p className="ownership-hint">Connect your wallet to identify options you wrote.</p>}
    <div className="expiry-instruction">Choose an expiration</div>
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
    {props.unavailable && <div className="market-connection" role="status"><strong>{props.configured ? "Could not refresh this market" : "Trading is not available on this network yet"}</strong><p>{props.configured ? "Displayed offers may be outdated. Reconnect before trading." : "You can explore the interface. No contracts are configured for trading."}</p>{props.configured ? <button className="button" onClick={props.onRefresh}>Retry connection</button> : <button className="button" onClick={props.onCreate}>Preview writing an option</button>}</div>}
    <div className={`chain-table-wrap show-${mobileSide}`}><table className="chain-table">
      <caption className="sr-only">Total premiums in {quoteSymbol}, with each offer&apos;s token quantity. Strike is the exercise price per token. Select an offer to review exact whole-lot amounts.</caption>
      <thead><tr><th className="call-heading" scope="col">Calls <small>Right to buy tokens</small></th><th className="strike-heading" scope="col">Strike<small>Exercise price<br />{quoteSymbol} / token</small></th><th className="put-heading" scope="col">Puts <small>Right to sell tokens</small></th></tr></thead>
      <tbody>{shownRows.map(row => <tr key={row.key}>
        <td className="call-side">{side(row.calls)}</td>
        <th scope="row" className="strike-cell">{price(row.numerator, row.denominator)}</th>
        <td className="put-side">{side(row.puts)}</td>
      </tr>)}</tbody>
    </table></div>
    {!rows.length && !props.unavailable && <div className="chain-empty" role={props.loading ? "status" : undefined}><span className="empty-cross">+</span><h3>{props.loading ? "Loading available options…" : effectiveOwnership === "mine" ? "You have no written options awaiting buyers" : effectiveOwnership === "others" ? "No options from other writers are available" : "No options are listed yet"}</h3><p>{props.loading ? "Checking the market. This may take a moment." : effectiveOwnership === "all" ? "Write an option and deposit its collateral for someone else to buy." : "Change the writer filter to see the rest of this market, or write an option."}</p>{!props.loading && <button className="button" onClick={props.onCreate}>Write option</button>}</div>}
    {rows.length > 5 && <button className="show-strikes" onClick={() => setAllStrikes(!allStrikes)}>{allStrikes ? "Show fewer strikes" : `Show all ${rows.length} strikes`}</button>}
    <div className="chain-foot"><span>{rows.length} {rows.length === 1 ? "strike" : "strikes"} · {dates.length} {dates.length === 1 ? "expiration" : "expirations"}</span><span>Manual exercise · No resale</span></div>
    <details className="chain-disclosure"><summary>How to compare these prices</summary><p>The total premium is what you pay to buy the entire option. Strike is the exercise price per token, paid or received later if you exercise. Offers can cover different quantities.</p><p>At each strike, options from other writers and options you wrote are shown separately. Each group starts with its lowest premium per token. ≈ means a rounded comparison; your order uses the exact totals shown in the review.</p></details>
  </section>;
}
