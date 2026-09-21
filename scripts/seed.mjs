import { decodeEventLog, erc20Abi, parseAbi } from 'viem';
import { optionMarketV4Abi, prepareOrderV4 } from '@stock-options-lab/sdk';
import { executeOperation, marketFromManifest } from './sdk-operation.mjs';
import { clients, mined, readJson, saveJson, reportError } from './config.mjs';

try {
  const mode = process.argv[2];
  if (mode === 'local') throw new Error('Use npm run demo:local; accounts 0 and 1 are reserved for player trades.');
  const actors = [await clients(mode)];
  if (process.env.BUYER_PRIVATE_KEY) actors.push(await clients(mode, true, true));
  const record = await readJson(`deployments/${actors[0].chain.id}.json`);
  if (record.version !== 4) throw new Error('A V4 deployment manifest is required.');
  const market = marketFromManifest(record);
  const evidence = [];
  const expiry = (await actors[0].publicClient.getBlock()).timestamp + 7n * 24n * 60n * 60n;
  for (const actor of actors) {
    if (record.quote.isMock) await mined(actor.publicClient, await actor.walletClient.writeContract({ address: record.quote.address, abi: parseAbi(['function faucet()']), functionName: 'faucet' }));
    const [stockBalance, quoteBalance] = await Promise.all([
      actor.publicClient.readContract({ address: record.underlying.address, abi: erc20Abi, functionName: 'balanceOf', args: [actor.account.address] }),
      actor.publicClient.readContract({ address: record.quote.address, abi: erc20Abi, functionName: 'balanceOf', args: [actor.account.address] }),
    ]);
    if (stockBalance < 10n ** BigInt(record.underlying.decimals)) throw new Error(`${actor.account.address} needs at least 1 ${record.underlying.symbol} before seeding. No option transaction was sent for this actor.`);
    if (quoteBalance < 250n * 10n ** BigInt(record.quote.decimals)) throw new Error(`${actor.account.address} needs at least 250 ${record.quote.symbol} before seeding. No option transaction was sent for this actor.`);
    for (const optionType of [0, 1]) {
      const strikeTotal = BigInt(optionType === 0 ? 300 : 250) * 10n ** 6n;
      const premium = BigInt(optionType === 0 ? 8 : 6) * 10n ** 6n;
      const operation = await prepareOrderV4(actor.publicClient, market, actor.account.address, { optionType, strikeTotal, premium, expiry, buy: false });
      const receipt = await executeOperation(actor, operation);
      const event = receipt.logs
        .filter(log => log.address.toLowerCase() === record.factory.toLowerCase())
        .map(log => { try { return decodeEventLog({ abi: optionMarketV4Abi, ...log }); } catch { return null; } })
        .find(log => log?.eventName === 'OptionCreated');
      if (!event) throw new Error('Missing OptionCreated event. The seed ask may have crossed an existing bid.');
      evidence.push({ option: event.args.option, writer: actor.account.address, type: optionType === 0 ? 'Call' : 'Put', transactionHash: receipt.transactionHash, expiry: expiry.toString() });
      console.log(`${optionType === 0 ? 'Call' : 'Put'} ask: ${event.args.option} · writer ${actor.account.address}`);
    }
  }
  await saveJson(`deployments/${actors[0].chain.id}.seed.json`, { chainId: actors[0].chain.id, createdAt: new Date().toISOString(), asks: evidence });
  console.log('V4 asks created with deposited test collateral. Demo prices are arbitrary; no market prices or users are simulated.');
} catch (error) { reportError(error); }
