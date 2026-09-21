import { runFoundry } from './foundry.mjs';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { clients, artifact, readJson, saveJson, reportError } from './config.mjs';

try {
  const { publicClient } = await clients('testnet', false);
  const record = await readJson('deployments/46630.json');
  if (record.chainId !== 46630) throw new Error('Expected a Robinhood testnet manifest.');
  const factoryCode = await publicClient.getCode({ address: record.factory });
  if (!factoryCode || factoryCode === '0x') throw new Error('Factory is not deployed on this network.');
  const constructor = market => encodeAbiParameters(parseAbiParameters('address,address,address,uint256,uint16'), [market.underlying.address, market.quote.address, market.feeRecipient, BigInt(market.baseFee), market.feeBps]);
  const markets = [record, ...(record.markets ?? [])];
  const jobs = [[record.factory, 'src/OptionMarketV4.sol:OptionMarketV4', constructor(record)]];
  if (record.quote.isMock) jobs.unshift([record.quote.address, 'src/MockUSD.sol:MockUSD', null]);
  for (const market of record.markets ?? []) {
    if (market.underlying.isMock) jobs.push([market.underlying.address, 'src/MockStock.sol:MockStock', null]);
    jobs.push([market.factory, 'src/OptionMarketV4.sol:OptionMarketV4', constructor(market)]);
  }
  const { abi: factoryAbi } = await artifact('OptionMarketV4');
  const { abi: optionAbi } = await artifact('OptionV4');
  const types = new Set();
  for (const market of markets) {
    const count = await publicClient.readContract({ address: market.factory, abi: factoryAbi, functionName: 'optionCount' });
    for (let i = 0n; i < count && types.size < 2; i++) {
      const address = await publicClient.readContract({ address: market.factory, abi: factoryAbi, functionName: 'options', args: [i] });
      const fields = await Promise.all(
        ['writer', 'underlying', 'quote', 'optionType', 'underlyingAmount', 'strikeTotal', 'premium', 'expiry']
          .map(functionName => publicClient.readContract({ address, abi: optionAbi, functionName })),
      );
      if (types.has(fields[3])) continue;
      types.add(fields[3]);
      jobs.push([address, 'src/OptionV4.sol:OptionV4', encodeAbiParameters(parseAbiParameters('address,address,address,uint256,uint8,uint256,uint256,uint64'), [fields[0],fields[1],fields[2],fields[4],fields[3],fields[5],fields[6],fields[7]])]);
    }
    if (types.size === 2) break;
  }
  const verified = [];
  for (const [address, contract, constructor] of jobs) {
    const args = ['verify-contract', address, contract, '--chain-id', '46630', '--verifier', 'blockscout', '--verifier-url', 'https://explorer.testnet.chain.robinhood.com/api/', '--watch'];
    if (constructor) args.push('--constructor-args', constructor);
    const code = await runFoundry('forge', args);
    if (code !== 0) throw new Error(`Explorer verification failed for ${contract}; deployment itself is preserved.`);
    verified.push({ address, contract });
  }
  await saveJson('deployments/46630.verification.json', { verifiedAt: new Date().toISOString(), verified });
  if (types.size === 0) console.log('Markets verified. Seed testnet liquidity, then verify again to verify sample option instances.');
  else if (types.size < 2) console.log('Markets and one option type verified. Seed the other option type, then verify again.');
} catch (error) { reportError(error); }
