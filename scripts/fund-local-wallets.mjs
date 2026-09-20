import { getAddress, parseEther } from 'viem';
import { clients, reportError } from './config.mjs';

try {
  // Validate every address before changing any balance.
  const addresses = process.argv.slice(2).map(address => getAddress(address));
  if (!addresses.length) throw new Error('Usage: npm run wallet:fund:local -- MAKER_ADDRESS TAKER_ADDRESS');
  const { publicClient, url } = await clients('local', false);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Wallet funding requires a loopback Anvil RPC.');
  for (const address of addresses) {
    await publicClient.request({ method: 'anvil_setBalance', params: [address, `0x${parseEther('2').toString(16)}`] });
    console.log(`${address}: set to 2 local ETH.`);
  }
} catch (error) { reportError(error); }
