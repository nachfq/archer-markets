// Isolated Anvil integration: SDK preparation, onchain execution and conservation.
import assert from 'node:assert/strict';
import { createPublicClient, http, encodeFunctionData, erc20Abi, parseAbi, decodeEventLog } from 'viem';
import { prepareOrderV4, prepareResaleV4, prepareCancelV4, prepareExercise, simulatePrepared, getMarkets, getPortfolio, getOrderV4, optionMarketV4Abi, optionV4Abi } from '@stock-options-lab/sdk';
import { readJson, saveJson } from './config.mjs';
const rpc = process.env.ANVIL_RPC_URL;
assert(rpc && ['localhost', '127.0.0.1'].includes(new URL(rpc).hostname) && new URL(rpc).port !== '8545');
const c = createPublicClient({ transport: http(rpc), pollingInterval: 25, cacheTime: 0 });
assert.equal(await c.getChainId(), 31337);
assert.match(await c.request({ method: 'web3_clientVersion' }), /anvil/i);
const record = await readJson(process.env.DEMO_MANIFEST);
const m = { ...record, id: record.marketId, deploymentBlock: BigInt(record.deploymentBlock) };
assert.equal(m.version, 4);
const a = (await c.request({ method: 'eth_accounts' })).slice(6, 9);
const read = (address, abi, functionName, args = []) => c.readContract({ address, abi, functionName, args });
assert.equal(await read(m.factory,optionMarketV4Abi,'orderCount'),0n,'Use a clean deployment via npm run test:acceptance:v4.');
const gas = [];
async function tx(from, to, abi, functionName, args = []) {
    const hash = await c.request({ method: 'eth_sendTransaction', params: [{ from, to, data: encodeFunctionData({ abi, functionName, args }), gas: '0x989680' }] });
    const r = await c.waitForTransactionReceipt({ hash });
    assert.equal(r.status, 'success', functionName);
    return r;
}
async function execute(op) {
    if (op.approval)
        await tx(op.account, op.approval.token.address, erc20Abi, 'approve', [op.approval.spender, op.approval.amount]);
    await simulatePrepared(c, op);
    const hash = await c.request({ method: 'eth_sendTransaction', params: [{ from: op.account, ...op.request, gas: '0x989680' }] });
    const r = await c.waitForTransactionReceipt({ hash });
    assert.equal(r.status, 'success', op.action);
    gas.push({ action: op.action, gas: r.gasUsed, hash });
    return r.logs.flatMap(log => { try {
        return [decodeEventLog({ abi: optionMarketV4Abi, ...log })];
    }
    catch {
        return [];
    } });
}
const faucet = parseAbi(['function faucet()']);
for (const actor of a)
    for (const token of [m.underlying, m.quote])
        await tx(actor, token.address, faucet, 'faucet');
const balance = (token, actor) => read(token.address, erc20Abi, 'balanceOf', [actor]);
async function totals() {
    const n = await read(m.factory, optionMarketV4Abi, 'optionCount'), addresses = [...a, m.factory];
    for (let i = 0n; i < n; i++)
        addresses.push(await read(m.factory, optionMarketV4Abi, 'options', [i]));
    return Promise.all([m.underlying, m.quote].map(async (t) => (await Promise.all(addresses.map(x => balance(t, x)))).reduce((x, y) => x + y, 0n)));
}
const initial = await totals();
const expiry = (await c.getBlock()).timestamp + 86400n;
const order = (actor, buy, premium, optionType = 0) => prepareOrderV4(c, m, actor, { optionType, strikeTotal: 300000000n, premium, expiry, buy });
// A cheaper ask wins even though it is older than the last quote. Ties aggregate FIFO.
for (const price of [10n, 9n, 9n])
    await execute(await order(a[0], false, price * 1000000n));
let snapshot = (await getMarkets(c, [m], a[1]))[0];
assert.equal(snapshot.positions.length, 3);
assert(snapshot.positions.every(p => p.underlyingAmount === 10n ** 18n));
let buyerBefore = await balance(m.quote, a[1]);
let logs = await execute(await order(a[1], true, 11000000n));
let fill = logs.find(e => e.eventName === 'OrderExecuted').args;
assert.equal(fill.resting, 2n);
assert.equal(fill.price, 900);
assert.equal(buyerBefore - await balance(m.quote, a[1]), 9000000n);
assert.equal((await getOrderV4(c, m, 3n)).state, 1);
const owned = fill.option;
assert.equal((await getMarkets(c, [m], a[1]))[0].requests.find(r => r.id === 4n).premium, 9000000n);
// Resale competes in the same ask book and preserves writer/collateral.
await execute(await prepareResaleV4(c, m, a[1], owned, 8000000n));
logs = await execute(await order(a[2], true, 10000000n));
assert.equal(logs.find(e => e.eventName === 'OrderExecuted').args.option, owned);
assert.equal((await read(owned, optionV4Abi, 'writer')).toLowerCase(), a[0].toLowerCase());
assert.equal(await balance(m.underlying, owned), 10n ** 18n);
await execute(await prepareExercise(c, m, a[2], owned));
assert.equal(await read(owned, optionV4Abi, 'state'), 2);
// Incoming sell crosses a funded bid at its price, with a fresh independent put.
await execute(await order(a[1], true, 12000000n, 1));
logs = await execute(await order(a[0], false, 10000000n, 1));
fill = logs.find(e => e.eventName === 'OrderExecuted').args;
assert.equal(fill.price, 1200);
assert.equal(await balance(m.quote, fill.option), 300000000n);
await execute(await prepareExercise(c, m, a[1], fill.option));
// Cancellation removes a level and refunds exactly the escrow.
buyerBefore = await balance(m.quote, a[1]);
logs = await execute(await order(a[1], true, 1000000n));
const id = logs.find(e => e.eventName === 'OrderPosted').args.id;
await execute(await prepareCancelV4(c, m, a[1], id));
assert.equal(await balance(m.quote, a[1]), buyerBefore);
assert.deepEqual(await totals(), initial);
assert.equal(await balance(m.quote, m.factory), await read(m.factory, optionMarketV4Abi, 'reservedPremium'));
snapshot = (await getMarkets(c, [m], a[2]))[0];
const portfolio = await getPortfolio(c, [m], a[2], [snapshot]);
assert(portfolio.positions.some(p => p.address.toLowerCase() === owned.toLowerCase() && p.state === 2));
await saveJson(`${process.env.EVIDENCE_DIR}/v4-protocol.json`, { publicTransactions: false, result: 'passed', scenarios: ['best-price/FIFO', 'one-token sizing', 'resting-price improvement', 'resale', 'call/put physical exercise', 'escrow refund', 'conservation', 'SDK portfolio'], gas });
console.log('V4 protocol and SDK integration passed.');
