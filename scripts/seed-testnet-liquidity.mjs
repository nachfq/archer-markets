import { decodeEventLog, formatEther, formatUnits, parseUnits } from 'viem';
import { optionMarketV4Abi, prepareOrderV4 } from '@stock-options-lab/sdk';
import { clients, readJson, saveJson, reportError } from './config.mjs';
import { executeOperation, marketFromManifest } from './sdk-operation.mjs';

const EXPIRY_ISO = process.env.LIQUIDITY_EXPIRY || '2026-12-18T20:00:00Z';
const EXPIRY = BigInt(Date.parse(EXPIRY_ISO) / 1000);
const PRICE = { bid: '1', ask: '2' };
const CALL_STRIKES = { primary: '50', amd: '40', amazon: '40', netflix: '30', palantir: '20' };

function markets(record) {
  return [record, ...(record.markets ?? []).map(market => ({ chainId: record.chainId, name: record.name, explorerUrl: record.explorerUrl, ...market }))];
}

function plan(record) {
  const result = [];
  for (const entry of markets(record)) {
    const strike = CALL_STRIKES[entry.marketId];
    if (!strike) throw new Error(`Missing illustrative strike for ${entry.marketId}.`);
    result.push(
      { entry, optionType: 0, strike, premium: PRICE.bid, buy: true },
      { entry, optionType: 0, strike, premium: PRICE.ask, buy: false },
    );
  }
  const palantir = markets(record).find(entry => entry.marketId === 'palantir');
  if (!palantir) throw new Error('The PLTR market is missing from the deployment manifest.');
  result.push(
    { entry: palantir, optionType: 1, strike: '20', premium: PRICE.bid, buy: true },
    { entry: palantir, optionType: 1, strike: '20', premium: PRICE.ask, buy: false },
  );
  return result;
}

async function openOrders(publicClient, market, owner) {
  const result = [];
  for (let offset = 0n;; offset += 64n) {
    const ids = await publicClient.readContract({ address: market.factory, abi: optionMarketV4Abi, functionName: 'getUserOrders', args: [owner, offset, 64] });
    for (const id of ids) {
      const order = await publicClient.readContract({ address: market.factory, abi: optionMarketV4Abi, functionName: 'getOrder', args: [id] });
      if (order.state !== 1) continue;
      const [kind, strike, expiry] = await publicClient.readContract({ address: market.factory, abi: optionMarketV4Abi, functionName: 'series', args: [order.series] });
      result.push({ id, order, kind, strike, expiry });
    }
    if (ids.length < 64) return result;
  }
}

try {
  if (!Number.isFinite(Number(EXPIRY)) || EXPIRY <= 0n) throw new Error('LIQUIDITY_EXPIRY must be an ISO-8601 timestamp.');
  const actor = await clients('testnet');
  const record = await readJson('deployments/46630.json');
  if (record.chainId !== 46630 || record.version !== 4) throw new Error('A V4 Robinhood testnet manifest is required.');
  if (actor.account.address.toLowerCase() !== record.deployer.toLowerCase()) throw new Error('The configured signer is not the recorded disposable testnet deployer.');
  const block = await actor.publicClient.getBlock();
  if (EXPIRY <= block.timestamp + 30n * 24n * 60n * 60n) throw new Error('Liquidity expiry must remain at least 30 days in the future.');

  const existingByMarket = new Map();
  for (const entry of markets(record)) {
    const market = marketFromManifest(entry);
    existingByMarket.set(entry.marketId, await openOrders(actor.publicClient, market, actor.account.address));
  }

  let evidence;
  try { evidence = await readJson('deployments/46630.liquidity.json'); }
  catch { evidence = { chainId: 46630, account: actor.account.address, createdAt: new Date().toISOString(), orders: [] }; }
  evidence.expiry = EXPIRY.toString();
  evidence.expiryIso = new Date(Number(EXPIRY) * 1000).toISOString();
  evidence.note = 'Illustrative testnet liquidity; prices do not represent market data or user demand.';

  for (const item of plan(record)) {
    const market = marketFromManifest(item.entry);
    const strikeTotal = parseUnits(item.strike, market.quote.decimals);
    const premium = parseUnits(item.premium, market.quote.decimals);
    const strikeTicks = Number(strikeTotal / BigInt(item.entry.tickSize));
    const premiumTicks = Number(premium / BigInt(item.entry.tickSize));
    const key = `${item.entry.marketId}:${item.optionType}:${item.buy ? 'bid' : 'ask'}`;
    const existing = existingByMarket.get(item.entry.marketId).find(candidate =>
      candidate.kind === item.optionType && candidate.strike === strikeTicks && candidate.expiry === EXPIRY &&
      candidate.order.buy === item.buy && candidate.order.price === premiumTicks
    );
    if (existing) {
      console.log(`Open ${key} already exists as order ${existing.id}.`);
      if (!evidence.orders.some(order => order.key === key)) evidence.orders.push({ key, marketId: item.entry.marketId, orderId: existing.id.toString(), existing: true });
      continue;
    }

    const operation = await prepareOrderV4(actor.publicClient, market, actor.account.address, { optionType: item.optionType, strikeTotal, premium, expiry: EXPIRY, buy: item.buy });
    const receipt = await executeOperation(actor, operation);
    const posted = receipt.logs
      .filter(log => log.address.toLowerCase() === market.factory.toLowerCase())
      .map(log => { try { return decodeEventLog({ abi: optionMarketV4Abi, ...log }); } catch { return null; } })
      .find(log => log?.eventName === 'OrderPosted');
    if (!posted) throw new Error(`Missing OrderPosted event for ${key}.`);
    const row = {
      key,
      marketId: item.entry.marketId,
      pair: item.entry.label,
      optionType: item.optionType === 0 ? 'call' : 'put',
      side: item.buy ? 'bid' : 'ask',
      strike: item.strike,
      premium: item.premium,
      orderId: posted.args.id.toString(),
      option: posted.args.option,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber.toString(),
    };
    evidence.orders = evidence.orders.filter(order => order.key !== key);
    evidence.orders.push(row);
    evidence.updatedAt = new Date().toISOString();
    await saveJson('deployments/46630.liquidity.json', evidence);
    console.log(`${key} order ${row.orderId}: ${receipt.transactionHash}`);
  }

  const [eth, quote] = await Promise.all([
    actor.publicClient.getBalance({ address: actor.account.address }),
    actor.publicClient.readContract({ address: record.quote.address, abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }], functionName: 'balanceOf', args: [actor.account.address] }),
  ]);
  evidence.updatedAt = new Date().toISOString();
  evidence.remaining = { testETH: formatEther(eth), USDG: formatUnits(quote, record.quote.decimals) };
  await saveJson('deployments/46630.liquidity.json', evidence);
  console.log(`Liquidity ready through ${evidence.expiryIso}; remaining ${evidence.remaining.USDG} USDG and ${evidence.remaining.testETH} test ETH.`);
} catch (error) { reportError(error); }
