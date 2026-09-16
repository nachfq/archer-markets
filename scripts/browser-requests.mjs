// Functional local-browser acceptance. Only unlocked Anvil accounts; no private keys.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { createPublicClient, http, erc20Abi } from 'viem';
import { optionFactoryAbi, optionAbi } from '@stock-options-lab/sdk';
import { readJson, saveJson } from './config.mjs';
const rpc = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8547';
const base = process.env.BROWSER_BASE_URL ?? 'http://localhost:3002';
for (const url of [rpc, base]) assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const client = createPublicClient({ transport: http(rpc), pollingInterval: 25 });
assert.equal(await client.getChainId(), 31337);
assert.match(await client.request({ method: 'web3_clientVersion' }), /anvil/i);
const accounts = await client.request({ method: 'eth_accounts' });
const m = await readJson(process.env.DEMO_MANIFEST ?? 'deployments/31337.json');
assert.equal(m.version, 3);
assert.equal(m.chainId, 31337);
assert(m.underlying.isMock && m.quote.isMock);
assert.notEqual(new URL(rpc).port, '8545', 'Use an isolated Anvil node.');
const evidence = { publicTransactions: false, chainId: 31337, factory: m.factory, scenarios: [], transactions: [], startedAt: new Date().toISOString() };
const read = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args });
const balance = (token, account) => read(token.address, erc20Abi, 'balanceOf', [account]);
const request = id => read(m.factory, optionFactoryAbi, 'getRequest', [id]);
async function balances(option) {
  const result = {};
  for (const account of [accounts[6], accounts[7], m.factory, ...(option ? [option] : [])]) result[account] = await Promise.all([balance(m.underlying, account), balance(m.quote, account)]);
  return result;
}
function conserved(before, after) {
  for (const i of [0, 1]) assert.equal(Object.values(before).reduce((n, v) => n + v[i], 0n), Object.values(after).reduce((n, v) => n + v[i], 0n));
}
const count = () => client.readContract({ address: m.factory, abi: optionFactoryAbi, functionName: 'requestCount' });
const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
const errors = [];
async function walletPage(account, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'UTC' });
  await context.exposeBinding('__requestRpc', async (_, request) => {
    if (['eth_accounts','eth_requestAccounts'].includes(request.method)) return [account];
    if (request.method === 'wallet_switchEthereumChain') { assert.equal(Number(request.params[0].chainId), 31337); return null; }
    if (['wallet_getCapabilities', 'wallet_requestPermissions'].includes(request.method)) return [];
    assert(request.method.startsWith('eth_') || request.method === 'net_version');
    if (request.method === 'eth_sendTransaction') {
      assert.equal(request.params[0].from.toLowerCase(), account.toLowerCase());
      assert.equal(await client.getChainId(), 31337);
      const hash = await client.request(request);
      const receipt = await client.waitForTransactionReceipt({ hash });
      assert.equal(receipt.status, 'success');
      evidence.transactions.push({ hash, from: account, to: request.params[0].to, block: receipt.blockNumber, status: receipt.status });
      return hash;
    }
    return client.request(request);
  });
  await context.addInitScript(({account}) => {
    const listeners = new Map();
    const provider = {
      isMetaMask: true, selectedAddress: account, chainId: '0x7a69', isConnected: () => true,
      on: (event, fn) => { const set = listeners.get(event) ?? new Set(); set.add(fn); listeners.set(event, set); return provider; },
      removeListener: (event, fn) => { listeners.get(event)?.delete(fn); return provider; },
      removeAllListeners: () => { listeners.clear(); return provider; },
      request: r => {
        if (r.method === 'eth_sendTransaction' && window.__rejectNextSignature) { window.__rejectNextSignature = false; throw Object.assign(new Error('User rejected the request.'), { code: 4001 }); }
        if (['eth_accounts', 'eth_requestAccounts'].includes(r.method)) return Promise.resolve([provider.selectedAddress]);
        if (r.method === 'eth_chainId') return Promise.resolve(provider.chainId);
        return window.__requestRpc(r);
      },
    };
    window.__changeChain = value => { provider.chainId = value; for (const fn of listeners.get('chainChanged') ?? []) fn(value); };
    window.__changeAccount = value => { provider.selectedAddress = value; for (const fn of listeners.get('accountsChanged') ?? []) fn([value]); };
    window.ethereum = provider;
  }, {account});
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/?market=${m.marketId}&view=trade`);
  await expect(page.getByRole('button', {name:'Refresh options'})).toBeEnabled();
  await page.getByRole('button', {name:'Connect wallet',exact:true}).click();
  await expect(page.getByRole('button', {name:'Wallet menu'})).toBeVisible();
  return page;
}
const date = seconds => new Date(Number(seconds)*1000).toISOString().slice(0,16);
try {
  const buyer = await walletPage(accounts[7]);
  const writer = await walletPage(accounts[6], 390);
  for (const scenario of [0,1,2,3]) {
    const kind = scenario === 0 ? 0 : 1;
    const id = await count(), now = (await client.getBlock()).timestamp;
    const before = await balances();
    const reservedBefore = await read(m.factory, optionFactoryAbi, 'reservedPremium');
    await buyer.getByRole('button', {name:'Trade',exact:true}).click();
    await buyer.getByRole('group', {name:'Post a new order'}).getByRole('button',{name:'Buy',exact:true}).click();
    await buyer.getByLabel('Write option type').selectOption(String(kind));
    await buyer.getByLabel(/^Quantity of/).fill('0.15');
    await buyer.getByLabel(/Exercise payment — total/).fill('60');
    await buyer.getByLabel(/Premium — total/).fill('2');
    await buyer.getByLabel('Write expiration').selectOption('custom');
    await buyer.getByLabel('Expiration · your local time', {exact:true}).fill(date(now+604800n));
    await buyer.getByLabel('Request acceptance deadline').fill(date(now+86400n));
    await expect(buyer.getByRole('button',{name:'Review buy order →'})).toBeDisabled();
    await buyer.getByLabel(/^Quantity of/).fill('0.2');
    await buyer.getByRole('button',{name:'Review buy order →'}).click();
    await expect(buyer.getByText('Deposit now · premium')).toBeVisible();
    if (scenario === 0) {
      await buyer.evaluate(account => window.__changeAccount(account), accounts[8]);
      await expect(buyer.getByRole('button', {name:'Post bid & reserve premium'})).toHaveCount(0);
      await expect(buyer.getByLabel(/^Quantity of/)).toHaveValue('0.2');
      await buyer.evaluate(account => window.__changeAccount(account), accounts[7]);
      await buyer.getByRole('button',{name:'Review buy order →'}).click();
      await buyer.evaluate(() => window.__changeChain('0x1'));
      await expect(buyer.getByRole('button', {name:'Post bid & reserve premium'})).toHaveCount(0);
      await buyer.evaluate(() => window.__changeChain('0x7a69'));
      await buyer.getByRole('button',{name:'Review buy order →'}).click();
      await buyer.evaluate(() => { window.__rejectNextSignature = true; });
      await buyer.getByRole('button',{name:'Post bid & reserve premium'}).click();
      await expect(buyer.getByRole('alert').filter({hasText:/rejected/i})).toBeVisible();
      assert.equal(await count(), id);
      assert.deepEqual(await balances(), before);
    }
    await buyer.getByRole('button',{name:'Post bid & reserve premium'}).click();
    await expect(buyer.getByRole('status').filter({hasText:'Bid posted.'})).toBeVisible();
    await buyer.getByRole('button',{name:'Portfolio',exact:true}).click();
    await expect(buyer.locator(`[data-request="${id}"]`)).toContainText('Awaiting writer');
    const funded = await request(id);
    assert.equal(funded.state, 0);
    assert.equal(funded.underlyingAmount, 200_000_000_000_000_000n);
    assert.equal(funded.strikeTotal, 60_000_000n);
    assert.equal(funded.premium, 2_000_000n);
    assert.equal(await read(m.factory, optionFactoryAbi, 'reservedPremium'), reservedBefore + funded.premium);
    conserved(before, await balances());
    if (scenario >= 2) {
      if (scenario === 3) {
        await client.request({ method:'evm_setNextBlockTimestamp', params:[Number(funded.acceptUntil)] });
        await client.request({ method:'evm_mine', params:[] });
        await buyer.reload();
        await expect(buyer.locator(`[data-request="${id}"]`)).toContainText('Recover premium');
      }
      await buyer.locator(`[data-request="${id}"]`).getByRole('button',{name:'Manage bid'}).click();
      await buyer.getByRole('button',{name:'Cancel bid & recover premium'}).click();
      await expect(buyer.getByRole('status').filter({hasText:'Bid canceled.'})).toBeVisible();
      assert.equal((await request(id)).state, 2);
      assert.deepEqual(await balances(), before);
      assert.equal(await read(m.factory, optionFactoryAbi, 'reservedPremium'), reservedBefore);
      evidence.scenarios.push({ id, name: scenario === 3 ? 'Expired request refund' : 'Request cancellation', result: 'passed' });
      console.log(`PASS browser ${scenario === 3 ? 'expired refund' : 'request cancellation'}: exact premium returned`);
      await buyer.goto(`${base}/?market=${m.marketId}&view=trade`);
      await expect(buyer.getByRole('button',{name:'Refresh options'})).toBeEnabled();
      continue;
    }
    await buyer.getByRole('button',{name:'Portfolio',exact:true}).click();
    await expect(buyer.getByRole('region',{name:'Stablecoins',exact:true}).getByRole('columnheader',{name:'Request premiums',exact:true})).toBeVisible();
    await expect(buyer.getByText('Your bids',{exact:true})).toBeVisible();
    await writer.getByRole('button',{name:'Refresh options'}).click();
    await writer.locator(`[data-expiration="${funded.expiry}"]`).click();
    if (kind === 1) await writer.getByLabel('Option type', {exact:true}).selectOption('puts');
    const card = writer.locator(`[data-request="${id}"]`).first();
    await expect(card).toBeVisible();
    await card.click();
    await expect(writer.getByText('You receive upon acceptance')).toBeVisible();
    if (scenario === 0) {
      await writer.context().route(`${rpc}/**`, route => route.abort());
      // Let the periodic query detect the outage while the order ticket stays open.
      await expect(writer.getByRole('alert').filter({hasText:'Could not refresh this market.'})).toBeVisible({timeout:45000});
      await expect(writer.getByRole('button',{name:'Sell & deposit collateral',exact:true})).toBeDisabled();
      await writer.context().unroute(`${rpc}/**`);
      await writer.getByRole('button',{name:'Retry connection',exact:true}).click();
      await expect(writer.getByRole('button',{name:'Sell & deposit collateral',exact:true})).toBeEnabled();
    }
    await writer.getByRole('button',{name:'Sell & deposit collateral',exact:true}).click();
    await expect(writer.getByRole('status').filter({hasText:'Option sold.'})).toBeVisible();
    const accepted = await request(id);
    assert.equal(accepted.state, 1);
    assert.equal(await read(m.factory, optionFactoryAbi, 'reservedPremium'), reservedBefore);
    assert.equal((await read(accepted.option, optionAbi, 'buyer')).toLowerCase(), accounts[7].toLowerCase());
    const active = await balances(accepted.option);
    conserved(before, active);
    assert.equal(active[accounts[7]][1], before[accounts[7]][1] - funded.premium);
    assert.equal(active[accounts[6]][1], before[accounts[6]][1] + funded.premium - (kind === 1 ? funded.strikeTotal : 0n));
    assert.deepEqual(active[accepted.option], kind === 0 ? [funded.underlyingAmount, 0n] : [0n, funded.strikeTotal]);
    await writer.getByRole('button',{name:'View created option',exact:true}).click();
    await expect(writer.locator('#option-review-heading')).toBeVisible();
    assert.equal(await writer.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth),true);
    await buyer.goto(`${base}/?market=${m.marketId}&option=${accepted.option}`);
    await buyer.getByRole('button',{name:'Exercise option',exact:true}).click();
    await expect(buyer.getByRole('status').filter({hasText:'Transaction confirmed.'})).toBeVisible();
    assert.equal(await read(accepted.option, optionAbi, 'state'), 2);
    const settled = await balances(accepted.option);
    conserved(before, settled);
    assert.deepEqual(settled[accepted.option], [0n, 0n]);
    assert.equal(settled[accounts[7]][0] - before[accounts[7]][0], kind === 0 ? funded.underlyingAmount : -funded.underlyingAmount);
    assert.equal(settled[accounts[7]][1] - before[accounts[7]][1], -funded.premium + (kind === 0 ? -funded.strikeTotal : funded.strikeTotal));
    evidence.scenarios.push({ id, option: accepted.option, name: kind === 0 ? 'Call request through exercise' : 'Put request through exercise', before, settled, result: 'passed' });
    await writer.goto(`${base}/?market=${m.marketId}&view=trade`);
    await expect(writer.getByRole('button',{name:'Refresh options'})).toBeEnabled();
    await buyer.goto(`${base}/?market=${m.marketId}&view=trade`);
    await expect(buyer.getByRole('button',{name:'Refresh options'})).toBeEnabled();
    console.log(`PASS browser ${kind === 0 ? 'call' : 'put'} request: lot validation, reserve, portfolio, writer acceptance and option link`);
  }
  await buyer.getByRole('button',{name:'Portfolio',exact:true}).click();
  assert.equal(errors.length,0, errors.join('\n'));
  evidence.result = 'passed';
} catch (error) {
  evidence.result = 'failed'; evidence.error = error.message;
  throw error;
} finally {
  evidence.finishedAt = new Date().toISOString();
  evidence.browserErrors = errors;
  await saveJson(`${process.env.EVIDENCE_DIR ?? 'deployments'}/local-browser-requests.json`, evidence);
  await browser.close();
}
