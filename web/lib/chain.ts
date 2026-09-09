import { formatUnits } from "viem";
import type { Position } from "./options.ts";

export type StrikeRow = { key: string; numerator: bigint; denominator: bigint; calls: Position[]; puts: Position[] };
const compare = (a: bigint, b: bigint) => a < b ? -1 : a > b ? 1 : 0;
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
}
export function listedExpirations(positions: Position[], now: bigint): bigint[] {
  return [...new Set(positions.filter(p => p.state === 0 && p.expiry > now).map(p => p.expiry))].sort(compare);
}
export function strikeRows(positions: Position[], expiry: bigint, now: bigint): StrikeRow[] {
  const rows = new Map<string, StrikeRow>();
  for (const position of positions) {
    if (position.state !== 0 || position.expiry !== expiry || position.expiry <= now || position.underlyingAmount <= 0n) continue;
    const divisor = gcd(position.strikeTotal, position.underlyingAmount);
    const numerator = position.strikeTotal / divisor;
    const denominator = position.underlyingAmount / divisor;
    const key = `${numerator}/${denominator}`;
    const row = rows.get(key) ?? { key, numerator, denominator, calls: [], puts: [] };
    (position.optionType === 0 ? row.calls : row.puts).push(position);
    rows.set(key, row);
  }
  for (const row of rows.values()) {
    const priceOrder = (a: Position, b: Position) => compare(a.premium * b.underlyingAmount, b.premium * a.underlyingAmount) || a.address.localeCompare(b.address);
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
