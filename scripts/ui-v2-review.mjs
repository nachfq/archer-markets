// Read-only desktop/mobile acceptance. No wallet signatures or chain mutations.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicClient, http } from 'viem';
import { readJson } from './config.mjs';

const baseUrl = process.env.BROWSER_BASE_URL ?? 'http://localhost:3000';
const manifest = await readJson('deployments/31337.json');
const markets = [manifest, ...(manifest.markets ?? [])].filter(m => m.version === 2 && !m.legacy);
assert.equal(markets.length, 5);
assert(['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname));
const client = createPublicClient({ transport: http('http://127.0.0.1:8545') });
const accounts = await client.request({ method: 'eth_accounts' });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
const errors = [];
try {
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(baseUrl);
    await expect(page.locator('.chain-offer').first()).toBeVisible();
    await expect(page.locator('[data-market]')).toHaveCount(5);
    await expect(page.getByLabel('Strikes', { exact: true })).toHaveValue('10');
    for (const market of markets) {
      await page.locator(`[data-market="${market.marketId}"]`).click();
      await expect(page.getByRole('heading', { level: 1 })).toContainText(market.label.split(' / ')[0]);
      await expect(page.locator('.count-badge').last()).toHaveText('74 offers');
      await page.getByRole('tab', { name: 'Write Options', exact: true }).click();
      await page.getByLabel(/^Quantity of/).fill('0.5');
      await page.getByLabel(/^Exercise payment — total/).fill('185');
      await page.getByLabel(/^Option price — total/).fill('8');
      await page.getByLabel(/^Quantity of/).fill('1');
      await expect(page.getByLabel(/^Exercise payment — total/)).toHaveValue('185');
      await expect(page.getByLabel(/^Option price — total/)).toHaveValue('8');
      await page.getByRole('button', { name: 'Review offer →' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.locator('form')).toBeVisible();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('tab', { name: 'Buy Options', exact: true }).click();
    }
    await page.locator('[data-market="tesla"]').click();
    await page.getByRole('button', { name: 'Strike 370.00', exact: true }).click();
    const lots = page.locator('.lots-open .call-side .chain-offer');
    await expect(lots).toHaveCount(3);
    assert.deepEqual(await lots.locator('.quote-lot').allTextContents(), ['0.1New option', '1New option', '5New option']);
    await lots.first().scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => scrollY);
    await lots.first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    assert.equal(await page.evaluate(() => scrollY), scroll, 'Opening review does not scroll the page');
    await expect(page.locator('[data-slot=drawer-overlay]')).toHaveCount(0);
    await expect(page.locator('.chain-container')).toBeVisible();
    await page.evaluate(() => { window.__sheetNode = document.querySelector('.trade-sheet'); document.querySelectorAll('.lots-open .call-side .chain-offer')[1].click(); });
    assert.equal(await page.evaluate(() => window.__sheetNode === document.querySelector('.trade-sheet')), true, 'Selection updates the same mounted sheet');
    await page.getByRole('button', { name: 'Expand panel height' }).click();
    await expect(page.locator('.trade-sheet')).toHaveClass(/sheet-expanded/);
    await page.getByRole('link', { name: 'How manual exercise works' }).click();
    await expect(page.locator('#manual-exercise')).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.querySelector('.topbar').getBoundingClientRect().top)).toBe(0);
    assert(await page.locator('#manual-exercise').evaluate(el => el.getBoundingClientRect().top) >= 90);
    await page.getByRole('button', { name: '← Back to workspace' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Docs', exact: true }).click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: join(tmpdir(), `options-docs-v2-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Trade', exact: true }).click();
    await page.locator('[data-market="tesla"]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Trade page must not overflow');
    await page.screenshot({ path: join(tmpdir(), `options-chain-v2-${width}.png`), fullPage: true });
    await context.close();
    console.log(`PASS ${width}px: five market contexts, independent totals, fractional lots, persistent nonmodal sheet, Docs anchors/nav/return, no overflow`);
  }
  const testnetUrl = process.env.TESTNET_PREVIEW_URL;
  if (testnetUrl) {
    assert(['localhost', '127.0.0.1'].includes(new URL(testnetUrl).hostname));
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(account => {
      window.__signatures = 0;
      const provider = { isMetaMask: true, on: () => provider, removeListener: () => provider, removeAllListeners: () => provider, request: async ({ method }) => {
        if (['eth_accounts', 'eth_requestAccounts'].includes(method)) return [account];
        if (method === 'eth_chainId') return '0xb626';
        if (['wallet_getCapabilities', 'wallet_requestPermissions'].includes(method)) return [];
        if (method.includes('sign') || method === 'eth_sendTransaction') window.__signatures++;
        throw new Error('Read-only preview');
      } };
      window.ethereum = provider;
    }, accounts[1]);
    const page = await context.newPage();
    await page.goto(testnetUrl);
    await expect(page.getByText('Trading is not available on this network yet', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('tab', { name: 'Write Options', exact: true }).click();
    await page.getByLabel(/^Quantity of/).fill('0.5');
    await page.getByLabel(/^Exercise payment — total/).fill('185');
    await page.getByLabel(/^Option price — total/).fill('8');
    await page.getByRole('button', { name: 'Review offer →' }).click();
    await expect(page.getByRole('button', { name: 'Deposit collateral & write option' })).toBeDisabled();
    assert.equal(await page.evaluate(() => window.__signatures), 0);
    console.log('PASS unconfigured chain 46630: connected preview, zero signing requests, creation disabled');
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
