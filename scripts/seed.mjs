import { erc20Abi, decodeEventLog } from 'viem';
import { parseAmount, quoteTotal, prepareCreateOffer } from '@stock-options-lab/sdk';
import { executeOperation, marketFromManifest } from './sdk-operation.mjs';
import { clients, artifact, readJson, saveJson, mined, reportError } from './config.mjs';

try {
  const mode = process.argv[2];
  if (mode === 'local') throw new Error('Use npm run demo:local; accounts 0 and 1 are reserved for player trades.');
  const writer = await clients(mode);
  const record = await readJson(`deployments/${writer.chain.id}.json`);
  const { abi: factoryAbi } = await artifact(record.version === 4 ? 'OptionMarketV4' : 'OptionFactory');
  const { abi: mockAbi } = await artifact('MockUSD');
  const wallets = [writer];
  if (mode === 'local' || process.env.BUYER_PRIVATE_KEY) wallets.push(await clients(mode, true, true));
  const evidence = [];
  const quantity = parseAmount(process.env.SEED_QUANTITY || (record.version === 4 ? '1' : '0.1'), record.underlying.decimals);
  const market = marketFromManifest(record);
  for (const actor of wallets) {
    const { publicClient, walletClient, account } = actor;
    await mined(publicClient, await walletClient.writeContract({ address: record.quote.address, abi: mockAbi, functionName: 'faucet' }));
    if (mode === 'local') await mined(publicClient, await walletClient.writeContract({ address: record.underlying.address, abi: mockAbi, functionName: 'faucet' }));
    const stock = await publicClient.readContract({ address: record.underlying.address, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
    if (stock < quantity) throw new Error(`Insufficient stock for the requested seed option in ${account.address}.`);
    const expiry = (await publicClient.getBlock()).timestamp + 7n * 24n * 60n * 60n;
    for (const type of [0, 1]) {
      const strike = quoteTotal(quantity, BigInt(type === 0 ? 300 : 250) * 10n ** 6n, record.underlying.decimals);
      const premium = quoteTotal(quantity, BigInt(type === 0 ? 8 : 6) * 10n ** 6n, record.underlying.decimals);
      const operation = await prepareCreateOffer(publicClient, market, account.address, { optionType: type, quantity, strikeTotal: strike, premium, expiry });
      const receipt = await executeOperation(actor, operation);
      const event = receipt.logs.filter(log => log.address.toLowerCase() === record.factory.toLowerCase()).map(log => { try { return decodeEventLog({ abi: factoryAbi, ...log }); } catch { return null; } }).find(log => log?.eventName === 'OptionCreated');
      if (!event) throw new Error('Missing OptionCreated event.');
      evidence.push({ option: event.args.option, writer: account.address, type: type === 0 ? 'Call' : 'Put', transactionHash: receipt.transactionHash, expiry: expiry.toString() });
      console.log(`${type === 0 ? 'Call' : 'Put'} offer: ${event.args.option} · writer ${account.address}`);
    }
  }
  await saveJson(`deployments/${writer.chain.id}.seed.json`, { chainId: writer.chain.id, createdAt: new Date().toISOString(), offers: evidence });
  console.log('Offers created with deposited test collateral. Demo prices are arbitrary; no market prices or users are simulated.');
} catch (error) { reportError(error); }
