#!/usr/bin/env node
// Functional browser acceptance: two isolated test wallets, actual UI actions and Anvil receipts.
// No screenshots, private keys, or external wallet/network access.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createPublicClient, erc20Abi, http, formatUnits, encodeFunctionData } from 'viem';

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
const strike = 312_345_680n;
const premium = 4_567_890n;
const evidence = { chainId: 31337, baseUrl, factory, writer, buyer, startedAt: new Date().toISOString(), setupTransactions: [], scenarios: [] };
let transactions = evidence.setupTransactions;
const errors = [];
let ownershipChecked = false;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const read = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args });

async function walletPage(account) {
  const context = await browser.newContext({ timezoneId: 'UTC', permissions: ['clipboard-read', 'clipboard-write'] });
  // A forked local RPC can isolate acceptance transactions from a coordinator's live demo.
  if (rpcUrl !== deployment.rpcUrl) await context.route(`${deployment.rpcUrl}/**`, route => route.continue({ url: rpcUrl }));
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
      request: async (request) => {
        if (request.method === 'eth_chainId' && window.__testChainId) return window.__testChainId;
        if (request.method === 'eth_sendTransaction' && window.__rejectNextSignature) {
          window.__rejectNextSignature = false;
          throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
        }
        const result = await window.__localWalletRpc(request);
        if (request.method === 'wallet_switchEthereumChain') window.__setTestChainId('0x7a69');
        return result;
      },
      on: (event, handler) => { const set = listeners.get(event) ?? new Set(); set.add(handler); listeners.set(event, set); return provider; },
      removeListener: (event, handler) => { listeners.get(event)?.delete(handler); return provider; },
      removeAllListeners: (event) => { if (event) listeners.delete(event); else listeners.clear(); return provider; },
    };
    window.ethereum = provider;
    window.__setTestChainId = (chainId) => {
      window.__testChainId = chainId;
      provider.chainId = chainId;
      for (const handler of listeners.get('chainChanged') ?? []) handler(chainId);
    };
  }, { account });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseUrl);
  await expect(page.getByRole('button', { name: 'Refresh options', exact: true })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await expect(page.getByLabel('Wallet menu')).toBeVisible({ timeout: 15_000 });
  return page;
}

