#!/usr/bin/env node
// Functional browser acceptance: two isolated test wallets, actual UI actions and Anvil receipts.
// No screenshots, private keys, or external wallet/network access.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createPublicClient, erc20Abi, http } from 'viem';

const root = new URL('../', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const deployment = await json('deployments/31337.json');
const factoryAbi = (await json('contracts/out/OptionFactory.sol/OptionFactory.json')).abi;
const optionAbi = (await json('contracts/out/Option.sol/Option.json')).abi;
const rpcUrl = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545';
const baseUrl = process.env.BROWSER_BASE_URL ?? 'http://localhost:3000';
for (const url of [rpcUrl, baseUrl]) assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname), 'Browser smoke requires loopback URLs');
assert.equal(deployment.chainId, 31337);
assert.equal(deployment.underlying.isMock, true);
assert.equal(deployment.quote.isMock, true);
const client = createPublicClient({ transport: http(rpcUrl), cacheTime: 0, pollingInterval: 25 });
assert.equal(await client.getChainId(), 31337);
assert.match(await client.request({ method: 'web3_clientVersion' }), /anvil/i);
const accounts = await client.request({ method: 'eth_accounts' });
const [writer, buyer] = accounts;
assert(writer && buyer, 'Two unlocked Anvil accounts required');
const factory = deployment.factory;
const underlying = deployment.underlying.address;
const quote = deployment.quote.address;
assert((await client.getCode({ address: factory }))?.length > 2, 'Local factory is missing');

const quantity = 1_250_000_000_000_000_000n;
const strike = 312_345_678n;
const premium = 4_567_891n;
const evidence = { chainId: 31337, baseUrl, factory, writer, buyer, startedAt: new Date().toISOString(), setupTransactions: [], scenarios: [] };
let transactions = evidence.setupTransactions;
const errors = [];
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const read = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args });

async function walletPage(account) {
  const context = await browser.newContext({ timezoneId: 'UTC', permissions: ['clipboard-read', 'clipboard-write'] });
  await context.exposeBinding('__localWalletRpc', async (_source, request) => {
    const { method, params = [] } = request;
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
      assert.equal(Number(params[0].chainId), 31337, 'Injected wallet refuses public chains');
      return null;
    }
    if (method === 'wallet_getCapabilities' || method === 'wallet_requestPermissions') return [];
    if (method === 'eth_sendTransaction') {
      assert.equal(await client.getChainId(), 31337, 'Refusing a write after network changed');
      assert.equal(params[0].from.toLowerCase(), account.toLowerCase(), 'Wallet cannot send for another account');
      const hash = await client.request({ method, params });
      const receipt = await client.waitForTransactionReceipt({ hash });
      assert.equal(receipt.status, 'success', 'UI transaction reverted');
      transactions.push({ from: account, to: params[0].to, hash, blockNumber: receipt.blockNumber, status: receipt.status });
      return hash;
    }
    assert(method.startsWith('eth_') || method === 'net_version' || method === 'web3_clientVersion', `Unsupported wallet RPC ${method}`);
    return client.request({ method, params });
  });
  await context.addInitScript(({ account }) => {
    const listeners = new Map();
    const provider = {
      isMetaMask: true,
      selectedAddress: account,
      chainId: '0x7a69',
      networkVersion: '31337',
      isConnected: () => true,
      request: (request) => window.__localWalletRpc(request),
      on: (event, handler) => { const set = listeners.get(event) ?? new Set(); set.add(handler); listeners.set(event, set); return provider; },
      removeListener: (event, handler) => { listeners.get(event)?.delete(handler); return provider; },
      removeAllListeners: (event) => { if (event) listeners.delete(event); else listeners.clear(); return provider; },
    };
    window.ethereum = provider;
  }, { account });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseUrl);
  await expect(page.getByRole('button', { name: 'Refresh options', exact: true })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await expect(page.getByRole('button', { name: /Disconnect$/ })).toBeVisible({ timeout: 15_000 });
  return page;
}

async function complete(page, button, success) {
  const dismiss = page.getByRole('button', { name: 'Dismiss notification' });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.getByRole('button', { name: button, exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: success })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('button', { name: 'Dismiss notification' })).toBeVisible();
}

async function balances(option) {
  const result = {};
  for (const [name, address] of Object.entries({ writer, buyer, option })) {
    result[name] = { underlying: await read(underlying, erc20Abi, 'balanceOf', [address]), quote: await read(quote, erc20Abi, 'balanceOf', [address]) };
  }
  return result;
}

function deltas(before, after, expected, message) {
  for (const name of Object.keys(before)) for (const token of ['underlying', 'quote']) {
    assert.equal(after[name][token] - before[name][token], expected[name]?.[token] ?? 0n, `${message}: ${name} ${token}`);
  }
  for (const token of ['underlying', 'quote']) {
    const total = (data) => Object.values(data).reduce((sum, holder) => sum + holder[token], 0n);
    assert.equal(total(after), total(before), `${message}: ${token} conservation`);
  }
}

