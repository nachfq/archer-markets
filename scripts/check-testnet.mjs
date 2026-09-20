import { erc20Abi, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { clients, stockAddress, reportError } from './config.mjs';
try {
  const { chain, publicClient } = await clients('testnet', false);
  const underlying = stockAddress();
  const code = await publicClient.getCode({ address: underlying });
  if (!code || code === '0x') throw new Error('Configured stock address has no contract bytecode.');
  const [decimals, symbol, blockNumber] = await Promise.all([
    publicClient.readContract({ address: underlying, abi: erc20Abi, functionName: 'decimals' }),
    publicClient.readContract({ address: underlying, abi: erc20Abi, functionName: 'symbol' }),
    publicClient.getBlockNumber(),
  ]);
  if (decimals !== 18) throw new Error(`Expected 18 stock decimals, received ${decimals}.`);
  console.log(JSON.stringify({ chainId: chain.id, blockNumber: blockNumber.toString(), stock: underlying, symbol, decimals }, null, 2));
  if (process.env.DEPLOYER_PRIVATE_KEY) {
    const { address } = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
    const [eth, stock] = await Promise.all([publicClient.getBalance({ address }), publicClient.readContract({ address: underlying, abi: erc20Abi, functionName: 'balanceOf', args: [address] })]);
    console.log(JSON.stringify({ deployer: address, testETH: formatEther(eth), stockRaw: stock.toString() }, null, 2));
  }
  console.log('Read-only check; no transfers, faucet requests or deployments performed. Token provenance must also be compared with the faucet transfer before a public demo.');
} catch (error) { reportError(error); }
