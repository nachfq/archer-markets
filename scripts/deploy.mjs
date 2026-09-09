import { erc20Abi } from 'viem';
import { access } from 'node:fs/promises';
import { clients, artifact, atRoot, readJson, saveJson, stockAddress, mined, reportError, publicDeployment } from './config.mjs';

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

  let underlying = mode === 'testnet' ? stockAddress() : undefined;
  if (underlying) {
    const code = await publicClient.getCode({ address: underlying });
    if (!code || code === '0x') throw new Error('No stock contract at configured address.');
    const decimals = await publicClient.readContract({ address: underlying, abi: erc20Abi, functionName: 'decimals' });
    if (decimals !== 18) throw new Error('Stock contract must use 18 decimals.');
  }
  const receipts = [];
  async function deploy(name, args = []) {
    const { abi, bytecode } = await artifact(name);
    const receipt = await mined(publicClient, await walletClient.deployContract({ abi, bytecode: bytecode.object, args }));
    receipts.push({ contract: name, address: receipt.contractAddress, transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber.toString() });
    // Preserve evidence even if a later deployment fails.
    await saveJson(`deployments/${chain.id}.partial.json`, { chainId: chain.id, deployer: account.address, receipts });
    console.log(`${name}: ${receipt.contractAddress}`);
    return receipt.contractAddress;
  }
  if (!underlying) underlying = await deploy('MockStock');
  const quote = await deploy('MockUSD');
  const factory = await deploy('OptionFactory', [underlying, quote]);
  const primaryBlock = receipts.at(-1).blockNumber;
  const practiceStock = await deploy('MockStock');
  const practiceFactory = await deploy('OptionFactory', [practiceStock, quote]);
  const practiceBlock = receipts.at(-1).blockNumber;
  const record = {
    chainId: chain.id, name: chain.name, rpcUrl: url,
    explorerUrl: chain.blockExplorers?.default.url || '',
    underlying: { address: underlying, symbol: mode === 'local' ? 'MockSTOCK' : await publicClient.readContract({ address: underlying, abi: erc20Abi, functionName: 'symbol' }), decimals: 18, isMock: mode === 'local' },
    quote: { address: quote, symbol: 'MockUSD', decimals: 6, isMock: true },
    factory, deploymentBlock: primaryBlock,
    marketId: 'primary', label: mode === 'local' ? 'MockSTOCK / MockUSD' : 'TSLA / MockUSD', sandbox: mode === 'local',
    markets: [{ marketId: 'practice', label: 'Practice STOCK / MockUSD', sandbox: true, factory: practiceFactory, deploymentBlock: practiceBlock, underlying: { address: practiceStock, symbol: 'MockSTOCK', decimals: 18, isMock: true }, quote: { address: quote, symbol: 'MockUSD', decimals: 6, isMock: true } }],
  };
  await saveJson(file, { ...record, deployer: account.address, receipts });
  const manifestPath = 'web/lib/generated/deployments.json';
  let manifest = {};
  try { manifest = await readJson(manifestPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Never export a private provider endpoint or API key to the browser.
  manifest[String(chain.id)] = publicDeployment(record);
  await saveJson(manifestPath, manifest);
  console.log(`Saved ${file} and browser manifest. Contracts deployed on chain ${chain.id}.`);
} catch (error) { reportError(error); }
