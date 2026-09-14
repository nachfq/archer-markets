// Local-only visual and usability acceptance; does not send wallet transactions.
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { encodeFunctionData } from 'viem';
const base = process.env.BROWSER_BASE_URL ?? 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local preview required.');
const output = process.env.UX_REVIEW_OUTPUT ?? '/tmp/options-ux-review';
await mkdir(output, { recursive: true });
const abi = JSON.parse(await readFile(new URL('../contracts/out/OptionFactory.sol/OptionFactory.json', import.meta.url), 'utf8')).abi;
const countData = encodeFunctionData({ abi, functionName: 'optionCount' });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const evidence = [];
async function inspect(page, name) {
  const layout = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('p,small,span,button,label,h1,h2,h3,summary')].filter(e => e.getClientRects().length);
    const rgb = value => value.match(/[\d.]+/g)?.map(Number) ?? [255,255,255];
    const luminance = color => color.slice(0,3).map(n => n/255).map(n => n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4).reduce((sum,n,i) => sum+n*[.2126,.7152,.0722][i],0);
    const ratios = [];
    for (const node of nodes) {
      if (!node.textContent.trim() || node.closest('[disabled]')) continue;
      const style = getComputedStyle(node);
      let ancestor = node, background = [255,255,255];
      while (ancestor) {
        const candidate = rgb(getComputedStyle(ancestor).backgroundColor);
        if (candidate.length === 3 || candidate[3] === 1) { background = candidate; break; }
        ancestor = ancestor.parentElement;
      }
      const levels = [luminance(rgb(style.color)), luminance(background)].sort((a,b)=>a-b);
      const ratio = (levels[1]+.05)/(levels[0]+.05);
      ratios.push({ text: node.textContent.trim().slice(0,50), ratio });
    }
    return { viewport: innerWidth, content: document.documentElement.scrollWidth, minimumText: Math.min(...nodes.map(e => parseFloat(getComputedStyle(e).fontSize))), minimumContrast: Math.min(...ratios.map(r=>r.ratio)), contrastFailures: ratios.filter(r=>r.ratio<4.5) };
  });
  expect(layout.content, `${name}: horizontal overflow`).toBeLessThanOrEqual(layout.viewport);
  expect(layout.minimumText, `${name}: small text`).toBeGreaterThanOrEqual(14);
  expect(layout.contrastFailures, `${name}: text contrast`).toEqual([]);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  evidence.push({ name, ...layout });
}
try {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 768, 1024], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(base);
    await page.locator('.chain-offer:visible').first().waitFor();
    await expect(page.getByLabel('Strikes', { exact: true })).toHaveValue('10');
    await expect(page.locator('select[aria-label="Market"], select[aria-label="Trade action"], select[aria-label="Expiration"]')).toHaveCount(0);
    await inspect(page, name);
    if (width < 768) {
      await page.getByLabel('Option type', { exact: true }).selectOption('puts');
      await expect(page.locator('.call-side').first()).not.toBeVisible();
      await expect(page.locator('.put-side').first()).toBeVisible();
      await page.getByLabel('Option type', { exact: true }).selectOption('calls');
    }
    const quote = page.locator('.chain-offer:visible').first();
    const selectedAddress = await quote.getAttribute('data-offer');
    await quote.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.purchase-cost')).toBeVisible();
    await expect(page.locator('.right-summary')).toBeVisible();
    await expect(page.locator('.deadline-summary')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect wallet to continue' })).toBeVisible();
    if (width < 768) await expect(page.locator('#option-review-heading')).toBeFocused();
    await inspect(page, `${name}-ticket`);
    await expect(page.locator('.right-summary')).toContainText('Strike ·');
    const reviewUrl = page.url();
    await page.getByRole('link', { name: 'How manual exercise works' }).click();
    await expect(page.locator('#manual-exercise')).toBeFocused();
    await inspect(page, `${name}-docs`);
    await page.getByRole('button', { name: 'Back to workspace', exact: false }).click();
    await expect(page).toHaveURL(reviewUrl);
    await expect(page.locator('.purchase-cost')).toBeVisible();
    await page.getByRole('button', { name: /Back to options/ }).click();
    await expect(page.locator(`[data-offer="${selectedAddress}"]`)).toBeFocused();
    if (width === 1440) {
      // Verify the layout viewport reflow associated with 200% zoom on a 1440px desktop.
      // This does not claim to drive the browser chrome zoom setting.
      const zoomContext = await browser.newContext({ viewport: { width: 720, height: 500 }, deviceScaleFactor: 2 });
      const zoomPage = await zoomContext.newPage();
      await zoomPage.goto(base);
      await zoomPage.locator('.chain-offer:visible').first().waitFor();
      await inspect(zoomPage, 'zoom-200-reflow');
      await zoomContext.close();
    }
    await page.getByRole('button', { name: 'Write Options', exact: true }).click();
    await page.getByLabel('Write expiration', { exact: true }).waitFor();
    await inspect(page, `${name}-create`);
    await page.getByLabel(/^Quantity of/).fill('0.1');
    await page.getByLabel(/^Strike per token/).fill('100');
    await page.getByLabel(/^Premium per token/).fill('5');
    await page.getByRole('button', { name: 'Review offer →' }).click();
    await expect(page.locator('#write-review-heading')).toBeFocused();
    await expect(page.getByRole('button', { name: 'Connect wallet to continue' })).toBeVisible();
    if (width < 768) await expect(page.locator('.create-layout > form')).not.toBeVisible();
    await inspect(page, `${name}-write-review`);
    await page.getByRole('link', { name: 'How manual exercise works' }).click();
    await page.getByRole('button', { name: 'Back to workspace', exact: false }).click();
    await expect(page.locator('#write-review-heading')).toBeVisible();
    await page.getByRole('button', { name: /Back to options/ }).click();
    await expect(page.getByRole('button', { name: 'Review offer →' })).toBeFocused();
    await expect(page.getByLabel(/^Quantity of/)).toHaveValue('0.1');
    if (width >= 768) {
      await page.getByRole('button', { name: 'Review offer →' }).click();
      await page.getByLabel(/^Premium per token/).fill('6');
      await expect(page.locator('.trade-ticket')).toHaveCount(0);
      await page.getByLabel(/^Premium per token/).fill('5');
      await expect(page.locator('.trade-ticket')).toHaveCount(0);
    }
    await page.locator('[data-market="practice"]').click();
    await expect(page.getByLabel(/^Quantity of/)).toHaveValue('');
    await expect(page.locator('.trade-ticket')).toHaveCount(0);
    await page.close();
  }
  const empty = await browser.newPage();
  await empty.route('http://127.0.0.1:8545/**', async route => {
    const request = route.request().postDataJSON();
    if (request?.method === 'eth_call' && request.params[0].data === countData) {
      await route.fulfill({ json: { jsonrpc: '2.0', id: request.id, result: `0x${'0'.repeat(64)}` } });
    } else await route.continue();
  });
  await empty.goto(base);
  await expect(empty.getByRole('heading', { name: 'No options are listed yet' })).toBeVisible();
  await inspect(empty, 'empty-market');
  await empty.close();
  const offline = await browser.newPage();
  await offline.route('http://127.0.0.1:8545/**', route => route.abort());
  await offline.goto(base);
  await expect(offline.getByText('Could not refresh this market', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(offline.getByRole('button', { name: 'Retry connection', exact: true })).toBeVisible();
  await inspect(offline, 'connection-error');
  await offline.unrouteAll();
  await offline.getByRole('button', { name: 'Retry connection', exact: true }).click();
  await expect(offline.locator('.chain-offer').first()).toBeVisible();
  evidence.push({ name: 'connection-recovery', result: 'passed' });
  await offline.close();
  await writeFile(`${output}/review.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