async function create(page, type) {
  const beforeCount = await read(factory, factoryAbi, 'optionCount');
  const before = { underlying: await read(underlying, erc20Abi, 'balanceOf', [writer]), quote: await read(quote, erc20Abi, 'balanceOf', [writer]) };
  const block = await client.getBlock();
  const expiry = new Date(Math.max(Date.now(), Number(block.timestamp) * 1000) + 86_400_000).toISOString().slice(0, 16);
  await page.getByRole('tab', { name: 'Create offer', exact: true }).click();
  await page.getByRole('radio', { name: type === 0 ? /^Covered call/ : /^Put/ }).check();
  await page.getByLabel(/^Quantity of/).fill('1.25');
  await page.getByLabel(/^Total exercise amount/).fill('312.345678');
  await page.getByLabel(/^Total premium/).fill('4.567891');
  await page.getByLabel(/^Expiration/).fill(expiry);
  await complete(page, 'Approve collateral and create offer', 'Offer created. Collateral has been deposited in the contract.');
  assert.equal(await read(factory, factoryAbi, 'optionCount'), beforeCount + 1n);
  const option = await read(factory, factoryAbi, 'options', [beforeCount]);
  assert.equal(await read(option, optionAbi, 'underlyingAmount'), quantity);
  assert.equal(await read(option, optionAbi, 'strikeTotal'), strike);
  assert.equal(await read(option, optionAbi, 'premium'), premium);
  const after = await balances(option);
  for (const token of ['underlying', 'quote']) {
    const collateral = type === 0 ? token === 'underlying' ? quantity : 0n : token === 'quote' ? strike : 0n;
    assert.equal(after.writer[token] - before[token], -collateral, 'Creation debits writer exact collateral');
    assert.equal(after.option[token], collateral, 'Creation funds exact escrow');
  }
  await page.locator('.option-card').first().click();
  await expect(page).toHaveURL(new RegExp(`option=${option}`, 'i'));
  await complete(page, 'Copy link', 'Option link copied.');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(new URL(link).searchParams.get('option').toLowerCase(), option.toLowerCase());
  return { option, link, expiry: await read(option, optionAbi, 'expiry'), afterCollateral: after };
}

try {
  const writerPage = await walletPage(writer);
  const buyerPage = await walletPage(buyer);
  for (const page of [writerPage, buyerPage]) {
    await complete(page, 'Get MockUSD', 'Test MockUSD received.');
    await complete(page, 'Get MockSTOCK', 'Test MockSTOCK received.');
  }
  for (const [type, name] of [[0, 'CALL'], [1, 'PUT']]) {
    const entry = { label: `${name}: two wallets create, share, buy and exercise through interface`, transactions: [] };
    evidence.scenarios.push(entry); transactions = entry.transactions;
    const offer = await create(writerPage, type);
    Object.assign(entry, offer);
    await buyerPage.goto(offer.link);
    await complete(buyerPage, 'Buy option', 'Transaction confirmed. Balances and position are up to date.');
    const purchased = await balances(offer.option);
    deltas(offer.afterCollateral, purchased, { writer: { quote: premium }, buyer: { quote: -premium } }, `${name} UI purchase`);
    assert.equal(Number(await read(offer.option, optionAbi, 'state')), 1);
    assert.equal((await read(offer.option, optionAbi, 'buyer')).toLowerCase(), buyer.toLowerCase());
    await complete(buyerPage, 'Exercise option', 'Transaction confirmed. Balances and position are up to date.');
    const after = await balances(offer.option);
    deltas(purchased, after, type === 0
      ? { writer: { quote: strike }, buyer: { underlying: quantity, quote: -strike }, option: { underlying: -quantity } }
      : { writer: { underlying: quantity }, buyer: { underlying: -quantity, quote: strike }, option: { quote: -strike } }, `${name} UI exercise`);
    assert.equal(Number(await read(offer.option, optionAbi, 'state')), 2);
    assert.deepEqual(after.option, { underlying: 0n, quote: 0n });
    await expect(buyerPage.getByRole('button', { name: 'Exercise option', exact: true })).toHaveCount(0);
    Object.assign(entry, { afterPurchase: purchased, after, result: 'passed' });
    console.log(`PASS ${entry.label}`);
  }

  const cancelled = { label: 'Writer cancels unsold call through interface', transactions: [] };
  evidence.scenarios.push(cancelled); transactions = cancelled.transactions;
  const cancelOffer = await create(writerPage, 0);
  Object.assign(cancelled, cancelOffer);
  await complete(writerPage, 'Cancel offer', 'Transaction confirmed. Balances and position are up to date.');
  cancelled.after = await balances(cancelOffer.option);
  deltas(cancelOffer.afterCollateral, cancelled.after, { writer: { underlying: quantity }, option: { underlying: -quantity } }, 'UI cancellation');
  assert.equal(Number(await read(cancelOffer.option, optionAbi, 'state')), 3);
  cancelled.result = 'passed';
  console.log(`PASS ${cancelled.label}`);

  const expired = { label: 'Writer reclaims expired put collateral through interface', transactions: [] };
  evidence.scenarios.push(expired); transactions = expired.transactions;
  const expireOffer = await create(writerPage, 1);
  Object.assign(expired, expireOffer);
  // Time travel is deliberately last, after both UI settlement paths finish.
  await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(expireOffer.expiry)] });
  await client.request({ method: 'evm_mine', params: [] });
  await writerPage.reload();
  await complete(writerPage, 'Reclaim collateral', 'Transaction confirmed. Balances and position are up to date.');
  expired.after = await balances(expireOffer.option);
  deltas(expireOffer.afterCollateral, expired.after, { writer: { quote: strike }, option: { quote: -strike } }, 'UI expiry reclaim');
  assert.equal(Number(await read(expireOffer.option, optionAbi, 'state')), 4);
  expired.result = 'passed';
  console.log(`PASS ${expired.label}`);
  evidence.finishedAt = new Date().toISOString();
  evidence.browserErrors = errors;
  assert.equal(errors.length, 0, `Browser runtime errors: ${errors.join('; ')}`);
  evidence.result = 'passed';
} catch (error) {
  evidence.result = 'failed';
  evidence.error = error.message;
  throw error;
} finally {
  await writeFile(new URL('deployments/local-browser-smoke.json', root), `${JSON.stringify(evidence, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2)}\n`);
  await browser.close();
}
console.log('4 browser acceptance scenarios passed. Evidence: deployments/local-browser-smoke.json');
