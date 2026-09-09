import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, defineChain, http, getAddress } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const TESTNET_STOCK = '0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E';
const localMnemonic = 'test test test test test test test test test test test junk';
export const localAccount = (index = 0) => mnemonicToAccount(localMnemonic, { addressIndex: index });
export const atRoot = (...parts) => resolve(root, ...parts);
export async function readJson(path) { return JSON.parse(await readFile(atRoot(path), 'utf8')); }
export async function saveJson(path, value) {
  const target = atRoot(path);
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(`${target}.tmp`, JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n');
  await rename(`${target}.tmp`, target);
}
export const artifact = name => readJson(`contracts/out/${name}.sol/${name}.json`);

export function network(mode) {
  if (!['local', 'testnet'].includes(mode)) throw new Error('Expected local or testnet. Mainnet is not supported.');
  const isLocal = mode === 'local';
  const id = isLocal ? 31337 : 46630;
  const url = isLocal ? process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545' : process.env.RH_RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
  const explorerUrl = isLocal ? '' : 'https://explorer.testnet.chain.robinhood.com';
  return defineChain({ id, name: isLocal ? 'Local Anvil' : 'Robinhood Chain Testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [url] } }, ...(explorerUrl ? { blockExplorers: { default: { name: 'Blockscout', url: explorerUrl } } } : {}), testnet: true });
}
export async function clients(mode, signing = true, buyer = false) {
  const chain = network(mode);
  const url = chain.rpcUrls.default.http[0];
  const publicClient = createPublicClient({ chain, transport: http(url, { timeout: 20_000, retryCount: 2 }), pollingInterval: 500 });
  const actual = await publicClient.getChainId();
  if (actual !== chain.id) throw new Error(`Wrong RPC network: expected ${chain.id}, received ${actual}. No transactions sent.`);
  if (mode === 'local') {
    const version = await publicClient.request({ method: 'web3_clientVersion' });
    if (!version.toLowerCase().includes('anvil')) throw new Error('Local operations require an Anvil node.');
  }
  if (!signing) return { chain, publicClient, url };
  let account;
  if (mode === 'local') account = localAccount(buyer ? 1 : 0);
  else {
    const keyName = buyer ? 'BUYER_PRIVATE_KEY' : 'DEPLOYER_PRIVATE_KEY';
    const key = process.env[keyName];
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${keyName} is missing or invalid. Use a disposable testnet account in the ignored .env file.`);
    account = privateKeyToAccount(key);
    if (Array.from({ length: 10 }, (_, i) => localAccount(i).address).includes(account.address)) throw new Error('Public Anvil development accounts cannot be used on testnet.');
  }
  const walletClient = createWalletClient({ account, chain, transport: http(url, { timeout: 20_000, retryCount: 0 }) });
  return { chain, publicClient, walletClient, account, url };
}
export async function mined(publicClient, hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== 'success') throw new Error(`Transaction reverted: ${hash}`);
  return receipt;
}
export function stockAddress() { return getAddress(process.env.RH_STOCK_ADDRESS || TESTNET_STOCK); }
export function publicDeployment(record) {
  if (![31337, 46630].includes(record.chainId)) throw new Error('Unsupported deployment chain.');
  // Explicit allowlist: private provider endpoints, signing data, and receipts never go into browser config.
  const { chainId, name, explorerUrl, underlying, quote, factory, deploymentBlock } = record;
  return { chainId, name, explorerUrl, underlying, quote, factory, deploymentBlock,
    rpcUrl: chainId === 31337 ? 'http://127.0.0.1:8545' : 'https://rpc.testnet.chain.robinhood.com' };
}
export function reportError(error) {
  // Never dump account objects, environment values or signed request bodies.
  console.error(error.shortMessage || error.message || 'Operation failed.');
  process.exitCode = 1;
}
