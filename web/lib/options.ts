import { formatUnits } from "viem";
import { parseAmount, ProtocolError, type Option } from "@stock-options-lab/sdk";
export type Position = Option;
export const optionPrice = (p: Position) => p.state === 1 && (p.resalePrice ?? 0n) > 0n ? p.resalePrice! : p.trades?.at(-1)?.price ?? p.premium;
export const optionSeller = (p: Position) => p.state === 1 ? p.buyer : p.writer;
export const isListed = (p: Position, now: bigint) => p.expiry > now && (p.state === 0 || (p.state === 1 && (p.resalePrice ?? 0n) > 0n));
export function optionPayments(p: Position, account?: string): { paid?: bigint; received?: bigint; asking?: bigint } {
  const owner = account?.toLowerCase();
  if (p.trades?.length) {
    const paid = p.trades.filter(t => t.buyer.toLowerCase() === owner).reduce((sum, t) => sum + t.price, 0n);
    const received = p.trades.filter(t => t.seller.toLowerCase() === owner).reduce((sum, t) => sum + t.price, 0n);
    return { ...(paid ? { paid } : {}), ...(received ? { received } : {}) };
  }
  if (p.state === 0) return { asking: p.premium };
  if (/^0x0{40}$/i.test(p.buyer)) return {}; // An unsold canceled/expired option never paid premium.
  return p.writer.toLowerCase() === owner ? { received: p.premium } : p.buyer.toLowerCase() === owner ? { paid: p.premium } : {};
}
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
  return buyer ? ["exercise"] : !writer && (position.resalePrice ?? 0n) > 0n ? ["buyResale"] : [];
}
export function status(position: Position, now: bigint) {
  if (position.state === 2) return "Exercised";
  if (position.state === 3) return "Canceled";
  if (position.state === 4) return "Collateral reclaimed";
  if (now >= position.expiry) return "Expired";
  return position.state === 0 ? "Open" : (position.resalePrice ?? 0n) > 0n ? "Listed for resale" : "Purchased";
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
