// Read-only local ownership review. The injected display fixture rejects signing.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { createPublicClient, http } from 'viem';
import { getMarkets } from '@stock-options-lab/sdk';

const base = process.env.BROWSER_BASE_URL ?? 'http://localhost:3000';
const deployment = JSON.parse(await readFile(new URL('../deployments/31337.json', import.meta.url), 'utf8'));
for (const url of [base, deployment.rpcUrl]) {
  assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Local preview required.');
}
const client = createPublicClient({ transport: http(deployment.rpcUrl) });
assert.equal(await client.getChainId(), 31337);
const [snapshot] = await getMarkets(client, [{ ...deployment, id: deployment.marketId, version: 1, deploymentBlock: BigInt(deployment.deploymentBlock) }]);
const option = snapshot.positions.find(p => p.state === 0 && p.expiry > snapshot.timestamp);
assert(option, 'This read-only review requires at least one unexpired written option.');
const buyer = ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'].find(a => a.toLowerCase() !== option.writer.toLowerCase());
const output = '/tmp/options-writer-ux';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
try {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    for (const [role, account] of [['writer', option.writer], ['buyer', buyer]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      await context.addInitScript(({ account }) => {
        const provider = {
          isMetaMask: true, selectedAddress: account, chainId: '0x7a69', networkVersion: '31337',
          isConnected: () => true, on: () => provider, removeListener: () => provider, removeAllListeners: () => provider,
          request: async ({ method, params }) => {
            if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
            if (method === 'eth_chainId') return '0x7a69';
            if (method === 'net_version') return '31337';
            if (method === 'wallet_switchEthereumChain' && Number(params?.[0]?.chainId) === 31337) return null;
            if (method === 'wallet_getCapabilities' || method === 'wallet_requestPermissions') return [];
            throw new Error('This visual fixture does not sign or send transactions.');
          },
        };
        window.ethereum = provider;
      }, { account });
      const page = await context.newPage();
      await page.goto(base);
      await expect(page.getByRole('button', { name: 'Refresh options', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
      await expect(page.getByLabel('Wallet menu')).toBeVisible();
      await page.getByLabel('Filter by writer').selectOption(role === 'writer' ? 'mine' : 'others');
      if (width < 720 && option.optionType === 1) await page.getByLabel('Option type', { exact: true }).selectOption('puts');
      const owner = role === 'writer' ? 'you' : 'other';
      const card = page.locator(`.chain-offer[data-owner="${owner}"]:visible`).first();
      await expect(card).toBeVisible();
      await expect(page.locator(`.chain-offer[data-owner="${role === 'writer' ? 'other' : 'you'}"]`)).toHaveCount(0);
      await page.screenshot({ path: `${output}/${name}-${role}-market.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await card.click();
      await page.locator('.contract-details summary').click();
      await expect(page.getByRole('region', { name: 'Option collateral' })).toBeVisible();
      if (role === 'writer') await expect(page.getByRole('button', { name: /^Buy (call|put) · / })).toHaveCount(0);
      await page.screenshot({ path: `${output}/${name}-${role}-collateral.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      console.log(`PASS ${name} ${role}: ownership filter, card, collateral detail and no overflow; no transactions sent`);
      await context.close();
    }
  }
} finally { await browser.close(); }
