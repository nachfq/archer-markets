import test from "node:test";
import assert from "node:assert/strict";
import { listedExpirations, perToken, strikeRows, type Bid } from "../lib/chain.ts";
import { optionPayments, type Position } from "../lib/options.ts";
const address = "0x1111111111111111111111111111111111111111";
const base: Position = { address, writer: address, buyer: address, underlyingAmount: 10n ** 18n, strikeTotal: 300_000_000n, premium: 6_000_000n, expiry: 2000n, optionType: 0, state: 0 };
test("unit prices preserve exact V4 totals and invalid quantities", () => {
  assert.equal(perToken(100_000_000n, 10n ** 18n, 18, 6), "100");
  assert.equal(perToken(5_000_000n, 10n ** 18n, 18, 6), "5");
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
test("equal V4 strikes group without combining independent options", () => {
  const rows = strikeRows([base, { ...base, address: "0x2222222222222222222222222222222222222222", premium: 5_000_000n }, { ...base, optionType: 1 }], 2000n, 1000n);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].calls.length, 2);
  assert.equal(rows[0].puts.length, 1);
  assert.equal(rows[0].calls[0].underlyingAmount, 10n ** 18n);
  assert.equal(perToken(rows[0].numerator, rows[0].denominator, 18, 6), "300");
});
test("distinct V4 strikes never merge due to display rounding", () => {
  const rows = strikeRows([{ ...base, strikeTotal: 300_000_001n }, base], 2000n, 1000n);
  assert.equal(rows.length, 2);
  assert.equal(perToken(rows[0].numerator, rows[0].denominator, 18, 6), "300");
  assert.equal(perToken(rows[1].numerator, rows[1].denominator, 18, 6), "300.000001");
  assert.equal(perToken(2n ** 200n, 10n ** 18n, 18, 6), `${2n ** 200n / 1_000_000n}.${(2n ** 200n % 1_000_000n).toString().padStart(6, "0")}`);
});
test("resales and primary asks share strikes but retain exact prices", () => {
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

test("bid/ask book ranks V4 price levels without changing contract terms", async () => {
  const { orderBook } = await import('../lib/chain.ts');
  const bid: Bid = { id: 0n, buyer: address, optionType: 0, underlyingAmount: base.underlyingAmount, strikeTotal: base.strikeTotal, premium: 5_000_000n, expiry: 2000n, state: 0, option: address };
  const lowerBid = { ...bid, id: 1n, premium: 4_000_000n };
  const cheapAsk = { ...base, address: '0x2222222222222222222222222222222222222222' as const, premium: 4_000_000n };
  const rows = orderBook([base, cheapAsk], [lowerBid, bid], 2000n, 1000n);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].calls.bids[0], bid);
  assert.equal(rows[0].calls.asks[0], cheapAsk);
  assert.equal(rows[0].calls.bids[1], lowerBid);
  assert.equal(cheapAsk.premium, 4_000_000n);
});
test("bid-only series appear; expired, executed and cancelled bids never quote", async () => {
  const { bookExpirations, orderBook } = await import('../lib/chain.ts');
  const bid: Bid = { id: 0n, buyer: address, optionType: 1, underlyingAmount: base.underlyingAmount, strikeTotal: base.strikeTotal, premium: 5_000_000n, expiry: 3000n, state: 0, option: address };
  const bids = [bid, { ...bid, state: 1, expiry: 4000n }, { ...bid, state: 2, expiry: 5000n }, { ...bid, expiry: 900n }];
  assert.deepEqual(bookExpirations([base], bids, 1000n), [2000n, 3000n]);
  const rows = orderBook([], bids, 3000n, 1000n);
  assert.deepEqual(rows[0].puts.bids, [bid]);
  assert.deepEqual(rows[0].puts.asks, []);
  assert.deepEqual(orderBook([], bids, 3000n, 3000n), []);
});
test("bid/ask grouping preserves exact expiry and strike and uses resale asking prices", async () => {
  const { orderBook } = await import('../lib/chain.ts');
  const bid: Bid = { id: 0n, buyer: address, optionType: 0, underlyingAmount: base.underlyingAmount, strikeTotal: 300_000_001n, premium: 5_000_000n, expiry: 2000n, state: 0, option: address };
  const resale = { ...base, state: 1, resalePrice: 2_000_000n, listingNonce: 1n };
  const rows = orderBook([base, resale, { ...base, expiry: 2001n }], [bid], 2000n, 1000n);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].calls.asks[0], resale);
  assert.equal(rows[0].calls.asks.length, 2);
  assert.deepEqual(rows[1].calls.bids, [bid]);
});
