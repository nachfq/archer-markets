import { formatUnits } from "viem";
import { amount } from "./options.ts";
import { validateLotQuantity } from "@stock-options-lab/sdk";

export type PriceRatio = { total: bigint; quantity: bigint };
const maxUint256 = (1n << 256n) - 1n;
// Decimal multiplication is exact. Never round a payment to fit token precision.
export function orderTotals(quantity: string, strike: string, premium: string, stockDecimals: number, quoteDecimals: number, references?: { strike?: PriceRatio; premium?: PriceRatio }) {
  const q = amount(quantity, stockDecimals);
  validateLotQuantity(q, stockDecimals);
  const total = (price: string, label: string, reference?: PriceRatio) => {
    if (!/^\d+(\.\d{1,36})?$/.test(price) || price.length > 116) throw new Error(`Enter a positive ${label} per token.`);
    const [whole, fraction = ""] = price.split(".");
    const numerator = reference ? q * reference.total : q * BigInt(whole + fraction) * 10n ** BigInt(quoteDecimals);
    const denominator = reference ? reference.quantity : 10n ** BigInt(stockDecimals + fraction.length);
    if (numerator % denominator) throw new Error(`${label} × quantity needs more than ${quoteDecimals} payment decimals. Adjust the price or quantity; no rounding is applied.`);
    const result = numerator / denominator;
    if (result <= 0n || result > maxUint256) throw new Error(`${label} total is outside the supported range.`);
    return result;
  };
  return { quantity: q, strikeTotal: total(strike, "Strike", references?.strike), premium: total(premium, "Premium", references?.premium) };
}
export function unitInput(total: bigint, quantity: bigint, stockDecimals: number, quoteDecimals: number) {
  const scale = 10n ** 18n;
  const numerator = total * 10n ** BigInt(stockDecimals) * scale;
  return { value: formatUnits(numerator / quantity, quoteDecimals + 18), approximate: numerator % quantity !== 0n };
}
export type OrderSeed = { side: "buy" | "sell"; kind?: number; expiry?: bigint; strike?: string; strikeRatio?: PriceRatio; quantity?: string };
