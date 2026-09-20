import { formatUnits } from "viem";
import { amount } from "./options.ts";

export function orderTotals(strike: string, premium: string, stockDecimals: number, quoteDecimals: number) {
  return {
    quantity: 10n ** BigInt(stockDecimals),
    strikeTotal: amount(strike, quoteDecimals),
    premium: amount(premium, quoteDecimals),
  };
}
export function unitInput(total: bigint, quantity: bigint, stockDecimals: number, quoteDecimals: number) {
  const scale = 10n ** 18n;
  const numerator = total * 10n ** BigInt(stockDecimals) * scale;
  return { value: formatUnits(numerator / quantity, quoteDecimals + 18), approximate: numerator % quantity !== 0n };
}
export type OrderSeed = { side: "buy" | "sell"; kind?: number; expiry?: bigint; strike?: string };
