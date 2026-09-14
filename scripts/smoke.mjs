#!/usr/bin/env node
// Financial integration checks against a local Anvil deployment; never signs on public networks.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, decodeEventLog, defineChain, http, parseAbi } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

const root = new URL('../', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const manifest = await readJson(process.env.DEMO_MANIFEST ?? 'deployments/31337.json');
const rpcUrl = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545';
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(rpcUrl).hostname), 'Smoke checks require a loopback RPC');
assert.equal(manifest.chainId, 31337, 'Only a local deployment is supported');
assert.equal(manifest.underlying.isMock, true, 'Local checks require MockStock');
assert.equal(manifest.quote.isMock, true, 'Local checks require MockUSD');
const chain = defineChain({ id: 31337, name: 'Anvil', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
const client = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 25, cacheTime: 0 });
assert.equal(await client.getChainId(), 31337, 'Refusing to sign outside Anvil chain 31337');
assert.match(await client.request({ method: 'web3_clientVersion' }), /anvil/i, 'Refusing to run against a non-Anvil client');

// Publicly known development mnemonic, deliberately independent of any environment private key.
const mnemonic = 'test test test test test test test test test test test junk';
const wallet = (addressIndex) => createWalletClient({ account: mnemonicToAccount(mnemonic, { addressIndex }), chain, transport: http(rpcUrl) });
const writer = wallet(3);
const buyer = wallet(4);
const stranger = wallet(5);
const factoryAbi = (await readJson('contracts/out/OptionFactory.sol/OptionFactory.json')).abi;
const optionAbi = (await readJson('contracts/out/Option.sol/Option.json')).abi;
const tokenAbi = parseAbi([
  'function faucet()',
  'function approve(address spender, uint256 value) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);
const underlying = manifest.underlying.address;
const quote = manifest.quote.address;
const factory = manifest.factory;
for (const address of [underlying, quote, factory]) assert((await client.getCode({ address }))?.length > 2, `No deployed code at ${address}; deploy on this Anvil instance first`);
assert.equal(await client.readContract({ address: underlying, abi: tokenAbi, functionName: 'decimals' }), 18);
assert.equal(await client.readContract({ address: quote, abi: tokenAbi, functionName: 'decimals' }), 6);
for (const [name, address] of [['underlying', underlying], ['quote', quote]]) {
  assert.equal((await client.readContract({ address: factory, abi: factoryAbi, functionName: name })).toLowerCase(), address.toLowerCase(), `Factory ${name} differs from manifest`);
}

const quantity = 1_200_000_000_000_000_000n;
const strike = 312_345_678n;
const premium = 4_567_891n;
const evidence = {
  network: { chainId: 31337, client: 'Anvil', factory, underlying, quote },
  participants: { writer: writer.account.address, buyer: buyer.account.address, stranger: stranger.account.address },
  terms: { underlyingAmount: quantity, strikeTotal: strike, premium },
  startedAt: new Date().toISOString(),
  setupTransactions: [],
  scenarios: [],
};
let currentTransactions = evidence.setupTransactions;
let assertions = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions++; };
const readOption = (address, functionName) => client.readContract({ address, abi: optionAbi, functionName });
const balance = (token, address) => client.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [address] });

async function transact(actor, address, abi, functionName, args = [], expectedStatus = 'success') {
  // Explicit gas permits actual rejected transactions to be mined and checked, not only simulated.
  const hash = await actor.writeContract({ address, abi, functionName, args, gas: 4_000_000n });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  currentTransactions.push({ action: functionName, from: actor.account.address, to: address, hash, blockNumber: receipt.blockNumber, timestamp: block.timestamp, status: receipt.status });
  equal(receipt.status, expectedStatus, `${functionName}: unexpected transaction outcome`);
  return receipt;
}
const approve = (actor, token, spender, amount) => transact(actor, token, tokenAbi, 'approve', [spender, amount]);

async function snapshot(option) {
  const result = {};
  for (const [name, address] of Object.entries({ writer: writer.account.address, buyer: buyer.account.address, option, factory })) {
    const [stock, usd] = await Promise.all([balance(underlying, address), balance(quote, address)]);
    result[name] = { underlying: stock, quote: usd };
  }
  return result;
}

function compareBalances(before, after, changes, label) {
  for (const holder of Object.keys(before)) {
    for (const token of ['underlying', 'quote']) {
      equal(after[holder][token] - before[holder][token], changes[holder]?.[token] ?? 0n, `${label}: ${holder} ${token} delta`);
    }
  }
  for (const token of ['underlying', 'quote']) {
    const sum = (values) => Object.values(values).reduce((total, item) => total + item[token], 0n);
    equal(sum(after), sum(before), `${label}: ${token} conserved across wallets, escrow, and factory`);
  }
}

