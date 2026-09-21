import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeErrorResult } from 'viem';
import {
  decodeProtocolError,
  getMarkets,
  optionV4Abi,
  parseAmount,
  ProtocolError,
  summarizePortfolio,
} from '../dist/index.js';

const addr = n => `0x${n.toString(16).padStart(40, '0')}`;
const writer = addr(1), buyer = addr(2);
const stock = { address: addr(3), symbol: 'STOCK', decimals: 18, isMock: true };
const usd = { address: addr(4), symbol: 'USD', decimals: 6, isMock: true };
const market = { id: 'one', chainId: 31337, factory: addr(5), deploymentBlock: 1n, version: 4, feeRecipient: addr(6), baseFee: 1n, feeBps: 10, underlying: stock, quote: usd, sandbox: true };
const option = (n, overrides = {}) => ({ address: addr(100 + n), writer, buyer, underlyingAmount: 10n ** 18n, strikeTotal: 7n, premium: 1n, expiry: 100n, optionType: 0, state: 0, ...overrides });
const snapshot = (positions, bids = [], m = market) => ({ market: m, positions, bids, timestamp: 50n, blockNumber: 10n, blockHash: `0x${'a'.repeat(64)}`, total: BigInt(positions.length) });

test('decimal parsing remains exact and rejects unsupported values', () => {
  assert.equal(parseAmount('1.25', 18), 1_250_000_000_000_000_000n);
  assert.equal(parseAmount('9007199254740993.000001', 6), 9007199254740993000001n);
  assert.throws(() => parseAmount('0.0000001', 6), { code: 'INVALID_TERMS' });
  assert.throws(() => parseAmount('0', 6), { code: 'INVALID_TERMS' });
});

test('portfolio separates V4 bid reserves, writer collateral and reclaimable funds', () => {
  const positions = [option(1), option(2, { state: 1 }), option(3, { expiry: 50n }), option(4, { state: 2 }), option(5, { optionType: 1 }), option(6, { writer: buyer })];
  const bid = { id: 1n, buyer: writer, optionType: 0, underlyingAmount: 10n ** 18n, strikeTotal: 7n, premium: 7n, expiry: 100n, state: 0, option: addr(0) };
  const bids = [bid, { ...bid, id: 2n, premium: 5n, expiry: 50n }, { ...bid, id: 3n, state: 1 }, { ...bid, id: 4n, buyer }];
  const rows = summarizePortfolio([snapshot(positions, bids)], writer, new Map([
    [`31337:${stock.address}`, 11n],
    [`31337:${usd.address}`, 19n],
  ]));
  assert.deepEqual(rows[0], { token: stock, available: 11n, openBidPremium: 0n, refundableBidPremium: 0n, openCollateral: 10n ** 18n, activeCollateral: 10n ** 18n, reclaimable: 10n ** 18n, totalTracked: 3n * 10n ** 18n + 11n });
  assert.deepEqual(rows[1], { token: usd, available: 19n, openBidPremium: 8n, refundableBidPremium: 6n, openCollateral: 7n, activeCollateral: 0n, reclaimable: 0n, totalTracked: 40n });
});

test('duplicate snapshots do not double-count options or bids', () => {
  const bid = { id: 1n, buyer: writer, optionType: 0, underlyingAmount: 10n ** 18n, strikeTotal: 7n, premium: 7n, expiry: 100n, state: 0, option: addr(0) };
  const first = snapshot([option(1)], [bid]);
  const rows = summarizePortfolio([first, first], writer, new Map([
    [`31337:${stock.address}`, 0n],
    [`31337:${usd.address}`, 0n],
  ]));
  assert.equal(rows[0].totalTracked, 10n ** 18n);
  assert.equal(rows[1].totalTracked, 8n);
});

test('protocol errors preserve actionable distinctions', () => {
  const data = encodeErrorResult({ abi: optionV4Abi, errorName: 'OptionExpired' });
  assert.equal(decodeProtocolError({ cause: { data } }).code, 'EXPIRED');
  assert.equal(decodeProtocolError({ cause: { code: 4001 } }).code, 'WALLET_REJECTED');
  const pending = new ProtocolError('PENDING', 'Pending', 'Check receipt');
  assert.equal(decodeProtocolError(pending), pending);
  assert.equal(decodeProtocolError(new Error('opaque RPC')).details.technical, 'opaque RPC');
});

test('market reads reject the wrong RPC before loading V4 state', async () => {
  const client = { getChainId: async () => 1 };
  await assert.rejects(() => getMarkets(client, [market]), { code: 'WRONG_NETWORK' });
});
