import test from "node:test";
import assert from "node:assert/strict";
import { readableNumber } from "../lib/options.ts";
test("display grouping retains exact large values, fractional lots and approximation markers", () => {
  assert.equal(readableNumber("30000", 2), "30,000.00");
  assert.equal(readableNumber("0.000001", 2), "0.000001");
  assert.equal(readableNumber("1000000000000000000.000000000000000001"), "1,000,000,000,000,000,000.000000000000000001");
  assert.equal(readableNumber("≈300", 2), "≈300.00");
  assert.equal(readableNumber("—", 2), "—");
});
