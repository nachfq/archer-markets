// Functional local-browser acceptance. Only unlocked Anvil accounts; no private keys.
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { createPublicClient, http, erc20Abi, encodeFunctionData } from 'viem';
import { optionMarketV4Abi, optionV4Abi } from '@stock-options-lab/sdk';
import { readJson, saveJson } from './config.mjs';
const expect = baseExpect.configure({ timeout: 30000 });
const rpc = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8547';
const base = process.env.BROWSER_BASE_URL ?? 'http://localhost:3002';
for (const url of [rpc, base])
    assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const client = createPublicClient({ transport: http(rpc), pollingInterval: 25 });
assert.equal(await client.getChainId(), 31337);
assert.match(await client.request({ method: 'web3_clientVersion' }), /anvil/i);
const accounts = await client.request({ method: 'eth_accounts' });
const m = await readJson(process.env.DEMO_MANIFEST ?? 'deployments/31337.json');
assert.equal(m.version, 4);
assert.equal(m.chainId, 31337);
assert(m.underlying.isMock && m.quote.isMock);
assert.notEqual(new URL(rpc).port, '8545', 'Use an isolated Anvil node.');
const evidence = { publicTransactions: false, chainId: 31337, factory: m.factory, scenarios: [], transactions: [], startedAt: new Date().toISOString() };
const read = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args });
const balance = (token, account) => read(token.address, erc20Abi, 'balanceOf', [account]);
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
async function walletPage(account, width = 1440) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'UTC' });
    await context.exposeBinding('__requestRpc', async (_, request) => {
        if (['eth_accounts', 'eth_requestAccounts'].includes(request.method))
            return [account];
        if (request.method === 'wallet_switchEthereumChain') {
            assert.equal(Number(request.params[0].chainId), 31337);
            return null;
        }
        if (['wallet_getCapabilities', 'wallet_requestPermissions'].includes(request.method))
            return [];
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
    await context.addInitScript(({ account }) => {
        const listeners = new Map();
        const provider = {
            isMetaMask: true, selectedAddress: account, chainId: '0x7a69', isConnected: () => true,
            on: (event, fn) => { const set = listeners.get(event) ?? new Set(); set.add(fn); listeners.set(event, set); return provider; },
            removeListener: (event, fn) => { listeners.get(event)?.delete(fn); return provider; },
            removeAllListeners: () => { listeners.clear(); return provider; },
            request: r => {
                if (r.method === 'eth_sendTransaction' && window.__rejectNextSignature) {
                    window.__rejectNextSignature = false;
                    throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
                }
                if (['eth_accounts', 'eth_requestAccounts'].includes(r.method))
                    return Promise.resolve([provider.selectedAddress]);
                if (r.method === 'eth_chainId')
                    return Promise.resolve(provider.chainId);
                return window.__requestRpc(r);
            },
        };
        window.__changeChain = value => { provider.chainId = value; for (const fn of listeners.get('chainChanged') ?? [])
            fn(value); };
        window.__changeAccount = value => { provider.selectedAddress = value; for (const fn of listeners.get('accountsChanged') ?? [])
            fn([value]); };
        window.ethereum = provider;
    }, { account });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/?market=${m.marketId}&view=trade`);
    await expect(page.getByRole('button', { name: 'Refresh options' })).toBeEnabled();
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Wallet menu' })).toBeVisible();
    return page;
}
const date = seconds => new Date(Number(seconds) * 1000).toISOString().slice(0, 16);
const count = () => read(m.factory, optionMarketV4Abi, 'orderCount');
const order = id => read(m.factory, optionMarketV4Abi, 'getOrder', [id]);
async function newOrder(page, side, premium, kind = 0) {
    await page.getByRole('button', { name: 'Trade', exact: true }).click();
    await page.getByRole('group', { name: 'Post a new order' }).getByRole('button', { name: side, exact: true }).click();
    await expect(page.getByLabel('Order quantity')).toHaveValue('1');
    await expect(page.getByLabel('Order quantity')).toHaveAttribute('readonly', '');
    await page.getByLabel('Order option type').selectOption(String(kind));
    await page.getByLabel('Order strike').fill('300');
    await page.getByLabel('Order premium').fill(premium);
    await page.getByLabel('Order expiration', { exact: true }).selectOption('custom');
    await page.getByLabel('Custom order expiration').fill(date(expiry));
}
async function confirm(page, side) {
    await page.getByRole('button', { name: 'Review order', exact: true }).click();
    await page.getByRole('checkbox', { name: /I understand: one option/ }).check();
    await page.getByRole('button', { name: `Confirm ${side.toLowerCase()}`, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Confirm ' + side.toLowerCase(), exact: true })).toHaveCount(0, { timeout: 60000 });
}
const expiry = ((await client.getBlock()).timestamp + 604800n) / 60n * 60n;
try {
    const seller = await walletPage(accounts[6], 390), buyer = await walletPage(accounts[7]);
    for (const premium of ['10', '9', '9']) {
        await newOrder(seller, 'Sell', premium);
        await confirm(seller, 'Sell');
    }
    assert.equal(await count(), 3n);
    await buyer.getByRole('button', { name: 'Refresh options' }).click();
    const best = buyer.getByRole('button', { name: /Buy at ask: Call.*premium total 9 MockUSD, 2 contracts available/ });
    await expect(best).toBeVisible();
    await best.click();
    await expect(buyer.getByLabel('Order premium')).toHaveValue('9');
    await expect(buyer.getByText('Order ticket', { exact: true })).toBeVisible();
    await buyer.getByLabel('Order premium').fill('11');
    await expect(buyer.getByText('Estimated: executes now')).toBeVisible();
    const before = await balance(m.quote, accounts[7]);
    await confirm(buyer, 'Buy');
    assert.equal(before - await balance(m.quote, accounts[7]), 9000000n);
    assert.equal((await order(2n)).state, 2);
    assert.equal((await order(3n)).state, 1);
    await expect(buyer.getByText(/Executed 1 contract at 9 MockUSD\./)).toBeVisible();
    evidence.scenarios.push('Desktop buy through ask uses the same ticket; aggregate best price, FIFO and price improvement');
    const option = (await order(2n)).option;
    await buyer.locator(`[data-offer="${option}"]`).click();
    await buyer.getByRole('button', { name: 'Sell owned option', exact: true }).click();
    await expect(buyer.getByLabel('Order strike')).toHaveAttribute('readonly', '');
    await buyer.getByLabel('Order premium').fill('8');
    await confirm(buyer, 'Sell');
    assert.equal(await read(option, optionV4Abi, 'resalePrice'), 8000000n);
    evidence.scenarios.push('Portfolio resale uses the same ticket with immutable series and no new collateral');
    await newOrder(buyer, 'Buy', '2', 1);
    await confirm(buyer, 'Buy');
    const bidId = await count();
    assert.equal((await order(bidId)).state, 1);
    await buyer.locator(`[data-request="${bidId}"]`).getByRole('button', { name: 'Manage bid' }).click();
    await buyer.getByRole('button', { name: 'Cancel bid & recover premium' }).click();
    await expect.poll(async () => (await order(bidId)).state).toBe(3);
    evidence.scenarios.push('Funded bid cancellation refunds its escrow');
    await newOrder(buyer, 'Buy', '2', 1);
    await confirm(buyer, 'Buy');
    const matchBid = await count();
    await seller.getByRole('button', { name: 'Trade', exact: true }).click();
    await seller.getByRole('button', { name: 'Refresh options' }).click();
    await seller.getByLabel('Option type', { exact: true }).selectOption('puts');
    await seller.getByRole('button', { name: /Sell at bid: Put.*premium total 2 MockUSD/ }).click();
    await expect(seller.getByLabel('Order premium')).toHaveValue('2');
    await expect(seller.getByText('Estimated: executes now')).toBeVisible();
    await confirm(seller, 'Sell');
    assert.equal((await order(matchBid)).state, 2);
    evidence.scenarios.push('Mobile bid click presets the same sell ticket and matches a funded put');
    await buyer.getByRole('button', { name: 'Portfolio', exact: true }).click();
    await buyer.getByRole('button', { name: 'Refresh portfolio' }).click();
    await buyer.locator(`[data-offer="${option}"]`).click();
    const stockBefore = await balance(m.underlying, accounts[7]);
    await buyer.getByRole('button', { name: 'Exercise option', exact: true }).click();
    await expect.poll(() => read(option, optionV4Abi, 'state')).toBe(2);
    assert.equal(await balance(m.underlying, accounts[7]), stockBefore + 10n ** 18n);
    assert.equal(await read(option, optionV4Abi, 'resalePrice'), 0n);
    evidence.scenarios.push('Exercise delivers stock and atomically removes the holder resale');
    await newOrder(seller, 'Buy', '2', 1);
    await seller.getByRole('button', { name: 'Review order' }).click();
    await seller.getByRole('checkbox', { name: /I understand: one option/ }).check();
    await seller.getByLabel('Order premium').fill('3');
    await expect(seller.getByRole('button', { name: 'Review order' })).toBeVisible();
    await seller.getByLabel('Order premium').fill('0.001');
    await expect(seller.getByRole('button', { name: 'Review order' })).toBeDisabled();
    await seller.getByLabel('Order premium').fill('3');
    await seller.getByRole('button', { name: 'Review order' }).click();
    await seller.getByRole('checkbox', { name: /I understand: one option/ }).check();
    await seller.evaluate(() => window.__changeChain('0xb626'));
    await expect(seller.getByRole('button', { name: 'Review order' })).toBeVisible();
    assert(await seller.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    evidence.scenarios.push('Mobile ticket fits; price precision, edited terms and changed chain invalidate confirmation');
    assert.deepEqual(errors, []);
    evidence.result = 'passed';
}
finally {
    await browser.close();
    await saveJson(`${process.env.EVIDENCE_DIR}/browser-v4.json`, evidence);
}
console.log(`V4 browser: ${evidence.scenarios.length} scenarios passed.`);
