import { formatUnits } from "viem";
import type { Position } from "./options.ts";
import { isListed, optionPrice } from "./options.ts";

export type StrikeRow = { key: string; numerator: bigint; denominator: bigint; calls: Position[]; puts: Position[] };
const compare = (a: bigint, b: bigint) => a < b ? -1 : a > b ? 1 : 0;
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
}
export function listedExpirations(positions: Position[], now: bigint): bigint[] {
  return [...new Set(positions.filter(p => isListed(p, now)).map(p => p.expiry))].sort(compare);
}
export function strikeRows(positions: Position[], expiry: bigint, now: bigint): StrikeRow[] {
  const rows = new Map<string, StrikeRow>();
  for (const position of positions) {
    if (!isListed(position, now) || position.expiry !== expiry || position.underlyingAmount <= 0n) continue;
    const divisor = gcd(position.strikeTotal, position.underlyingAmount);
    const numerator = position.strikeTotal / divisor;
    const denominator = position.underlyingAmount / divisor;
    const key = `${numerator}/${denominator}`;
    const row = rows.get(key) ?? { key, numerator, denominator, calls: [], puts: [] };
    (position.optionType === 0 ? row.calls : row.puts).push(position);
    rows.set(key, row);
  }
  for (const row of rows.values()) {
    const priceOrder = (a: Position, b: Position) => compare(a.underlyingAmount, b.underlyingAmount) || compare(optionPrice(a), optionPrice(b)) || a.address.localeCompare(b.address);
    row.calls.sort(priceOrder);
    row.puts.sort(priceOrder);
  }
  return [...rows.values()].sort((a, b) => compare(a.numerator * b.denominator, b.numerator * a.denominator));
}

// Normalize with bigint only. A displayed approximation never becomes a contract term.
export function perToken(total: bigint, quantity: bigint, underlyingDecimals: number, quoteDecimals: number): string {
  if (quantity <= 0n) return "—";
  const numerator = total * 10n ** BigInt(underlyingDecimals);
  return `${numerator % quantity ? "≈" : ""}${formatUnits(numerator / quantity, quoteDecimals)}`;
}

export type Bid = import("@stock-options-lab/sdk").Bid;
export type BookSide = { bids: Bid[]; asks: Position[] };
export type BookRow = { key: string; numerator: bigint; denominator: bigint; calls: BookSide; puts: BookSide };
export function openBids(bids: Bid[], now: bigint): Bid[] {
  return bids.filter(r => r.state === 0 && r.expiry > now && r.underlyingAmount > 0n);
}
export function bookExpirations(positions: Position[], bids: Bid[], now: bigint): bigint[] {
  return [...new Set([...listedExpirations(positions, now), ...openBids(bids, now).map(r => r.expiry)])].sort(compare);
}
export function orderBook(positions: Position[], bids: Bid[], expiry: bigint, now: bigint): BookRow[] {
  const rows = new Map<string, BookRow>();
  const add = (quote: Position | Bid, bid: boolean) => {
    if (quote.expiry !== expiry || quote.underlyingAmount <= 0n) return;
    const divisor = gcd(quote.strikeTotal, quote.underlyingAmount);
    const numerator = quote.strikeTotal / divisor, denominator = quote.underlyingAmount / divisor;
    const key = `${numerator}/${denominator}`;
    const row = rows.get(key) ?? { key, numerator, denominator, calls: { bids: [], asks: [] }, puts: { bids: [], asks: [] } };
    const side = quote.optionType === 0 ? row.calls : row.puts;
    if (bid) side.bids.push(quote as Bid); else side.asks.push(quote as Position);
    rows.set(key, row);
  };
  positions.filter(p => isListed(p, now)).forEach(p => add(p, false));
  openBids(bids, now).forEach(r => add(r, true));
  for (const row of rows.values()) for (const side of [row.calls, row.puts]) {
    // Compare exact per-token premiums, never rounded display prices or lot totals.
    side.bids.sort((a, b) => compare(b.premium * a.underlyingAmount, a.premium * b.underlyingAmount) || compare(a.id, b.id));
    side.asks.sort((a, b) => compare(optionPrice(a) * b.underlyingAmount, optionPrice(b) * a.underlyingAmount) || (a.orderId !== undefined && b.orderId !== undefined ? compare(a.orderId,b.orderId) : a.address.localeCompare(b.address)));
  }
  return [...rows.values()].sort((a, b) => compare(a.numerator * b.denominator, b.numerator * a.denominator));
}
