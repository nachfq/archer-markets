import test from "node:test";
import assert from "node:assert/strict";
import {
  actions,
  amount,
  expiration,
  status,
  type Position,
} from "../lib/options.ts";
const writer = "0x1111111111111111111111111111111111111111";
const buyer = "0x2222222222222222222222222222222222222222";
const option: Position = {
  address: writer,
  writer,
  buyer,
  underlyingAmount: 500000000000000001n,
  strikeTotal: 100000001n,
  premium: 5000001n,
  expiry: 2000n,
  optionType: 0,
  state: 0,
};
test("amount parsing preserves all token decimals without floating point", () => {
  assert.equal(amount("0.500000000000000001", 18), option.underlyingAmount);
  assert.equal(amount("100.000001", 6), option.strikeTotal);
  assert.equal(amount("5.000001", 6), option.premium);
  for (const value of ["0", "-1", "1e6", "1,25", ".5", "0.0000001"])
    assert.throws(() => amount(value, 6));
  assert.throws(() => amount((2n ** 256n).toString(), 18));
});
test("creation rejects invalid and elapsed expiry", () => {
  assert.equal(
    expiration("2030-01-01T00:00:01Z", Date.parse("2030-01-01T00:00:00Z")),
    1893456001n,
  );
  for (const date of ["bad", "2030-01-01T00:00:00Z", "2029-01-01T00:00:00Z"])
    assert.throws(() => expiration(date, Date.parse("2030-01-01T00:00:00Z")));
});
test("writer cannot buy own offer and buyer cannot withdraw seller collateral", () => {
  assert.deepEqual(actions(option, writer, 1999n), ["cancel"]);
  assert.deepEqual(actions(option, buyer, 1999n), ["buy"]);
  assert.deepEqual(actions({ ...option, state: 1 }, writer, 1999n), []);
  assert.deepEqual(actions({ ...option, state: 1 }, buyer, 1999n), [
    "exercise",
  ]);
  assert.deepEqual(actions(option, undefined, 1999n), []);
});
test("at exact expiry exercise disappears and only writer recovery is available", () => {
  for (const optionType of [0, 1])
    for (const state of [0, 1]) {
      const position = { ...option, optionType, state };
      assert.deepEqual(actions(position, writer, 2000n), ["reclaimExpired"]);
      assert.deepEqual(actions(position, buyer, 2000n), []);
      assert.equal(status(position, 2000n), "Expired");
    }
  for (const state of [2, 3, 4])
    for (const account of [writer, buyer])
      assert.deepEqual(actions({ ...option, state }, account, 3000n), []);
});
