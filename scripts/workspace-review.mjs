// Read-only UI and metadata acceptance. Wallet fixtures reject every signing request.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createPublicClient, http } from 'viem';
import { getMarkets } from '@stock-options-lab/sdk';

const localUrl = process.env.BROWSER_BASE_URL ?? 'http://localhost:3000';
const testnetUrl = process.env.TESTNET_PREVIEW_URL ?? 'http://localhost:3001';
for (const value of [localUrl, testnetUrl]) assert(['localhost', '127.0.0.1'].includes(new URL(value).hostname));
const deployment = JSON.parse(await readFile(new URL('../deployments/31337.json', import.meta.url), 'utf8'));
assert.equal(deployment.chainId, 31337);
assert(['localhost', '127.0.0.1'].includes(new URL(deployment.rpcUrl).hostname));
const client = createPublicClient({ transport: http(deployment.rpcUrl) });
const [snapshot] = await getMarkets(client, [{ ...deployment, id: deployment.marketId, version: 1, deploymentBlock: BigInt(deployment.deploymentBlock) }]);
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
try {
  const page = await browser.newPage();
  const root = await page.request.get(localUrl);
  assert.equal(root.status(), 200);
  const rootHtml = await root.text();
  assert.match(rootHtml, /og-workspace\.png/);
  const docs = await page.request.get(`${localUrl}/?view=docs&option=0x1111111111111111111111111111111111111111#manual-exercise`);
  assert.equal(docs.status(), 200);
  const docsHtml = await docs.text();
  assert.match(docsHtml, /<title>Documentation · Stock Options Lab/);
  assert.match(docsHtml, /Manual American exercise/);
  for (const kind of [0, 1]) {
    const option = snapshot.positions.find(position => position.optionType === kind);
    assert(option, 'A local call and put are required for detail metadata checks');
    const response = await page.request.get(`${localUrl}/?market=primary&option=${option.address}`);
    assert.equal(response.status(), 200);
    const html = await response.text();
    assert.match(html, new RegExp(`<title>${kind === 0 ? 'Call' : 'Put'} ·`));
    assert(!/og-(workspace|light|trading)\.png/.test(html), 'Option links must not inherit the root social image');
    assert.match(html, /property="og:title"/);
    assert.match(html, /name="twitter:title"/);
  }
  await page.goto(localUrl);
  await expect(page.locator('.chain-offer').first()).toBeVisible();
  await expect(page.locator('.trade-ticket')).toHaveCount(0);
  await expect(page.getByLabel('Strikes', { exact: true })).toHaveValue('10');
  for (const count of ['10', 'all', '5']) {
    await page.getByLabel('Strikes', { exact: true }).selectOption(count);
    await expect(page.getByLabel('Strikes', { exact: true })).toHaveValue(count);
  }
  await page.locator('.chain-offer').first().click();
  const shared = page.url();
  await page.goBack();
  await expect(page.locator('.trade-ticket')).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(shared);
  await expect(page.locator('.purchase-cost')).toBeVisible();
  console.log('PASS root/detail metadata, strike dropdowns, and browser back/forward');
  await page.close();

  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(() => {
      window.__signingRequests = 0;
      const account = '0x1111111111111111111111111111111111111111';
      const provider = {
        isMetaMask: true, on: () => provider, removeListener: () => provider, removeAllListeners: () => provider,
        request: async ({ method }) => {
          if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
          if (method === 'eth_chainId') return '0x' + (46630).toString(16);
          if (method === 'wallet_getCapabilities' || method === 'wallet_requestPermissions') return [];
          if (method.includes('sign') || method === 'eth_sendTransaction') window.__signingRequests++;
          throw new Error('Read-only preview fixture rejects this request');
        },
      };
      window.ethereum = provider;
    });
    const preview = await context.newPage();
    await preview.goto(testnetUrl);
    await expect(preview.getByText('Trading is not available on this network yet', { exact: true })).toBeVisible();
    await expect(preview.locator('.chain-offer')).toHaveCount(0);
    await preview.getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await expect(preview.getByLabel('Wallet menu')).toBeVisible();
    await preview.getByLabel('Wallet menu').click();
    await expect(preview.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible();
    await preview.keyboard.press('Escape');
    await expect(preview.getByRole('button', { name: 'Disconnect', exact: true })).not.toBeVisible();
    await expect(preview.getByLabel('Wallet menu')).toBeFocused();
    await preview.getByRole('button', { name: 'Write Options', exact: true }).click();
    await preview.getByLabel(/^Quantity of/).fill('0.1');
    await preview.getByLabel(/^Strike per token/).fill('100');
    await preview.getByLabel(/^Premium per token/).fill('5');
    await preview.getByRole('button', { name: 'Review offer →' }).click();
    await expect(preview.getByRole('button', { name: 'Deposit collateral & write option' })).toBeDisabled();
    assert.equal(await preview.evaluate(() => window.__signingRequests), 0);
    assert.equal(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await preview.screenshot({ path: `/tmp/options-testnet-preview-${width}.png`, fullPage: true });
    await context.close();
  }
  console.log('PASS unconfigured testnet: previews available, no signing, wallet keyboard behavior, desktop/mobile reflow');
} finally { await browser.close(); }
