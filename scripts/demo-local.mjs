#!/usr/bin/env node
// Local-only fixture generator. Accounts 0 and 1 receive tokens but never sign seed transactions.
import { createPublicClient, createWalletClient, decodeEventLog, encodeDeployData, encodeFunctionData, erc20Abi, http } from 'viem';
import { artifact, network, readJson, saveJson, publicDeployment, reportError } from './config.mjs';
import { assertLocalDemo, demoStocks, demoOffers, demoRequests, playerStockAmount, playerQuoteAmount, priceSnapshotDate } from './demo-config.mjs';

try {
  const args = new Set(process.argv.slice(2));
  for (const arg of args) if (!['--dry-run', '--deploy-only', '--seed-only', '--no-export'].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
  if (args.has('--deploy-only') && args.has('--seed-only')) throw new Error('Choose only one stage.');
  const chain = network('local'), url = chain.rpcUrls.default.http[0];
  const client = createPublicClient({ chain, transport: http(url), pollingInterval: 25, cacheTime: 0 });
  const accounts = await client.request({ method: 'eth_accounts' });
  const actors = assertLocalDemo(url, await client.getChainId(), await client.request({ method: 'web3_clientVersion' }), accounts);
  const manifestFile = process.env.DEMO_MANIFEST ?? 'deployments/31337.json';
  let manifest;
  try { manifest = await readJson(manifestFile); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    manifest = { chainId: 31337, name: 'Local Anvil', rpcUrl: url, explorerUrl: '', factory: null, markets: [] };
  }
  if (manifest.chainId !== 31337) throw new Error('Local manifest required.');
  const genesis = await client.getBlock({ blockNumber: 0n });
  const ledgerFile = process.env.DEMO_LEDGER ?? `deployments/local-demo-${genesis.hash}.json`;
  let ledger;
  try { ledger = await readJson(ledgerFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (ledger && (ledger.schema !== 2 || ledger.genesis !== genesis.hash || ledger.rpcUrl !== url || ledger.actors.join().toLowerCase() !== actors.join().toLowerCase())) throw new Error('The saved run belongs to a different node or actor set. Choose a separate DEMO_LEDGER; do not overwrite it.');
  ledger ??= { schema: 2, genesis: genesis.hash, rpcUrl: url, actors, referenceDate: priceSnapshotDate, referenceStocks: demoStocks, timestamp: (await client.getBlock()).timestamp.toString(), transactions: {}, markets: [], offers: {}, requests: {} };
  const plans = demoStocks.flatMap(stock => demoOffers(stock, BigInt(ledger.timestamp)));
  const requests = demoStocks.flatMap(stock => demoRequests(stock, BigInt(ledger.timestamp)));
  console.log(`Local demo: ${plans.length} options and ${requests.length} buy requests across five markets. Accounts 0–1 are players; accounts 2–9 populate the market. Synthetic prices (${priceSnapshotDate}).`);
  if (args.has('--dry-run')) {
    console.log(JSON.stringify({ stages: ['deploy', 'fund players', 'seed offers and requests'], markets: demoStocks, offers: plans.length, requests: requests.length, alreadyRecorded: Object.keys(ledger.offers).length, expirations: [...new Set(plans.map(p => p.expiry.toString()))], writes: 0 }, null, 2));
    process.exit(0);
  }
  await saveJson(ledgerFile, ledger);
  const wallet = account => {
    if (!actors.some(a => a.toLowerCase() === account.toLowerCase())) throw new Error('Seed sender is outside accounts 2–9.');
    return createWalletClient({ account, chain, transport: http(url, { retryCount: 0 }) });
  };
  // Save the nonce BEFORE broadcasting. On interruption recover the exact transaction, never send a duplicate.
  async function transaction(key, account, request) {
    let saved = ledger.transactions[key];
    if (saved?.hash) {
      const receipt = await client.waitForTransactionReceipt({ hash: saved.hash });
      if (receipt.status !== 'success') throw new Error(`Saved transaction reverted: ${key}. Inspect the ledger before retrying.`);
      return receipt;
    }
    if (saved) {
      for (let block = BigInt(saved.startBlock); block <= (await client.getBlockNumber()); block++) {
        const full = await client.getBlock({ blockNumber: block, includeTransactions: true });
        const found = full.transactions.find(tx => tx.from.toLowerCase() === account.toLowerCase() && tx.nonce === saved.nonce);
        if (found) {
          if (found.to?.toLowerCase() !== request.to?.toLowerCase() || found.input !== request.data) throw new Error(`Nonce was used by another transaction: ${key}. Nothing was replayed.`);
          saved.hash = found.hash; await saveJson(ledgerFile, ledger); return transaction(key, account, request);
        }
      }
      if (await client.getTransactionCount({ address: account, blockTag: 'pending' }) !== saved.nonce) throw new Error(`Unresolved pending nonce for ${key}; wait for its receipt before resuming.`);
    } else {
      saved = ledger.transactions[key] = { account, nonce: await client.getTransactionCount({ address: account, blockTag: 'pending' }), startBlock: (await client.getBlockNumber()).toString() };
      await saveJson(ledgerFile, ledger);
    }
    saved.hash = await wallet(account).sendTransaction({ ...request, nonce: saved.nonce });
    await saveJson(ledgerFile, ledger);
    const receipt = await client.waitForTransactionReceipt({ hash: saved.hash });
    if (receipt.status !== 'success') throw new Error(`Transaction reverted: ${key}`);
    saved.blockNumber = receipt.blockNumber.toString();
    await saveJson(ledgerFile, ledger);
    return receipt;
  }
  const write = (key, account, address, abi, functionName, values = []) => transaction(key, account, { to: address, data: encodeFunctionData({ abi, functionName, args: values }) });
  async function deploy(key, name, values = []) {
    const { abi, bytecode } = await artifact(name);
    return transaction(key, actors[0], { data: encodeDeployData({ abi, bytecode: bytecode.object, args: values }) });
  }
  const factoryAbi = (await artifact('OptionFactory')).abi, optionAbi = (await artifact('Option')).abi;
  const faucetAbi = [{ type: 'function', name: 'faucet', stateMutability: 'nonpayable', inputs: [], outputs: [] }];
  let quote = manifest.quote;
  if (!quote?.isMock || !quote.address || ((await client.getCode({ address: quote.address }))?.length ?? 0) <= 2) {
    if (args.has('--seed-only')) throw new Error('Run the deployment stage first.');
    const receipt = await deploy('shared:quote', 'MockUSD');
    quote = { address: receipt.contractAddress, symbol: 'MockUSD', decimals: 6, isMock: true };
  }
  if (!args.has('--seed-only')) for (const stock of demoStocks) {
    const tokenReceipt = await deploy(`${stock.id}:token`, 'MockEquity', [stock.name, stock.symbol]);
    const factoryReceipt = await deploy(`${stock.id}:factory`, 'OptionFactory', [tokenReceipt.contractAddress, quote.address]);
    const market = { marketId: stock.id, label: `${stock.name} / MockUSD`, sandbox: true, version: 3, legacy: false, factory: factoryReceipt.contractAddress, deploymentBlock: factoryReceipt.blockNumber.toString(), underlying: { address: tokenReceipt.contractAddress, symbol: stock.symbol, decimals: 18, isMock: true }, quote };
    const index = ledger.markets.findIndex(m => m.marketId === stock.id);
    if (index < 0) ledger.markets.push(market); else ledger.markets[index] = market;
    await saveJson(ledgerFile, ledger);
    console.log(`Ready: ${stock.name} · ${market.factory}`);
  }
  if (ledger.markets.length !== 5) throw new Error('Run the deployment stage first.');
  for (const market of ledger.markets) {
    if (await client.readContract({ address: market.factory, abi: factoryAbi, functionName: 'version' }) !== 3n) throw new Error('Demo factory version mismatch.');
  }
  const legacy = [];
  for (const m of [manifest, ...(manifest.markets ?? [])]) if (!demoStocks.some(stock => stock.id === m.marketId) && m.factory && ((await client.getCode({ address: m.factory }))?.length ?? 0) > 2) legacy.push({ ...m, markets: undefined, version: m.version ?? 1, legacy: true });
  const primary = ledger.markets[0];
  const record = { chainId: 31337, name: 'Local Anvil', rpcUrl: url, explorerUrl: '', ...primary, markets: [...ledger.markets.slice(1), ...legacy] };
  await saveJson(manifestFile, record);
  if (!args.has('--no-export')) {
    const browser = await readJson('web/lib/generated/deployments.json');
    browser['31337'] = publicDeployment(record);
    await saveJson('web/lib/generated/deployments.json', browser);
  }
  if (args.has('--deploy-only')) process.exit(0);
  // One-time grants via an NPC: no player signatures, approvals or positions.
  for (const [id, token, amount] of [
    ['quote', quote.address, playerQuoteAmount],
    ...ledger.markets.map(m => [m.marketId, m.underlying.address, playerStockAmount]),
  ]) for (const index of [0, 1]) {
    await write(`player:${index}:${id}:mint`, actors[0], token, faucetAbi, 'faucet');
    await write(`player:${index}:${id}:grant`, actors[0], token, erc20Abi, 'transfer', [accounts[index], amount]);
  }
  console.log('Players 0 and 1: one-time grants of 100 of each stock and 10,000 MockUSD; no seeded positions.');
  for (const market of ledger.markets) {
    const offers = plans.filter(p => p.id.startsWith(`${market.marketId}-`));
    for (const offer of offers) {
      const writer = accounts[offer.writerIndex], buyer = accounts[offer.buyerIndex];
      let entry = ledger.offers[offer.id];
      if (!entry) {
        if (offer.expiry <= (await client.getBlock()).timestamp) throw new Error('Fixture dates have expired. Use a new ledger for a new run; existing contracts were preserved.');
        if (!ledger.transactions[`${offer.id}:create`]) {
          const token = offer.optionType === 0 ? market.underlying.address : quote.address;
          const amount = offer.optionType === 0 ? offer.quantity : offer.strikeTotal;
          let topup = 0;
          while (await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [writer] }) < amount) {
            await write(`${offer.id}:fund:${topup++}`, writer, token, faucetAbi, 'faucet');
          }
          await write(`${offer.id}:approve`, writer, token, erc20Abi, 'approve', [market.factory, amount]);
        }
        const receipt = await write(`${offer.id}:create`, writer, market.factory, factoryAbi, 'createOption', [offer.optionType, offer.quantity, offer.strikeTotal, offer.premium, offer.expiry]);
        const log = receipt.logs.map(log => { try { return decodeEventLog({ abi: factoryAbi, ...log }); } catch { return null; } }).find(log => log?.eventName === 'OptionCreated');
        if (!log) throw new Error('Missing OptionCreated event.');
        entry = ledger.offers[offer.id] = { address: log.args.option, disposition: offer.disposition, complete: false };
        await saveJson(ledgerFile, ledger);
      }
      if (entry.complete) continue;
      const read = functionName => client.readContract({ address: entry.address, abi: optionAbi, functionName });
      const state = await read('state');
      // Never alter an offer that a human has already bought, listed, cancelled or exercised.
      if (state === 0 && offer.disposition === 'cancelled') await write(`${offer.id}:cancel`, writer, entry.address, optionAbi, 'cancel');
      if (state === 0 && ['held', 'resale'].includes(offer.disposition)) {
        let topup = 0;
        while (await client.readContract({ address: quote.address, abi: erc20Abi, functionName: 'balanceOf', args: [buyer] }) < offer.premium) await write(`${offer.id}:buyer-fund:${topup++}`, buyer, quote.address, faucetAbi, 'faucet');
        await write(`${offer.id}:buyer-approve`, buyer, quote.address, erc20Abi, 'approve', [entry.address, offer.premium]);
        await write(`${offer.id}:buy`, buyer, entry.address, optionAbi, 'buy');
      }
      if (offer.disposition === 'resale' && await read('state') === 1 && (await read('buyer')).toLowerCase() === buyer.toLowerCase() && await read('listingNonce') === 0n) {
        await write(`${offer.id}:list`, buyer, entry.address, optionAbi, 'listForResale', [offer.premium * 115n / 100n]);
      }
      entry.complete = true;
      await saveJson(ledgerFile, ledger);
      if (Object.keys(ledger.offers).length % 13 === 0) console.log(`Seeded ${Object.keys(ledger.offers).length}/390 options.`);
    }
  }
  for (const market of ledger.markets) for (const request of requests.filter(r => r.id.startsWith(`${market.marketId}-`))) {
    if (ledger.requests[request.id]) continue;
    const buyer = accounts[request.buyerIndex];
    const key = request.id;
    if (!ledger.transactions[`${key}:create`] && request.acceptUntil <= (await client.getBlock()).timestamp) throw new Error('Request acceptance dates have expired. Existing requests were preserved.');
    if (!ledger.transactions[`${key}:create`]) {
      let topup = 0;
      while (await client.readContract({ address: quote.address, abi: erc20Abi, functionName: 'balanceOf', args: [buyer] }) < request.premium) {
        await write(`${key}:fund:${topup++}`, buyer, quote.address, faucetAbi, 'faucet');
      }
      await write(`${key}:approve`, buyer, quote.address, erc20Abi, 'approve', [market.factory, request.premium]);
    }
    const receipt = await write(`${key}:create`, buyer, market.factory, factoryAbi, 'createRequest', [request.optionType, request.quantity, request.strikeTotal, request.premium, request.expiry, request.acceptUntil]);
    const event = receipt.logs.filter(log => log.address.toLowerCase() === market.factory.toLowerCase()).map(log => { try { return decodeEventLog({ abi: factoryAbi, ...log }); } catch { return null; } }).find(log => log?.eventName === 'RequestCreated');
    if (!event) throw new Error('Missing RequestCreated event.');
    ledger.requests[key] = { marketId: market.marketId, requestId: event.args.requestId.toString(), buyer };
    await saveJson(ledgerFile, ledger);
  }
  console.log(`Complete: ${Object.keys(ledger.offers).length} options and ${Object.keys(ledger.requests).length} requests. Players 0–1 are ready. Reruns preserve player trades and skip completed grants and fixtures.`);
} catch (error) { reportError(error); }