async function rejectUnchanged(actor, option, method, label) {
  const before = await snapshot(option);
  const state = await readOption(option, 'state');
  const purchaser = await readOption(option, 'buyer');
  const receipt = await transact(actor, option, optionAbi, method, [], 'reverted');
  equal(await snapshot(option), before, `${label}: balances unchanged after revert`);
  equal(await readOption(option, 'state'), state, `${label}: state unchanged after revert`);
  equal(await readOption(option, 'buyer'), purchaser, `${label}: buyer unchanged after revert`);
  return receipt;
}

async function create(type, duration = 3600n) {
  const collateralToken = type === 0 ? underlying : quote;
  const collateralAmount = type === 0 ? quantity : strike;
  await approve(writer, collateralToken, factory, collateralAmount);
  const expiry = (await client.getBlock()).timestamp + duration;
  const writerBefore = { underlying: await balance(underlying, writer.account.address), quote: await balance(quote, writer.account.address) };
  const countBefore = await client.readContract({ address: factory, abi: factoryAbi, functionName: 'optionCount' });
  const receipt = await transact(writer, factory, factoryAbi, 'createOption', [type, quantity, strike, premium, expiry]);
  const event = receipt.logs.flatMap((log) => {
    if (log.address.toLowerCase() !== factory.toLowerCase()) return [];
    try { return [decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics })]; } catch { return []; }
  }).find((log) => log.eventName === 'OptionCreated');
  assert(event, 'Factory must emit OptionCreated');
  const option = event.args.option;
  equal(event.args.writer.toLowerCase(), writer.account.address.toLowerCase(), 'Created event writer');
  equal(Number(event.args.optionType), type, 'Created event type');
  equal(await client.readContract({ address: factory, abi: factoryAbi, functionName: 'optionCount' }), countBefore + 1n, 'Factory registers exactly one offer');
  equal((await client.readContract({ address: factory, abi: factoryAbi, functionName: 'options', args: [countBefore] })).toLowerCase(), option.toLowerCase(), 'Factory index matches emitted option');
  equal(await readOption(option, 'funded'), true, 'Offer atomically collateralized');
  equal(Number(await readOption(option, 'state')), 0, 'New offer is open');
  equal(await readOption(option, 'underlyingAmount'), quantity, 'Fractional underlying quantity preserved');
  equal(await readOption(option, 'strikeTotal'), strike, 'Six-decimal strike preserved');
  equal(await readOption(option, 'premium'), premium, 'Six-decimal premium preserved');
  equal(await readOption(option, 'expiry'), expiry, 'Expiry preserved');
  for (const [name, token] of [['underlying', underlying], ['quote', quote]]) {
    equal(await balance(token, option), token === collateralToken ? collateralAmount : 0n, `Creation: escrow ${name}`);
    equal(await balance(token, writer.account.address), writerBefore[name] - (token === collateralToken ? collateralAmount : 0n), `Creation: writer ${name}`);
  }
  return { option, expiry };
}

async function buy(option) {
  await approve(buyer, quote, option, premium);
  const before = await snapshot(option);
  await transact(buyer, option, optionAbi, 'buy');
  compareBalances(before, await snapshot(option), { writer: { quote: premium }, buyer: { quote: -premium } }, 'Purchase');
  equal(Number(await readOption(option, 'state')), 1, 'Purchased option is active');
  equal((await readOption(option, 'buyer')).toLowerCase(), buyer.account.address.toLowerCase(), 'Buyer recorded');
}

async function terminal(option, state) {
  equal(Number(await readOption(option, 'state')), state, 'Expected terminal state');
  equal(await balance(underlying, option), 0n, 'No underlying stranded in terminal escrow');
  equal(await balance(quote, option), 0n, 'No quote stranded in terminal escrow');
}

async function scenario(label, execute) {
  const entry = { label, transactions: [] };
  currentTransactions = entry.transactions;
  evidence.scenarios.push(entry);
  await execute(entry);
  entry.result = 'passed';
  console.log(`PASS ${label}`);
}

for (const actor of [writer, buyer]) {
  await transact(actor, underlying, tokenAbi, 'faucet');
  await transact(actor, quote, tokenAbi, 'faucet');
}

await scenario('Factory: insufficient collateral approval leaves balances and registry unchanged', async (entry) => {
  await approve(writer, underlying, factory, 0n);
  const countBefore = await client.readContract({ address: factory, abi: factoryAbi, functionName: 'optionCount' });
  const before = {
    writerUnderlying: await balance(underlying, writer.account.address),
    writerQuote: await balance(quote, writer.account.address),
    factoryUnderlying: await balance(underlying, factory),
    factoryQuote: await balance(quote, factory),
  };
  const expiry = (await client.getBlock()).timestamp + 3600n;
  await transact(writer, factory, factoryAbi, 'createOption', [0, quantity, strike, premium, expiry], 'reverted');
  const after = {
    writerUnderlying: await balance(underlying, writer.account.address),
    writerQuote: await balance(quote, writer.account.address),
    factoryUnderlying: await balance(underlying, factory),
    factoryQuote: await balance(quote, factory),
  };
  equal(after, before, 'Unfunded creation rolls back all token movement');
  equal(await client.readContract({ address: factory, abi: factoryAbi, functionName: 'optionCount' }), countBefore, 'Unfunded creation does not register an offer');
  Object.assign(entry, { before, after });
});

