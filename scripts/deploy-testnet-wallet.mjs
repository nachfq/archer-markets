import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  encodeDeployData,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  isAddressEqual,
  parseAbi,
} from 'viem';
import {
  artifact,
  atRoot,
  clients,
  localAccount,
  publicDeployment,
  quoteAddress,
  readJson,
  reportError,
  saveJson,
  stockMarkets,
  DEFAULT_BASE_FEE,
  DEFAULT_FEE_BPS,
} from './config.mjs';

const EXPECTED_CHAIN_ID = 46630;
const PUBLIC_RPC_URL = 'https://rpc.testnet.chain.robinhood.com';
const EXPLORER_URL = 'https://explorer.testnet.chain.robinhood.com';
const marketAbi = parseAbi([
  'function underlying() view returns (address)',
  'function quote() view returns (address)',
  'function version() view returns (uint256)',
  'function feeRecipient() view returns (address)',
  'function baseFee() view returns (uint256)',
  'function feeBps() view returns (uint16)',
]);

export function deploymentHtml({ account, token }) {
  const values = JSON.stringify({ account, token, chainId: EXPECTED_CHAIN_ID, rpcUrl: PUBLIC_RPC_URL, explorerUrl: EXPLORER_URL });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Archer Markets testnet deployment</title>
  <style>
    :root { color-scheme: dark; font: 16px/1.5 system-ui, sans-serif; background: #0f1214; color: #edf4ef; }
    body { max-width: 720px; margin: 8vh auto; padding: 0 24px; }
    main { border: 1px solid #334039; border-radius: 12px; padding: 28px; background: #151a17; }
    h1 { margin-top: 0; font-size: 1.6rem; } code { word-break: break-all; color: #8ee3aa; }
    button { font: inherit; padding: 10px 16px; margin: 8px 8px 8px 0; border: 0; border-radius: 7px; cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: .45; } #deploy, #connect { background: #70db91; color: #08130c; font-weight: 700; }
    #deploy[hidden], #connect[hidden] { display: none; } #status { min-height: 4.5em; white-space: pre-wrap; }
    .warning { color: #ffd18a; } a { color: #8ee3aa; }
  </style>
</head>
<body><main>
  <h1>Deploy Archer Markets V4</h1>
  <p>Robinhood Chain Testnet only. Expected signer:</p>
  <p><code>${account}</code></p>
  <p class="warning">MetaMask will show five contract deployments: one market per native testnet Stock Token, all quoted in USDG. Check chain 46630 and this account before approving each one.</p>
  <p>Each market permanently charges buyers 0.01 USDG + 0.10% of the executed premium. Fees go to the expected signer above; there is no admin method to change them.</p>
  <button id="connect">Connect MetaMask</button><button id="deploy" hidden>Deploy next stock market</button>
  <p id="status">No transaction has been requested.</p>
  <ol id="receipts"></ol>
</main><script>
const config = ${values};
const connectButton = document.querySelector('#connect');
const deployButton = document.querySelector('#deploy');
const status = document.querySelector('#status');
const receiptList = document.querySelector('#receipts');
let selectedAccount = null;
const headers = { 'content-type': 'application/json', 'x-deployment-token': config.token };
const shortError = error => error?.shortMessage || error?.message || String(error);

async function ensureChain() {
  const expected = '0x' + config.chainId.toString(16);
  if ((await window.ethereum.request({ method: 'eth_chainId' })).toLowerCase() === expected) return;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: expected }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: expected, chainName: 'Robinhood Chain Testnet',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: [config.rpcUrl], blockExplorerUrls: [config.explorerUrl],
    }] });
  }
}

async function connect() {
  if (!window.ethereum) throw new Error('No injected EVM wallet found. Open this page in a browser with MetaMask, Rabby or a compatible wallet.');
  await ensureChain();
  const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!account || account.toLowerCase() !== config.account.toLowerCase()) throw new Error('Connected account does not match the expected funded wallet.');
  selectedAccount = account;
  const response = await fetch('/api/status', { headers: { 'x-deployment-token': config.token } });
  const state = await response.json();
  if (!response.ok) throw new Error(state.error);
  renderState(state);
  connectButton.hidden = true;
  deployButton.hidden = state.complete;
  deployButton.disabled = false;
}

function renderState(state) {
  status.textContent = state.complete
    ? 'Deployment complete. The local and browser manifests were saved. You can close this page.'
    : (state.receipts.length ? state.receipts.length + ' of 5 stock markets deployed.' : 'Wallet verified. Ready to deploy the first stock market.');
  receiptList.replaceChildren(...state.receipts.map(item => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = config.explorerUrl + '/tx/' + item.transactionHash;
    link.target = '_blank'; link.rel = 'noreferrer';
    link.textContent = item.label + ': ' + item.address;
    li.append(link); return li;
  }));
}

