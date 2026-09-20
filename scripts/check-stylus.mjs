// Read-only network capability probe. No signer, activation, cache bid, or transaction.
import { createPublicClient, http, parseAbi } from 'viem';

const networks = {
  testnet: { chainId: 46630, rpc: 'https://rpc.testnet.chain.robinhood.com' },
  mainnet: { chainId: 4663, rpc: 'https://rpc.mainnet.chain.robinhood.com' },
};
const name = process.argv[2] || 'testnet';
const network = networks[name];
if (!network) throw new Error('Expected testnet or mainnet. This command only reads network state.');
const client = createPublicClient({ transport: http(network.rpc, { timeout: 15_000, retryCount: 1 }) });
const wasm = '0x0000000000000000000000000000000000000071';
const cache = '0x0000000000000000000000000000000000000072';
const wasmAbi = parseAbi([
  'function stylusVersion() view returns (uint16)',
  'function maxStackDepth() view returns (uint32)',
  'function inkPrice() view returns (uint32)',
]);
const cacheAbi = parseAbi(['function allCacheManagers() view returns (address[])']);
try {
  const chainId = await client.getChainId();
  if (chainId !== network.chainId) throw new Error(`Wrong chain: expected ${network.chainId}, received ${chainId}.`);
  const blockNumber = await client.getBlockNumber();
  const [stylusVersion, maxStackDepth, inkPrice, cacheManagers] = await Promise.all([
    ...['stylusVersion', 'maxStackDepth', 'inkPrice'].map(functionName => client.readContract({ address: wasm, abi: wasmAbi, functionName, blockNumber })),
    client.readContract({ address: cache, abi: cacheAbi, functionName: 'allCacheManagers', blockNumber }),
  ]);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), network: name, chainId, blockNumber, stylusVersion, maxStackDepth, inkPrice, cacheManagers }, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  console.log(cacheManagers.length
    ? 'Registered cache managers found. Inspect each manager and its pause/bidding state before use.'
    : 'No registered CacheManager. This does not imply Stylus is unavailable or that no code has ever been cached.');
} catch (error) {
  console.error(error.shortMessage || error.message);
  process.exitCode = 1;
}
