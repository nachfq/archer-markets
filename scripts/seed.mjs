import { erc20Abi, decodeEventLog } from 'viem';
import { clients, artifact, readJson, saveJson, mined, reportError } from './config.mjs';

try {
  const mode = process.argv[2];
  const writer = await clients(mode);
  const record = await readJson(`deployments/${writer.chain.id}.json`);
  const { abi: factoryAbi } = await artifact('OptionFactory');
  const { abi: mockAbi } = await artifact('MockUSD');
  const wallets = [writer];
  if (mode === 'local' || process.env.BUYER_PRIVATE_KEY) wallets.push(await clients(mode, true, true));
  const evidence = [];
  for (const actor of wallets) {
    const { publicClient, walletClient, account } = actor;
    await mined(publicClient, await walletClient.writeContract({ address: record.quote.address, abi: mockAbi, functionName: 'faucet' }));
    if (mode === 'local') await mined(publicClient, await walletClient.writeContract({ address: record.underlying.address, abi: mockAbi, functionName: 'faucet' }));
    const stock = await publicClient.readContract({ address: record.underlying.address, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
    if (stock < 10n ** 18n) throw new Error(`Fund ${account.address} with at least 1 testnet stock token before seeding a covered call.`);
    const expiry = (await publicClient.getBlock()).timestamp + 7n * 24n * 60n * 60n;
    for (const type of [0, 1]) {
      const quantity = 10n ** 18n;
      const strike = BigInt(type === 0 ? 300 : 250) * 10n ** 6n;
      const premium = BigInt(type === 0 ? 8 : 6) * 10n ** 6n;
      const collateralToken = type === 0 ? record.underlying.address : record.quote.address;
      const collateral = type === 0 ? quantity : strike;
      await mined(publicClient, await walletClient.writeContract({ address: collateralToken, abi: erc20Abi, functionName: 'approve', args: [record.factory, collateral] }));
      const receipt = await mined(publicClient, await walletClient.writeContract({ address: record.factory, abi: factoryAbi, functionName: 'createOption', args: [type, quantity, strike, premium, expiry] }));
      const event = receipt.logs.filter(log => log.address.toLowerCase() === record.factory.toLowerCase()).map(log => { try { return decodeEventLog({ abi: factoryAbi, ...log }); } catch { return null; } }).find(log => log?.eventName === 'OptionCreated');
      if (!event) throw new Error('Missing OptionCreated event.');
      evidence.push({ option: event.args.option, writer: account.address, type: type === 0 ? 'Call' : 'Put', transactionHash: receipt.transactionHash, expiry: expiry.toString() });
      console.log(`${type === 0 ? 'Call' : 'Put'} offer: ${event.args.option} · writer ${account.address}`);
    }
  }
  await saveJson(`deployments/${writer.chain.id}.seed.json`, { chainId: writer.chain.id, createdAt: new Date().toISOString(), offers: evidence });
  console.log('Offers created with deposited test collateral. Demo prices are arbitrary; no market prices or users are simulated.');
} catch (error) { reportError(error); }