connectButton.addEventListener('click', async () => {
  connectButton.disabled = true; status.textContent = 'Connecting wallet…';
  try { await connect(); } catch (error) { status.textContent = shortError(error); connectButton.disabled = false; }
});

deployButton.addEventListener('click', async () => {
  deployButton.disabled = true;
  try {
    await ensureChain();
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (!selectedAccount || accounts[0]?.toLowerCase() !== config.account.toLowerCase()) throw new Error('Expected wallet is no longer connected.');
    const response = await fetch('/api/next', { headers: { 'x-deployment-token': config.token } });
    const step = await response.json();
    if (!response.ok) throw new Error(step.error);
    status.textContent = 'Confirm ' + step.label + ' in your wallet…';
    const transactionHash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: selectedAccount, data: step.data }] });
    status.textContent = 'Waiting for ' + step.contract + ' to be mined…\\n' + transactionHash;
    const saved = await fetch('/api/receipt', { method: 'POST', headers, body: JSON.stringify({ transactionHash }) });
    const state = await saved.json();
    if (!saved.ok) throw new Error(state.error);
    renderState(state);
    deployButton.disabled = state.complete;
  } catch (error) {
    status.textContent = shortError(error);
    deployButton.disabled = false;
  }
});
</script></body></html>`;
}

async function bodyJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) throw new Error('Request body is too large.');
  }
  return JSON.parse(body || '{}');
}

async function main() {
  const rawAccount = process.argv[2];
  if (!rawAccount) throw new Error('Expected the funded wallet address as the first argument.');
  const account = getAddress(rawAccount);
  if (Array.from({ length: 10 }, (_, index) => localAccount(index).address).some(address => isAddressEqual(address, account))) {
    throw new Error('Public Anvil development accounts cannot be used on testnet.');
  }
  const { chain, publicClient } = await clients('testnet', false);
  if (chain.id !== EXPECTED_CHAIN_ID) throw new Error('Expected Robinhood Chain Testnet.');
  const manifestPath = `deployments/${chain.id}.json`;
  try {
    await access(atRoot(manifestPath));
    const existing = await readJson(manifestPath);
    if (existing.factory && (await publicClient.getCode({ address: existing.factory }))?.length > 2) {
      throw new Error(`Deployment already exists: ${existing.factory}. Existing contracts were preserved.`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const marketSpecs = stockMarkets();
  const quote = quoteAddress();
  const [quoteCode, quoteDecimals, quoteSymbol, eth, quoteBalance] = await Promise.all([
    publicClient.getCode({ address: quote }),
    publicClient.readContract({ address: quote, abi: erc20Abi, functionName: 'decimals' }),
    publicClient.readContract({ address: quote, abi: erc20Abi, functionName: 'symbol' }),
    publicClient.getBalance({ address: account }),
    publicClient.readContract({ address: quote, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
  ]);
  if (!quoteCode || quoteCode === '0x') throw new Error('No quote contract at the configured address.');
  if (quoteDecimals !== 6 || quoteSymbol !== 'USDG') throw new Error('Quote contract must identify as 6-decimal USDG.');
  if (eth === 0n) throw new Error(`No gas funds. Fund ${account} with Robinhood testnet ETH and retry.`);
  const stocks = await Promise.all(marketSpecs.map(async spec => {
    const [code, decimals, symbol, balance] = await Promise.all([
      publicClient.getCode({ address: spec.address }),
      publicClient.readContract({ address: spec.address, abi: erc20Abi, functionName: 'decimals' }),
      publicClient.readContract({ address: spec.address, abi: erc20Abi, functionName: 'symbol' }),
      publicClient.readContract({ address: spec.address, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
    ]);
    if (!code || code === '0x' || decimals !== 18 || symbol !== spec.symbol) throw new Error(`${spec.symbol} is not the expected 18-decimal Stock Token.`);
    return { ...spec, decimals, balance };
  }));

  const marketArtifact = await artifact('OptionMarketV4');
  const receipts = [];
  function next() {
    const spec = stocks[receipts.length];
    return spec ? { contract: 'OptionMarketV4', marketId: spec.marketId, label: `${spec.symbol} / ${quoteSymbol}`, args: [spec.address, quote, account, DEFAULT_BASE_FEE, DEFAULT_FEE_BPS] } : null;
  }
  function publicState() { return { complete: receipts.length === stocks.length, receipts }; }
  function planned() {
    const step = next();
    if (!step) return null;
    return { ...step, data: encodeDeployData({ abi: marketArtifact.abi, bytecode: marketArtifact.bytecode.object, args: step.args }) };
  }
  async function finalize() {
    const markets = await Promise.all(stocks.map(async (spec, index) => {
      const factory = receipts[index].address;
      const [deployedUnderlying, deployedQuote, version, deployedRecipient, deployedBaseFee, deployedFeeBps] = await Promise.all([
        publicClient.readContract({ address: factory, abi: marketAbi, functionName: 'underlying' }),
        publicClient.readContract({ address: factory, abi: marketAbi, functionName: 'quote' }),
        publicClient.readContract({ address: factory, abi: marketAbi, functionName: 'version' }),
        publicClient.readContract({ address: factory, abi: marketAbi, functionName: 'feeRecipient' }),
        publicClient.readContract({ address: factory, abi: marketAbi, functionName: 'baseFee' }),
        publicClient.readContract({ address: factory, abi: marketAbi, functionName: 'feeBps' }),
      ]);
      if (!isAddressEqual(deployedUnderlying, spec.address) || !isAddressEqual(deployedQuote, quote) || version !== 4n || !isAddressEqual(deployedRecipient, account) || deployedBaseFee !== DEFAULT_BASE_FEE || deployedFeeBps !== DEFAULT_FEE_BPS) throw new Error(`${spec.symbol} market validation failed.`);
      return { marketId: spec.marketId, label: `${spec.symbol} / ${quoteSymbol}`, sandbox: false, version: 4, tickSize: '10000', factory, deploymentBlock: receipts[index].blockNumber, feeRecipient: account, baseFee: DEFAULT_BASE_FEE.toString(), feeBps: DEFAULT_FEE_BPS, underlying: { address: spec.address, symbol: spec.symbol, decimals: 18, isMock: false }, quote: { address: quote, symbol: quoteSymbol, decimals: 6, isMock: false } };
    }));
    const [primary, ...additional] = markets;
    const record = { chainId: chain.id, name: chain.name, rpcUrl: chain.rpcUrls.default.http[0], explorerUrl: EXPLORER_URL, ...primary, markets: additional };
    await saveJson(manifestPath, { ...record, deployer: account, receipts });
    const browserManifestPath = 'web/lib/generated/deployments.json';
    const manifest = await readJson(browserManifestPath);
    manifest[String(chain.id)] = publicDeployment(record);
    await saveJson(browserManifestPath, manifest);
  }

  const token = randomBytes(24).toString('hex');
  const server = createServer(async (request, response) => {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('content-security-policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'");
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/' && url.searchParams.get('token') === token) {
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.end(deploymentHtml({ account, token }));
        return;
      }
      if (request.headers['x-deployment-token'] !== token) throw new Error('Invalid local deployment token.');
      if (request.method === 'GET' && url.pathname === '/api/status') {
        response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(publicState())); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/next') {
        const step = planned();
        response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(step || { complete: true })); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/receipt') {
        const step = planned();
        if (!step) throw new Error('Deployment is already complete.');
        const { transactionHash } = await bodyJson(request);
        if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash || '')) throw new Error('Invalid transaction hash.');
        if (receipts.some(item => item.transactionHash.toLowerCase() === transactionHash.toLowerCase())) throw new Error('Transaction was already recorded.');
        const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, timeout: 180_000 });
        const transaction = await publicClient.getTransaction({ hash: transactionHash });
        if (receipt.status !== 'success') throw new Error(`Transaction reverted: ${transactionHash}`);
        if (!isAddressEqual(transaction.from, account)) throw new Error('Transaction signer does not match the expected wallet.');
        if (transaction.to !== null || transaction.input.toLowerCase() !== step.data.toLowerCase()) throw new Error('Mined transaction does not match the planned contract deployment.');
        if (!receipt.contractAddress) throw new Error('Deployment receipt has no contract address.');
        const item = { contract: step.contract, marketId: step.marketId, label: step.label, address: receipt.contractAddress, transactionHash, blockNumber: receipt.blockNumber.toString() };
        receipts.push(item);
        await saveJson(`deployments/${chain.id}.partial.json`, { chainId: chain.id, deployer: account, receipts });
        if (receipts.length === stocks.length) await finalize();
        response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(publicState()));
        if (receipts.length === stocks.length) setTimeout(() => server.close(), 1500);
        return;
      }
      response.statusCode = 404; response.end('Not found');
    } catch (error) {
      response.statusCode = 400;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ error: error.shortMessage || error.message || 'Operation failed.' }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(4179, '127.0.0.1', resolve);
  });
  console.log(`Wallet: ${account}`);
  console.log(`Balances: ${formatEther(eth)} testETH, ${formatUnits(quoteBalance, quoteDecimals)} ${quoteSymbol}`);
  console.log(`Stocks: ${stocks.map(stock => `${formatUnits(stock.balance, stock.decimals)} ${stock.symbol}`).join(', ')}`);
  console.log(`Quote: ${quote}`);
  console.log(`Fee: ${formatUnits(DEFAULT_BASE_FEE, quoteDecimals)} ${quoteSymbol} + ${DEFAULT_FEE_BPS} bps per execution -> ${account}`);
  console.log(`Open http://127.0.0.1:4179/?token=${token}`);
  console.log('The local signer never receives or stores the private key. Press Ctrl+C to cancel.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(reportError);