for (const [type, name] of [[0, 'CALL'], [1, 'PUT']]) {
  await scenario(`${name}: collateral → premium → physical exercise, with rejection and rollback checks`, async (entry) => {
    const { option, expiry } = await create(type);
    Object.assign(entry, { option, expiry, afterCollateral: await snapshot(option) });
    await rejectUnchanged(stranger, option, 'cancel', 'Only writer cancels');
    await rejectUnchanged(writer, option, 'reclaimExpired', 'No early reclaim');
    await rejectUnchanged(writer, option, 'buy', 'Writer cannot buy own option');
    await rejectUnchanged(buyer, option, 'buy', 'Insufficient premium approval rolls back purchase');
    await buy(option);
    entry.afterPurchase = await snapshot(option);
    await rejectUnchanged(writer, option, 'cancel', 'Purchased option cannot be cancelled');
    await approve(buyer, quote, option, premium);
    await rejectUnchanged(buyer, option, 'buy', 'Cannot buy twice despite sufficient funds and approval');
    await rejectUnchanged(buyer, option, 'exercise', 'Missing delivery approval rolls back exercise');
    await approve(buyer, type === 0 ? quote : underlying, option, type === 0 ? strike : quantity);
    await rejectUnchanged(stranger, option, 'exercise', 'Only buyer exercises even with delivery fully approved');
    const before = await snapshot(option);
    await transact(buyer, option, optionAbi, 'exercise');
    const changes = type === 0
      ? { writer: { quote: strike }, buyer: { underlying: quantity, quote: -strike }, option: { underlying: -quantity } }
      : { writer: { underlying: quantity }, buyer: { underlying: -quantity, quote: strike }, option: { quote: -strike } };
    compareBalances(before, await snapshot(option), changes, `${name} exercise`);
    await terminal(option, 2);
    await rejectUnchanged(buyer, option, 'exercise', 'Cannot exercise twice');
    await rejectUnchanged(writer, option, 'reclaimExpired', 'Cannot reclaim exercised collateral');
    entry.after = await snapshot(option);
  });

  await scenario(`${name}: unsold cancellation returns all collateral`, async (entry) => {
    const { option, expiry } = await create(type);
    Object.assign(entry, { option, expiry, before: await snapshot(option) });
    await transact(writer, option, optionAbi, 'cancel');
    compareBalances(entry.before, await snapshot(option), type === 0
      ? { writer: { underlying: quantity }, option: { underlying: -quantity } }
      : { writer: { quote: strike }, option: { quote: -strike } }, 'Cancellation');
    await terminal(option, 3);
    await rejectUnchanged(writer, option, 'cancel', 'Cannot cancel twice');
    await rejectUnchanged(buyer, option, 'buy', 'Cannot buy cancelled offer');
    entry.after = await snapshot(option);
  });

  for (const sold of [false, true]) {
    await scenario(`${name}: ${sold ? 'purchased' : 'unsold'} option expires at exact timestamp; writer recovers collateral`, async (entry) => {
      const { option, expiry } = await create(type);
      Object.assign(entry, { option, expiry, afterCollateral: await snapshot(option) });
      if (sold) {
        await buy(option);
        await approve(buyer, type === 0 ? quote : underlying, option, type === 0 ? strike : quantity);
      } else {
        await approve(buyer, quote, option, premium);
      }
      entry.before = await snapshot(option);
      await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(expiry)] });
      const receipt = await rejectUnchanged(buyer, option, sold ? 'exercise' : 'buy', 'Exact expiry blocks buyer action');
      equal((await client.getBlock({ blockNumber: receipt.blockNumber })).timestamp, expiry, 'Rejected action mined exactly at expiry');
      await rejectUnchanged(stranger, option, 'reclaimExpired', 'Only writer receives expired collateral');
      await transact(writer, option, optionAbi, 'reclaimExpired');
      compareBalances(entry.before, await snapshot(option), type === 0
        ? { writer: { underlying: quantity }, option: { underlying: -quantity } }
        : { writer: { quote: strike }, option: { quote: -strike } }, 'Expired collateral returned');
      await terminal(option, 4);
      await rejectUnchanged(writer, option, 'reclaimExpired', 'Cannot reclaim twice');
      entry.after = await snapshot(option);
    });
  }
}

evidence.finishedAt = new Date().toISOString();
evidence.assertions = assertions;
evidence.result = 'passed';
const output = new URL('deployments/local-smoke.json', root);
await writeFile(output, `${JSON.stringify(evidence, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2)}\n`);
console.log(`${evidence.scenarios.length} scenarios passed (${assertions} checks). Evidence: ${fileURLToPath(output)}`);
