import { formatUnits, type Address } from "viem";
import { parseAmount, ProtocolError } from "@stock-options-lab/sdk";
export type Position = {
  address: Address;
  writer: Address;
  buyer: Address;
  underlyingAmount: bigint;
  strikeTotal: bigint;
  premium: bigint;
  expiry: bigint;
  optionType: number;
  state: number;
};
export function amount(value: string, decimals: number): bigint {
  return parseAmount(value, decimals);
}
export function expiration(value: string, now = Date.now()): bigint {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time) || time <= now)
    throw new ProtocolError("INVALID_TERMS", "Choose a future expiration.", "The deadline must be after the current chain time.");
  const seconds = BigInt(Math.floor(time / 1000));
  if (seconds <= BigInt(Math.floor(now / 1000)))
    throw new ProtocolError("INVALID_TERMS", "Choose a future expiration.", "The deadline must be after the current chain time.");
  return seconds;
}
export function actions(
  position: Position,
  account: string | undefined,
  now: bigint,
): string[] {
  if (!account) return [];
  const writer = position.writer.toLowerCase() === account.toLowerCase();
  const buyer = position.buyer.toLowerCase() === account.toLowerCase();
  if (position.state > 1) return [];
  if (now >= position.expiry) return writer ? ["reclaimExpired"] : [];
  if (position.state === 0) return writer ? ["cancel"] : ["buy"];
  return buyer ? ["exercise"] : [];
}
export function status(position: Position, now: bigint) {
  if (position.state === 2) return "Exercised";
  if (position.state === 3) return "Canceled";
  if (position.state === 4) return "Collateral reclaimed";
  if (now >= position.expiry) return "Expired";
  return position.state === 0 ? "Open" : "Purchased";
}
export const units = (value: bigint, decimals: number) =>
  formatUnits(value, decimals);
// Display-only grouping: keep every fractional digit and never convert through Number.
export function readableNumber(value: string, minimumFraction = 0): string {
  const approximate = value.startsWith("≈");
  const raw = approximate ? value.slice(1) : value;
  if (!/^\d+(\.\d+)?$/.test(raw)) return value;
  const [integer, fraction = ""] = raw.split(".");
  const digits = fraction.padEnd(minimumFraction, "0");
  return `${approximate ? "≈" : ""}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${digits ? `.${digits}` : ""}`;
}
export const short = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
