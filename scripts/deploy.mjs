import { erc20Abi } from 'viem';
import { access } from 'node:fs/promises';
import { clients, artifact, atRoot, readJson, saveJson, quoteAddress, stockMarkets, mined, reportError, publicDeployment, DEFAULT_BASE_FEE, DEFAULT_FEE_BPS } from './config.mjs';

try {
  const mode = process.argv[2];
  const { chain, publicClient, walletClient, account, url } = await clients(mode);
  const file = `deployments/${chain.id}.json`;
  try {
    await access(atRoot(file));
    const existing = await readJson(file);
    if (existing.factory && (await publicClient.getCode({ address: existing.factory }))?.length > 2) {
      throw new Error(`Deployment already exists: ${existing.factory}. Existing contracts were preserved. Use that manifest.`);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if ((await publicClient.getBalance({ address: account.address })) === 0n) throw new Error(`No gas funds. Fund ${account.address} with ${mode === 'local' ? 'local' : 'Robinhood testnet'} ETH and retry.`);

  const receipts = [];
  async function deploy(name, args = [], marketId) {
    const { abi, bytecode } = await artifact(name);
    const receipt = await mined(publicClient, await walletClient.deployContract({ abi, bytecode: bytecode.object, args }));
    receipts.push({ contract: name, ...(marketId ? { marketId } : {}), address: receipt.contractAddress, transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber.toString() });
    await saveJson(`deployments/${chain.id}.partial.json`, { chainId: chain.id, deployer: account.address, receipts });
    console.log(`${name}${marketId ? ` (${marketId})` : ''}: ${receipt.contractAddress}`);
    return receipts.at(-1);
  }
  async function token(address, expectedDecimals, expectedSymbol) {
    const [code, decimals, symbol] = await Promise.all([
      publicClient.getCode({ address }),
      publicClient.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
      publicClient.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
    ]);
    if (!code || code === '0x' || decimals !== expectedDecimals) throw new Error(`${expectedSymbol} must exist and use ${expectedDecimals} decimals.`);
    if (symbol !== expectedSymbol) throw new Error(`Expected ${expectedSymbol}, received ${symbol}.`);
    return { address, symbol, decimals, isMock: mode === 'local' };
  }

  const quote = mode === 'testnet'
    ? await token(quoteAddress(), 6, 'USDG')
    : await token((await deploy('MockUSD')).address, 6, 'MockUSD');
  const markets = [];
  if (mode === 'testnet') {
    for (const spec of stockMarkets()) {
      const underlying = await token(spec.address, 18, spec.symbol);
      const deployment = await deploy('OptionMarketV4', [underlying.address, quote.address, account.address, DEFAULT_BASE_FEE, DEFAULT_FEE_BPS], spec.marketId);
      markets.push({ marketId: spec.marketId, label: `${underlying.symbol} / ${quote.symbol}`, sandbox: false, version: 4, tickSize: '10000', factory: deployment.address, deploymentBlock: deployment.blockNumber, feeRecipient: account.address, baseFee: DEFAULT_BASE_FEE.toString(), feeBps: DEFAULT_FEE_BPS, underlying, quote });
    }
  } else {
    for (const spec of [{ marketId: 'primary', label: 'MockSTOCK / MockUSD' }, { marketId: 'practice', label: 'Practice STOCK / MockUSD' }]) {
      const underlying = await token((await deploy('MockStock')).address, 18, 'MockSTOCK');
      const deployment = await deploy('OptionMarketV4', [underlying.address, quote.address, account.address, DEFAULT_BASE_FEE, DEFAULT_FEE_BPS], spec.marketId);
      markets.push({ marketId: spec.marketId, label: spec.label, sandbox: true, version: 4, tickSize: '10000', factory: deployment.address, deploymentBlock: deployment.blockNumber, feeRecipient: account.address, baseFee: DEFAULT_BASE_FEE.toString(), feeBps: DEFAULT_FEE_BPS, underlying, quote });
    }
  }
  const [primary, ...additional] = markets;
  const record = {
    chainId: chain.id, name: chain.name, rpcUrl: url, explorerUrl: chain.blockExplorers?.default.url || '',
    ...primary, ...(additional.length ? { markets: additional } : {}),
  };
  await saveJson(file, { ...record, deployer: account.address, receipts });
  const manifestPath = 'web/lib/generated/deployments.json';
  let manifest = {};
  try { manifest = await readJson(manifestPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  manifest[String(chain.id)] = publicDeployment(record);
  await saveJson(manifestPath, manifest);
  console.log(`Saved ${file} and browser manifest. ${markets.length} market contracts deployed on chain ${chain.id}.`);
} catch (error) { reportError(error); }
