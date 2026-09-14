import test from 'node:test';
import assert from 'node:assert/strict';
import { demoStocks, demoOffers, demoExpirations, assertLocalDemo } from './demo-config.mjs';

test('demo has 390 whole lots, varied quantities and reproducible totals', () => {
  const now = 1788998400n;
  const offers = demoStocks.flatMap(stock => demoOffers(stock, now));
  assert.equal(offers.length, 390);
  assert.equal(new Set(offers.map(o => o.id)).size, 390);
  for (const kind of ['held', 'resale', 'cancelled']) assert.equal(offers.filter(o => o.disposition === kind).length, 10);
  assert.equal(offers.filter(o => o.disposition === 'open').length, 360);
  assert.ok(offers.every(o => o.writerIndex > 0 && o.buyerIndex > 0 && o.writerIndex !== o.buyerIndex && o.premium > 0n && o.strikeTotal > 0n && o.expiry > now));
  assert.equal(new Set(offers.map(o => o.quantity)).size, 5);
  assert.deepEqual(offers, demoStocks.flatMap(stock => demoOffers(stock, now)));
});
test('demo deadlines are Friday 16:00 New York across DST', () => {
  for (const expiry of demoExpirations(1788998400n)) {
    const date = new Date(Number(expiry) * 1000);
    assert.equal(date.getUTCDay(), 5);
    assert.equal(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(date), '16');
  }
});
test('demo excludes account zero and refuses nonlocal or non-Anvil networks', () => {
  const accounts = Array.from({ length: 10 }, (_, i) => `0x${String(i).padStart(40, '0')}`);
  assert.deepEqual(assertLocalDemo('http://127.0.0.1:8545', 31337, 'anvil/v1', accounts), accounts.slice(1));
  for (const args of [['https://rpc.testnet.chain.robinhood.com', 31337, 'anvil'], ['http://localhost:8545', 46630, 'anvil'], ['http://localhost:8545', 31337, 'geth']]) assert.throws(() => assertLocalDemo(...args, accounts));
});