async function complete(page, button, success) {
  const dismiss = page.getByRole('button', { name: 'Dismiss notification' });
  if (await dismiss.isVisible()) await dismiss.click();
  if (button.startsWith('Get ') && await page.locator('.wallet-menu').getAttribute('open') === null) {
    await page.getByLabel('Wallet menu').click();
  }
  await page.getByRole('button', { name: button === 'Buy option' ? /^Buy (call|put) · / : button, exact: button !== 'Buy option' }).click();
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

async function create(page, type, usePreset = false) {
  const beforeCount = await read(factory, factoryAbi, 'optionCount');
  const before = { underlying: await read(underlying, erc20Abi, 'balanceOf', [writer]), quote: await read(quote, erc20Abi, 'balanceOf', [writer]) };
  const block = await client.getBlock();
  const expiry = new Date(Math.max(Date.now(), Number(block.timestamp) * 1000) + 86_400_000).toISOString().slice(0, 16);
  await page.getByRole('button', { name: 'Trade', exact: true }).click();
  await page.getByRole('button', { name: 'Write Options', exact: true }).click();
  await page.getByLabel('Write option type').selectOption(String(type));
  await expect(page.getByRole('complementary', { name: 'Offer funding summary' })).toHaveCount(0);
  await page.getByLabel(/^Quantity of/).fill('999999999');
  await page.getByLabel(/^Strike per token/).fill('1');
  await page.getByLabel(/^Premium per token/).fill('1');
  await expect(page.getByRole('alert').filter({ hasText: /Not enough Mock/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review offer →' })).toBeDisabled();
  if (type === 0) {
    await page.getByRole('button', { name: 'Max', exact: true }).click();
    await expect(page.getByLabel(/^Quantity of/)).toHaveValue(formatUnits(before.underlying,18));
  }
  await page.getByLabel('Lot shortcut').selectOption('0.01');
  await expect(page.getByLabel(/^Quantity of/)).toHaveValue('0.01');
  await page.getByLabel(/^Quantity of/).fill('1.25');
  await page.getByLabel(/^Strike per token/).fill('249.876544');
  await page.getByLabel(/^Premium per token/).fill('3.654312');
  let expectedExpiry;
  if (usePreset) {
    const preset = await page.getByLabel('Write expiration', { exact: true }).locator('option').first().getAttribute('value');
    await page.getByLabel('Write expiration', { exact: true }).selectOption(preset);
    expectedExpiry = BigInt(Date.parse(preset) / 1000);
  } else {
    await page.getByLabel('Write expiration', { exact: true }).selectOption('custom');
    await page.getByLabel(/^Expiration · your local time/).fill(expiry);
    expectedExpiry = BigInt(Date.parse(`${expiry}:00Z`) / 1000);
  }
  await page.getByRole('button', { name: 'Review offer →' }).click();
  await expect(page.getByRole('complementary', { name: 'Offer funding summary' })).toBeVisible();
  await expect(page.locator('.funding-impact dd')).toHaveText(type === 0 ? '1.25 MockSTOCK' : '312.34568 MockUSD');
  // Reviewing must never send an approval or create a contract.
  assert.equal(await read(factory, factoryAbi, 'optionCount'), beforeCount);
  assert.equal(await read(underlying, erc20Abi, 'balanceOf', [writer]), before.underlying);
  assert.equal(await read(quote, erc20Abi, 'balanceOf', [writer]), before.quote);
  await complete(page, 'Deposit collateral & write option', 'Option written. Collateral is deposited in its own option contract.');
  assert.equal(await read(factory, factoryAbi, 'optionCount'), beforeCount + 1n);
  const option = await read(factory, factoryAbi, 'options', [beforeCount]);
  assert.equal(await read(option, optionAbi, 'underlyingAmount'), quantity);
  assert.equal(await read(option, optionAbi, 'strikeTotal'), strike);
  assert.equal(await read(option, optionAbi, 'premium'), premium);
  assert.equal(await read(option, optionAbi, 'expiry'), expectedExpiry, 'Stored deadline matches the selected preset or custom time');
  if (!ownershipChecked) {
    // A second writer at the same expiry makes the mixed ownership assertion deterministic.
    // These fixture transactions run only on the loopback Anvil and are not UI actions.
    for (const [to, abi, functionName, args] of [
      [underlying, erc20Abi, 'approve', [factory, quantity]],
      [factory, factoryAbi, 'createOption', [0, quantity, strike, premium, expectedExpiry]],
    ]) {
      const hash = await client.request({ method: 'eth_sendTransaction', params: [{ from: buyer, to, data: encodeFunctionData({ abi, functionName, args }) }] });
      const receipt = await client.waitForTransactionReceipt({ hash });
      assert.equal(receipt.status, 'success');
      evidence.setupTransactions.push({ from: buyer, to, hash, blockNumber: receipt.blockNumber, status: receipt.status, purpose: 'Mixed ownership fixture' });
    }
  }
  const after = await balances(option);
  for (const token of ['underlying', 'quote']) {
    const collateral = type === 0 ? token === 'underlying' ? quantity : 0n : token === 'quote' ? strike : 0n;
    assert.equal(after.writer[token] - before[token], -collateral, 'Creation debits writer exact collateral');
    assert.equal(after.option[token], collateral, 'Creation funds exact escrow');
  }
  await page.locator(`[data-offer="${option}"]`).click();
  await expect(page).toHaveURL(new RegExp(`option=${option}`, 'i'));
  await page.locator('.contract-details summary').click();
  await complete(page, 'Copy link', 'Option link copied.');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(new URL(link).searchParams.get('option').toLowerCase(), option.toLowerCase());
  await expect(page.getByRole('region', { name: 'Option collateral', exact: true })).toContainText('Held in this option’s contract');
  await expect(page.getByRole('region', { name: 'Option collateral', exact: true })).toContainText(option.slice(0,6));
  await expect(page.getByRole('button', { name: /^Buy (call|put) · / })).toHaveCount(0);
  if (!ownershipChecked) {
    await page.getByRole('button', { name: 'Trade', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^Option chain/ })).toBeVisible();
    await page.getByRole('button', { name: 'Refresh options', exact: true }).click();
    await page.locator(`[data-expiration="${expectedExpiry}"]`).click();
    await expect(page.getByLabel('Filter by writer')).toHaveCount(0);
    await expect(page.locator('.chain-offer[data-owner="you"]').first()).toBeVisible();
    await expect(page.locator('.chain-offer[data-owner="you"]').first()).toContainText('Manage');
    await expect(page.locator('.chain-offer[data-owner="other"]').first()).toBeVisible();
    await expect(page.locator('.chain-offer[data-owner="other"]').first()).toContainText('Buy');
    await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
    await page.getByLabel('Position status').selectOption('history');
    await expect(page.locator('.history-source')).toContainText('Source: onchain option contracts.');
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await expect(page.locator('.history-source')).toContainText('Source: this browser + onchain receipts');
    await page.goto(link);
    ownershipChecked = true;
    console.log('PASS unified ownership list, onchain collateral location and distinct history sources');
  }
  return { option, link, expiry: await read(option, optionAbi, 'expiry'), afterCollateral: after };
}

try {
  const writerPage = await walletPage(writer);
  const buyerPage = await walletPage(buyer);
  await buyerPage.evaluate(() => window.__setTestChainId('0x1'));
  await expect(buyerPage.getByRole('button', { name: 'Switch network', exact: true })).toBeVisible();
  await buyerPage.getByRole('button', { name: 'Switch network', exact: true }).click();
  await expect(buyerPage.getByRole('button', { name: 'Switch network', exact: true })).toHaveCount(0);
  console.log('PASS wrong-wallet-network explanation and local switch recovery');
  for (const page of [writerPage, buyerPage]) {
    await page.getByLabel('Wallet menu').click();
    await complete(page, 'Get MockUSD', 'Test MockUSD received.');
    await complete(page, 'Get MockSTOCK', 'Test MockSTOCK received.');
  }
  for (const [type, name] of [[0, 'CALL'], [1, 'PUT']]) {
    const entry = { label: `${name}: two wallets create, share, buy and exercise through interface`, transactions: [] };
    evidence.scenarios.push(entry); transactions = entry.transactions;
    const offer = await create(writerPage, type, type === 0);
    Object.assign(entry, offer);
    await buyerPage.goto(baseUrl);
    await expect(buyerPage.getByRole('region', { name: 'Options chain', exact: true })).toBeVisible();
    await expect(buyerPage.locator('.chain-offer').first()).toBeVisible();
    await buyerPage.locator(`[data-expiration="${offer.expiry}"]`).click();
    await buyerPage.getByLabel('Strikes', { exact: true }).selectOption('all');
    const chainQuote = buyerPage.locator(`[data-offer="${offer.option}"]`);
    await chainQuote.click();
    await expect(buyerPage).toHaveURL(new RegExp(`option=${offer.option}`, 'i'));
    await expect(buyerPage.getByRole('region', { name: 'Trade ticket' })).toBeVisible();
    await expect(buyerPage.locator('.detail-role')).toContainText('Written by');
    await expect(buyerPage.locator('.purchase-cost')).toContainText('Cost to buy this option');
    await expect(buyerPage.getByRole('button', { name: /^Buy (call|put) · / })).toBeDisabled();
    await buyerPage.getByRole('checkbox', { name: /^I understand that I must exercise before/ }).check();
    if (type === 0) {
      const beforeReject = await balances(offer.option);
      await buyerPage.evaluate(() => { window.__rejectNextSignature = true; });
      await buyerPage.getByRole('button', { name: /^Buy call · / }).click();
      await expect(buyerPage.getByRole('alert').filter({ hasText: /rejected/i })).toBeVisible();
      assert.equal(Number(await read(offer.option, optionAbi, 'state')), 0);
      assert.deepEqual(await balances(offer.option), beforeReject);
      await expect(buyerPage.getByRole('button', { name: /^Buy call · / })).toBeEnabled();
      console.log('PASS rejected signature leaves option and token balances unchanged; retry available');
    }
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
  // Persisted pending state references an actual local transaction, not a fake receipt.
  await client.request({ method: 'evm_setAutomine', params: [false] });
  try {
    const pendingHash = await client.request({ method: 'eth_sendTransaction', params: [{ from: writer, to: writer, value: '0x0', gas: '0x5208' }] });
    await writerPage.evaluate(({ hash, account }) => {
      const key = 'stock-options:transactions:v1';
      const items = JSON.parse(localStorage.getItem(key) || '[]');
      items.unshift({ hash, account, chainId: 31337, marketId: 'primary', action: 'Pending recovery acceptance', step: 'operation', status: 'pending', createdAt: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(items));
    }, { hash: pendingHash, account: writer });
    await writerPage.goto(baseUrl);
    await expect(writerPage.getByRole('status').filter({ hasText: 'Transaction pending.' })).toBeVisible();
    await writerPage.getByRole('button', { name: 'View activity', exact: true }).click();
    await expect(writerPage.locator('.activity-table tbody tr').filter({ hasText: 'Pending recovery acceptance' })).toContainText('pending');
    await client.request({ method: 'evm_mine', params: [] });
    await expect(writerPage.locator('.activity-table tbody tr').filter({ hasText: 'Pending recovery acceptance' })).toContainText('confirmed', { timeout: 15000 });
    console.log('PASS pending transaction survives reload and reconciles after a real local receipt');
  } finally { await client.request({ method: 'evm_setAutomine', params: [true] }); }
  // Connected visual evidence is kept local and is not human usability validation.
  await writerPage.getByRole('button', { name: 'Portfolio', exact: true }).click();
  await expect(writerPage.locator('.balance-table tbody tr')).toHaveCount(3);
  await expect(writerPage.getByRole('region', { name: 'Stock Tokens', exact: true }).locator('tbody tr')).toHaveCount(2);
  await expect(writerPage.getByRole('region', { name: 'Stablecoins', exact: true }).locator('tbody tr')).toHaveCount(1);
  await writerPage.screenshot({ path: '/tmp/options-portfolio-connected.png', fullPage: true });
  await writerPage.getByRole('button', { name: 'Trade', exact: true }).click();
  await writerPage.getByRole('button', { name: 'Write Options', exact: true }).click();
  await writerPage.getByLabel(/^Quantity of/).fill('0.01');
  await writerPage.getByLabel(/^Strike per token/).fill('300');
  await writerPage.getByLabel(/^Premium per token/).fill('8');
  await writerPage.screenshot({ path: '/tmp/options-create-connected.png', fullPage: true });
  await writerPage.setViewportSize({ width: 390, height: 844 });
  await writerPage.screenshot({ path: '/tmp/options-create-mobile.png', fullPage: true });
  assert.equal(await writerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
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
