import { writeFile } from 'node:fs/promises';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { atRoot, reportError } from './config.mjs';
try {
  const key = generatePrivateKey();
  await writeFile(atRoot('.env'), `DEPLOYER_PRIVATE_KEY=${key}\nRH_RPC_URL=https://rpc.testnet.chain.robinhood.com\nBUYER_PRIVATE_KEY=\n`, { mode: 0o600, flag: 'wx' });
  console.log(`Disposable testnet deployer: ${privateKeyToAccount(key).address}`);
  console.log('Key saved only in the ignored .env file (mode 600). Fund this address with testnet ETH and TSLA through the Robinhood faucet.');
} catch (error) {
  if (error.code === 'EEXIST') reportError(new Error('.env already exists; it was preserved. Use your configured testnet deployer.'));
  else reportError(error);
}
