// Functional local-browser acceptance. Only unlocked Anvil accounts; no private keys.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { createPublicClient, http } from 'viem';
import { optionFactoryAbi } from '@stock-options-lab/sdk';
import { readJson } from './config.mjs';
const rpc = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8547';
const base = process.env.BROWSER_BASE_URL ?? 'http://localhost:3002';
for (const url of [rpc, base]) assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const client = createPublicClient({ transport: http(rpc), pollingInterval: 25 });
assert.equal(await client.getChainId(), 31337);
assert.match(await client.request({ method: 'web3_clientVersion' }), /anvil/i);
const accounts = await client.request({ method: 'eth_accounts' });
const m = await readJson(process.env.DEMO_MANIFEST ?? 'deployments/31337.json');
assert.equal(m.version, 3);
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
    }
    return client.request(request);
  });
  await context.addInitScript(({account}) => {
    const provider = { isMetaMask:true, selectedAddress:account, chainId:'0x7a69', isConnected:()=>true, on:()=>provider, removeListener:()=>provider, removeAllListeners:()=>provider, request:r=>window.__requestRpc(r) };
    window.ethereum = provider;
  }, {account});
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/?market=${m.marketId}&view=requests`);
  await expect(page.getByRole('button', {name:'Refresh requests'})).toBeEnabled();
  await page.getByRole('button', {name:'Connect wallet',exact:true}).click();
  await expect(page.getByRole('button', {name:'Wallet menu'})).toBeVisible();
  return page;
}
const date = seconds => new Date(Number(seconds)*1000).toISOString().slice(0,16);
try {
  const buyer = await walletPage(accounts[7]);
  const writer = await walletPage(accounts[6], 390);
  for (const scenario of [0,1,2]) {
    const kind = scenario === 0 ? 0 : 1;
    const id = await count(), now = (await client.getBlock()).timestamp;
    await buyer.getByRole('button',{name:'Request option',exact:true}).click();
    await buyer.getByLabel('Write option type').selectOption(String(kind));
    await buyer.getByLabel(/^Quantity of/).fill('0.15');
    await buyer.getByLabel(/Exercise payment — total/).fill('60');
    await buyer.getByLabel(/Option price — total/).fill('2');
    await buyer.getByLabel('Write expiration').selectOption('custom');
    await buyer.getByLabel('Expiration · your local time', {exact:true}).fill(date(now+604800n));
    await buyer.getByLabel('Request acceptance deadline').fill(date(now+86400n));
    await expect(buyer.getByRole('button',{name:'Review request →'})).toBeDisabled();
    await buyer.getByLabel(/^Quantity of/).fill('0.2');
    await buyer.getByRole('button',{name:'Review request →'}).click();
    await expect(buyer.getByText('Deposit now · premium')).toBeVisible();
    await buyer.getByRole('button',{name:'Reserve premium & request option'}).click();
    await expect(buyer.getByRole('status').filter({hasText:'Request published.'})).toBeVisible();
    await expect(buyer.locator(`[data-request="${id}"]`)).toContainText('Your request');
    if (scenario === 2) {
      await buyer.locator(`[data-request="${id}"]`).getByRole('button',{name:'Manage request'}).click();
      await buyer.getByRole('button',{name:'Cancel request & recover premium'}).click();
      await expect(buyer.getByRole('status').filter({hasText:'Request canceled.'})).toBeVisible();
      console.log('PASS browser request cancellation: requester recovers premium and terminal state is displayed');
      break;
    }
    await buyer.getByRole('button',{name:'Portfolio',exact:true}).click();
    await expect(buyer.getByRole('region',{name:'Stablecoins',exact:true}).getByRole('columnheader',{name:'Request premiums',exact:true})).toBeVisible();
    await expect(buyer.getByText('Your buy requests',{exact:true})).toBeVisible();
    await writer.getByRole('button',{name:'Refresh requests'}).click();
    const card = writer.locator(`[data-request="${id}"]`);
    await expect(card).toBeVisible();
    await card.getByRole('button',{name:'Review & write option'}).click();
    await expect(writer.getByText('You receive upon acceptance')).toBeVisible();
    await writer.getByRole('button',{name:'Accept & write option',exact:true}).click();
    await expect(writer.getByRole('status').filter({hasText:'Request accepted.'})).toBeVisible();
    await writer.getByRole('button',{name:'View created option',exact:true}).click();
    await expect(writer.locator('#option-review-heading')).toBeVisible();
    assert.equal(await writer.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth),true);
    await writer.goto(`${base}/?market=${m.marketId}&view=requests`);
    await expect(writer.getByRole('button',{name:'Refresh requests'})).toBeEnabled();
    await buyer.goto(`${base}/?market=${m.marketId}&view=requests`);
    await expect(buyer.getByRole('button',{name:'Refresh requests'})).toBeEnabled();
    console.log(`PASS browser ${kind === 0 ? 'call' : 'put'} request: lot validation, reserve, portfolio, writer acceptance and option link`);
  }
  await buyer.getByRole('button',{name:'My requests',exact:true}).click();
  assert.equal(errors.length,0, errors.join('\n'));
} finally { await browser.close(); }
