import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createPublicClient, http, erc20Abi } from 'viem';
import { optionMarketV4Abi } from '@stock-options-lab/sdk';
import { readJson, saveJson } from './config.mjs';
const rpc = process.env.ANVIL_RPC_URL;
assert(rpc && new URL(rpc).port !== '8545');
const c = createPublicClient({ transport: http(rpc), cacheTime: 0 });
assert.equal(await c.getChainId(), 31337);
const record = await readJson(process.env.DEMO_MANIFEST), markets = [record, ...(record.markets ?? [])], accounts = await c.request({ method: 'eth_accounts' });
const read = (m, functionName, args = []) => c.readContract({ address: m.factory, abi: optionMarketV4Abi, functionName, args });
for (const m of markets) {
    assert(await read(m, 'orderCount') >= 100n);
    for (const player of accounts.slice(0, 2)) {
        assert.deepEqual(await read(m, 'getUserOptions', [player, 0n, 64]), []);
        assert.deepEqual(await read(m, 'getUserOrders', [player, 0n, 64]), []);
        assert(await c.readContract({ address: m.underlying.address, abi: erc20Abi, functionName: 'balanceOf', args: [player] }) > 0n);
    }
    let duplicate = false;
    for (const key of await read(m, 'getSeries', [0n, 64])) {
        const bids = await read(m, 'getDepth', [key, true, 0, 64]), asks = await read(m, 'getDepth', [key, false, 0, 64]);
        if (bids.length && asks.length)
            assert(bids[0].price < asks[0].price);
        duplicate ||= asks.some(l => l.count > 1n);
    }
    assert(duplicate, 'At least one duplicate level must demonstrate aggregation.');
}
const before = await Promise.all(accounts.map(address => c.getTransactionCount({ address })));
const rerun = spawnSync(process.execPath, ['scripts/demo-v4.mjs', '--no-export'], { env: process.env, encoding: 'utf8' });
assert.equal(rerun.status, 0, rerun.stderr);
assert.deepEqual(await Promise.all(accounts.map(address => c.getTransactionCount({ address }))), before, 'Seed rerun must send no transactions.');
// Simulate a process interruption after broadcast but before recording derived fixture IDs.
const ledger=await readJson(process.env.DEMO_LEDGER);
const recoveredAsk=Object.entries(ledger.offers).find(([,entry])=>entry.acquired)?.[0];
assert(recoveredAsk);
delete ledger.offers[recoveredAsk];
delete ledger.bids[Object.keys(ledger.bids).at(-1)];
await saveJson(process.env.DEMO_LEDGER,ledger);
const recovered=spawnSync(process.execPath,['scripts/demo-v4.mjs','--no-export'],{env:process.env,encoding:'utf8'});
assert.equal(recovered.status,0,recovered.stderr);
assert.deepEqual(await Promise.all(accounts.map(address=>c.getTransactionCount({address}))),before,'Recover existing receipts without a second purchase, grant or order.');
await saveJson(`${process.env.EVIDENCE_DIR}/seed-v4.json`, { result: 'passed', publicTransactions: false, markets: markets.length, playerOptions: 0, idempotent: true, receiptRecovery: true, uncrossedBooks: true, aggregatedLevels: true });
console.log('V4 seed: player funds, fixture segregation, aggregate levels and idempotency passed.');
