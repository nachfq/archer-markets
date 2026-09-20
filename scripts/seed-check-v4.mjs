import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createPublicClient, http, erc20Abi, encodeDeployData, encodeFunctionData } from 'viem';
import { optionMarketV4Abi } from '@stock-options-lab/sdk';
import { readJson, saveJson, artifact } from './config.mjs';
const rpc = process.env.ANVIL_RPC_URL;
assert(rpc && new URL(rpc).port !== '8545');
const c = createPublicClient({ transport: http(rpc), cacheTime: 0 });
assert.equal(await c.getChainId(), 31337);
const record = await readJson(process.env.DEMO_MANIFEST), markets = [record, ...record.markets].filter(m => m.version === 4), accounts = await c.request({ method: 'eth_accounts' });
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
delete ledger.requests[Object.keys(ledger.requests).at(-1)];
await saveJson(process.env.DEMO_LEDGER,ledger);
const recovered=spawnSync(process.execPath,['scripts/demo-v4.mjs','--no-export'],{env:process.env,encoding:'utf8'});
assert.equal(recovered.status,0,recovered.stderr);
assert.deepEqual(await Promise.all(accounts.map(address=>c.getTransactionCount({address}))),before,'Recover existing receipts without a second purchase, grant or order.');
// Preserve a live V3 position while re-exporting V4 alongside a legacy manifest entry.
const legacyArtifact = await artifact('OptionFactory');
async function send(to, data) {
    const hash = await c.request({ method: 'eth_sendTransaction', params: [{ from: accounts[2], ...(to ? { to } : {}), data, gas: '0x989680' }] });
    const receipt = await c.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, 'success');
    return receipt;
}
const deployed = await send(null, encodeDeployData({ abi: legacyArtifact.abi, bytecode: legacyArtifact.bytecode.object, args: [record.underlying.address, record.quote.address] }));
await send(record.underlying.address, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [deployed.contractAddress, 10n ** 18n] }));
await send(deployed.contractAddress, encodeFunctionData({ abi: legacyArtifact.abi, functionName: 'createOption', args: [0, 10n ** 18n, 300000000n, 10000000n, (await c.getBlock()).timestamp + 86400n] }));
const legacyOption = await c.readContract({ address: deployed.contractAddress, abi: legacyArtifact.abi, functionName: 'options', args: [0n] });
record.markets.push({ marketId: 'prior-market', version: 3, factory: deployed.contractAddress, deploymentBlock: String(deployed.blockNumber), underlying: record.underlying, quote: record.quote });
await saveJson(process.env.DEMO_MANIFEST, record);
const migration = spawnSync(process.execPath, ['scripts/demo-v4.mjs', '--no-export'], { env: process.env, encoding: 'utf8' });
assert.equal(migration.status, 0, migration.stderr);
const migrated = await readJson(process.env.DEMO_MANIFEST);
assert(migrated.markets.some(m => m.factory === deployed.contractAddress && m.legacy && m.version === 3));
assert.equal(migrated.underlying.address, record.underlying.address);
assert.equal(await c.readContract({ address: record.underlying.address, abi: erc20Abi, functionName: 'balanceOf', args: [legacyOption] }), 10n ** 18n);
await saveJson(`${process.env.EVIDENCE_DIR}/seed-v4.json`, { result: 'passed', publicTransactions: false, markets: markets.length, playerOptions: 0, idempotent: true, receiptRecovery: true, legacyCollateralPreserved: true, uncrossedBooks: true, aggregatedLevels: true });
console.log('V4 seed: player funds, fixture segregation, aggregate levels and idempotency passed.');
