import test from "node:test";
import assert from "node:assert/strict";
import { listedExpirations, perToken, strikeRows } from "../lib/chain.ts";
import { optionPayments, type Position } from "../lib/options.ts";
const address = "0x1111111111111111111111111111111111111111";
const base: Position = { address, writer: address, buyer: address, underlyingAmount: 10n ** 18n, strikeTotal: 300_000_000n, premium: 6_000_000n, expiry: 2000n, optionType: 0, state: 0 };
test("unit prices distinguish exact lot totals, fractional quantities, and missing quantities", () => {
  assert.equal(perToken(1000_000_000n, 10n * 10n ** 18n, 18, 6), "100");
  assert.equal(perToken(50_000_000n, 10n * 10n ** 18n, 18, 6), "5");
  assert.equal(perToken(25_000_000n, 250_000n, 6, 6), "100");
  assert.equal(perToken(0n, 1n, 0, 18), "0");
  assert.equal(perToken(10n, 0n, 18, 6), "—");
  assert.equal(perToken(1n, 3n, 0, 6), "≈0");
});
test("chain includes only open unexpired offers and keeps exact timestamps distinct", () => {
  const positions = [base, { ...base, expiry: 1000n }, { ...base, state: 1, expiry: 3000n }, { ...base, expiry: 2001n }];
  assert.deepEqual(listedExpirations(positions, 1000n), [2000n, 2001n]);
  assert.equal(strikeRows(positions, 2000n, 1000n)[0].calls.length, 1);
  assert.deepEqual(strikeRows(positions, 2000n, 2000n), []);
});
test("equivalent per-token strikes group across lots without combining independent offers", () => {
  const rows = strikeRows([base, { ...base, underlyingAmount: 100n * 10n ** 18n, strikeTotal: 30_000_000_000n, premium: 500_000_000n }, { ...base, optionType: 1 }], 2000n, 1000n);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].calls.length, 2);
  assert.equal(rows[0].puts.length, 1);
  assert.equal(rows[0].calls[0].underlyingAmount, 10n ** 18n);
  assert.equal(perToken(rows[0].numerator, rows[0].denominator, 18, 6), "300");
});
test("distinct strikes never merge due to display rounding or floating point precision", () => {
  const rows = strikeRows([{ ...base, strikeTotal: 300_000_001n }, base, { ...base, underlyingAmount: 3n * 10n ** 18n, strikeTotal: 900_000_001n }], 2000n, 1000n);
  assert.equal(rows.length, 3);
  assert.equal(perToken(rows[0].numerator, rows[0].denominator, 18, 6), "300");
  assert.equal(perToken(rows[1].numerator, rows[1].denominator, 18, 6), "≈300");
  assert.equal(perToken(rows[2].numerator, rows[2].denominator, 18, 6), "300.000001");
  assert.equal(perToken(2n ** 200n, 10n ** 18n, 18, 6), `${2n ** 200n / 1_000_000n}.${(2n ** 200n % 1_000_000n).toString().padStart(6, "0")}`);
});
test("resales and primary offers share strikes but retain exact prices and quantities", () => {
  const resale = { ...base, state: 1, resalePrice: 3_000_000n, listingNonce: 3n };
  const unlisted = { ...resale, resalePrice: 0n };
  const rows = strikeRows([base, unlisted, resale], 2000n, 1000n);
  assert.equal(rows[0].calls.length, 2);
  assert.equal(rows[0].calls[0], resale);
  assert.deepEqual(listedExpirations([resale], 1000n), [2000n]);
  assert.deepEqual(listedExpirations([resale], 2000n), []);
});
test("unbought canceled and expired options never invent premium income", () => {
  const buyer = "0x0000000000000000000000000000000000000000";
  assert.deepEqual(optionPayments({ ...base, buyer, state: 3 }, address), {});
  assert.deepEqual(optionPayments({ ...base, buyer, state: 4 }, address), {});
  assert.deepEqual(optionPayments({ ...base, buyer }, address), { asking: base.premium });
  assert.deepEqual(optionPayments({ ...base, state: 1 }, address), { received: base.premium });
});
test("payment history attributes each purchase and resale to the actual counterparties", () => {
  const holder = "0x2222222222222222222222222222222222222222", next = "0x3333333333333333333333333333333333333333";
  const transactionHash = `0x${"a".repeat(64)}` as const;
  const p: Position = { ...base, state: 1, buyer: holder, trades: [
    { seller: address, buyer: holder, price: 8n, blockNumber: 1n, transactionHash },
    { seller: holder, buyer: next, price: 12n, blockNumber: 2n, transactionHash },
    { seller: next, buyer: holder, price: 9n, blockNumber: 3n, transactionHash },
  ] };
  assert.deepEqual(optionPayments(p, address), { received: 8n });
  assert.deepEqual(optionPayments(p, holder), { paid: 17n, received: 12n });
  assert.deepEqual(optionPayments(p, next), { paid: 12n, received: 9n });
});
