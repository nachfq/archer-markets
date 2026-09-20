import test from "node:test";
import assert from "node:assert/strict";
import { orderTotals, unitInput } from "../lib/order-ticket.ts";

test("V4 ticket fixes quantity at one token and preserves exact payment totals", () => {
  assert.deepEqual(orderTotals("300", "10", 18, 6), {
    quantity: 10n ** 18n,
    strikeTotal: 300_000_000n,
    premium: 10_000_000n,
  });
  assert.deepEqual(orderTotals("260.288065", "3.806575", 18, 6), {
    quantity: 10n ** 18n,
    strikeTotal: 260_288_065n,
    premium: 3_806_575n,
  });
});

test("payment conversion rejects excessive precision, invalid values and overflow", () => {
  for (const args of [["300", "0.0000001"], ["0", "1"], ["1", "-2"], ["1", "1e6"], ["1", "9".repeat(80)]]) {
    assert.throws(() => orderTotals(args[0], args[1], 18, 6));
  }
});

test("large totals and token precisions never pass through floating point", () => {
  assert.equal(orderTotals("9007199254740993.000001", "1", 18, 6).strikeTotal, 9007199254740993000001n);
  assert.equal(orderTotals("123.45", "1.2", 6, 18).strikeTotal, 123450000000000000000n);
});

test("display conversion flags repeating unit prices without changing source totals", () => {
  assert.deepEqual(unitInput(300_000_000n, 10n ** 18n, 18, 6), { value: "300", approximate: false });
  assert.equal(unitInput(1_000_000n, 3n * 10n ** 18n, 18, 6).approximate, true);
});
