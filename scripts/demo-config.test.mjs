import test from 'node:test';
import assert from 'node:assert/strict';
import { demoStocks, demoOffers, demoExpirations, demoBids, assertLocalDemo } from './demo-config.mjs';

test('demo has 390 one-token V4 asks with aggregate levels and reproducible totals', () => {
  const now = 1788998400n;
  const offers = demoStocks.flatMap(stock => demoOffers(stock, now));
  assert.equal(offers.length, 390);
  assert.equal(new Set(offers.map(o => o.id)).size, 390);
  for (const kind of ['held', 'resale', 'cancelled']) assert.equal(offers.filter(o => o.disposition === kind).length, 10);
  assert.equal(offers.filter(o => o.disposition === 'open').length, 360);
  assert.ok(offers.every(o => o.writerIndex >= 2 && o.writerIndex <= 7 && o.buyerIndex >= 8 && o.buyerIndex <= 9 && o.writerIndex !== o.buyerIndex && o.premium > 0n && o.strikeTotal > 0n && o.expiry > now));
  assert(offers.every(o => o.quantity === 10n ** 18n));
  assert.deepEqual(offers, demoStocks.flatMap(stock => demoOffers(stock, now)));
});
test('demo deadlines are Friday 16:00 New York across DST', () => {
  for (const expiry of demoExpirations(1788998400n)) {
    const date = new Date(Number(expiry) * 1000);
    assert.equal(date.getUTCDay(), 5);
    assert.equal(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(date), '16');
  }
});
test('demo reserves accounts zero and one and refuses nonlocal or non-Anvil networks', () => {
  const accounts = Array.from({ length: 10 }, (_, i) => `0x${String(i).padStart(40, '0')}`);
  assert.deepEqual(assertLocalDemo('http://127.0.0.1:8545', 31337, 'anvil/v1', accounts), accounts.slice(2));
  for (const args of [['https://rpc.testnet.chain.robinhood.com', 31337, 'anvil'], ['http://localhost:8545', 46630, 'anvil'], ['http://localhost:8545', 31337, 'geth']]) assert.throws(() => assertLocalDemo(...args, accounts));
});

test('150 funded bid plans cover calls and puts without using player accounts', () => {
  const now = 1788998400n;
  const bids = demoStocks.flatMap(stock => demoBids(stock, now));
  assert.equal(bids.length, 150);
  assert.equal(new Set(bids.map(r => r.id)).size, 150);
  assert.equal(bids.filter(r => r.optionType === 0).length, 75);
  assert.equal(bids.filter(r => r.optionType === 1).length, 75);
  assert(bids.every(r => r.buyerIndex >= 2 && r.buyerIndex <= 9 && r.premium > 0n && r.expiry > now && r.quantity === 10n ** 18n));
  assert.deepEqual(bids, demoStocks.flatMap(stock => demoBids(stock, now)));
});
