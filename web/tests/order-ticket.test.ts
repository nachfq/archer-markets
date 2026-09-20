import test from "node:test";
import assert from "node:assert/strict";
import { orderTotals, unitInput } from "../lib/order-ticket.ts";
test("per-token entry computes full premium and exercise payment for fractional lots", () => {
  assert.deepEqual(orderTotals("0.2", "300", "10", 18, 6), { quantity: 200000000000000000n, strikeTotal: 60000000n, premium: 2000000n });
  assert.deepEqual(orderTotals("1.2", "260.288065", "3.806575", 18, 6), { quantity: 1200000000000000000n, strikeTotal: 312345678n, premium: 4567890n });
});
test("amount conversion rejects precision loss, non-lots, invalid prices and overflow", () => {
  for (const args of [["0.2","300","0.000001"], ["0.15","300","10"], ["1","0","1"], ["1","1","-2"], ["1","1","1e6"], ["1","1","9".repeat(80)]]) assert.throws(() => orderTotals(args[0], args[1], args[2], 18, 6));
  assert.throws(() => orderTotals("1" + "0".repeat(70), "0.000000000000000000000000000000000001", "0.000000000000000000000000000000000001", 18, 6), /supported range/);
  assert.equal(orderTotals("10", "1.0000001", "0.0000001", 18, 6).premium, 1n);
});
test("large values and token precisions never pass through floating point", () => {
  assert.equal(orderTotals("9007199254740993", "2", "1", 18, 6).strikeTotal, 18014398509481986000000n);
  assert.equal(orderTotals("0.1", "123.45", "1.2", 6, 18).strikeTotal, 12345000000000000000n);
});
test("prefilled quotes flag repeating unit prices instead of silently changing source totals", () => {
  assert.deepEqual(unitInput(60000000n, 200000000000000000n, 18, 6), {value:"300", approximate:false});
  assert.equal(unitInput(1000000n, 3000000000000000000n, 18, 6).approximate, true);
});
test("changing only quantity or side preserves exact rational prices from the selected quote", () => {
  const quantity = 1200000000000000000n, total = 312345680n;
  const displayed = unitInput(total, quantity, 18, 6).value;
  assert.equal(orderTotals("0.6", displayed, "10", 18, 6, {strike:{total,quantity}}).strikeTotal, 156172840n);
  assert.throws(() => orderTotals("1", displayed, "10", 18, 6, {strike:{total,quantity}}), /no rounding/);
  assert.equal(orderTotals("1.2", displayed, "3.806575", 18, 6, {strike:{total,quantity}}).strikeTotal, total);
});
