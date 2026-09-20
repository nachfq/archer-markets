import { BaseError, ContractFunctionRevertedError, decodeErrorResult, encodeFunctionData, erc20Abi, formatUnits, parseAbiItem, parseUnits, type Address, type Hash, type PublicClient } from 'viem';
import { optionAbi, optionFactoryAbi, optionMarketV4Abi, optionV4Abi, erc20Abi as tokenErrorsAbi } from './abis.js';
export * from './v4.js';
import { getSnapshotV4, getPortfolioSnapshotV4, getOptionV4, prepareOrderV4, prepareResaleV4, prepareCancelV4 } from './v4.js';
export { optionAbi, optionFactoryAbi, optionMarketV4Abi, optionV4Abi } from './abis.js';
export type ChainConfig = { chainId: number; name: string; rpcUrl: string; explorerUrl: string };
export type TokenConfig = { address: Address; symbol: string; decimals: number; isMock: boolean; adapter?: 'erc20' | 'robinhood' };
export type MarketConfig = { id: string; chainId: number; factory: Address; deploymentBlock: bigint; version?: 1 | 2 | 3 | 4; underlying: TokenConfig; quote: TokenConfig; sandbox: boolean };
export type OptionTrade = { seller: Address; buyer: Address; price: bigint; blockNumber: bigint; transactionHash: Hash };
export type Option = { orderId?: bigint; bookSize?: bigint; seriesKey?: Hash; address: Address; writer: Address; buyer: Address; underlyingAmount: bigint; strikeTotal: bigint; premium: bigint; expiry: bigint; optionType: number; state: number; resalePrice?: bigint; listingNonce?: bigint; trades?: OptionTrade[] };
export type BuyRequest = { id: bigint; bookSize?: bigint; seriesKey?: Hash; buyer: Address; optionType: number; underlyingAmount: bigint; strikeTotal: bigint; premium: bigint; expiry: bigint; acceptUntil: bigint; state: number; option: Address };
export type MarketSnapshot = { orders?: import('./v4.js').OrderV4[]; market: MarketConfig; blockNumber: bigint; blockHash: Hash; timestamp: bigint; positions: Option[]; requests?: BuyRequest[]; total: bigint };
export type TokenBalance = { token: TokenConfig; available: bigint; requestPremium: bigint; refundablePremium: bigint; openCollateral: bigint; activeCollateral: bigint; reclaimable: bigint; totalTracked: bigint };
export type Portfolio = { blockNumber: bigint; timestamp: bigint; gas: bigint; tokens: TokenBalance[]; positions: (Option & { marketId: string })[]; requests: (BuyRequest & { marketId: string })[]; complete: true };
export type Spend = { token: TokenConfig; amount: bigint };
export type PreparedOperation = { action: string; account: Address; chainId: number; request: { to: Address; data: `0x${string}` }; approval?: Spend & { spender: Address }; spend?: Spend };
export type ErrorCode = 'INSUFFICIENT_BALANCE' | 'INSUFFICIENT_ALLOWANCE' | 'EXPIRED' | 'NOT_EXPIRED' | 'UNAUTHORIZED' | 'UNAVAILABLE' | 'INVALID_TERMS' | 'TOKEN_TRANSFER' | 'WALLET_REJECTED' | 'WRONG_NETWORK' | 'PENDING' | 'REVERTED' | 'RPC_ERROR';
export class ProtocolError extends Error {
  constructor(public code: ErrorCode, message: string, public nextAction: string, public details?: { token?: string; required?: string; available?: string; technical?: string; txHash?: Hash }) { super(message); this.name = 'ProtocolError'; }
}
const messages: Record<string, [ErrorCode, string, string]> = {
  SelfTrade: ['UNAUTHORIZED', 'The best order is yours or would return an option to its writer.', 'Cancel the conflicting order or change your limit; priority cannot be skipped.'],
  OrderUnavailable: ['UNAVAILABLE', 'This order is no longer available.', 'Refresh the book.'],
  InvalidLotSize: ['INVALID_TERMS', 'Quantity must be a multiple of 0.1 token.', 'Use 0.1, 0.2, 0.3 or another whole number of lots.'],
  RequestUnavailable: ['UNAVAILABLE', 'This request is no longer open.', 'Refresh requests; it may have been accepted or canceled.'],
  RequestExpired: ['EXPIRED', 'The acceptance deadline has passed.', 'The requester can recover the reserved premium.'],
  StaleListing: ['UNAVAILABLE', 'This resale offer changed after you reviewed it.', 'Refresh and review the current seller and total price before buying.'],
  ERC20InsufficientBalance: ['INSUFFICIENT_BALANCE', 'The token balance is too low.', 'Reduce the amount or add the required tokens.'],
  ERC20InsufficientAllowance: ['INSUFFICIENT_ALLOWANCE', 'The token approval is insufficient.', 'Approve the required amount and try again.'],
  OptionExpired: ['EXPIRED', 'This option has expired.', 'Exercise is no longer possible. The writer can reclaim collateral.'],
  NotExpired: ['NOT_EXPIRED', 'This collateral is still committed.', 'Wait until expiration to reclaim it.'],
  Unauthorized: ['UNAUTHORIZED', 'This wallet cannot perform that action.', 'Use the current buyer or writer wallet for the permitted action.'],
  InvalidState: ['UNAVAILABLE', 'The option is no longer available for this action.', 'Refresh the position. Another transaction may have changed its state.'],
  InvalidTerms: ['INVALID_TERMS', 'The option terms are invalid.', 'Check positive amounts and a future expiration.'],
  InvalidPair: ['INVALID_TERMS', 'The market token pair is invalid.', 'Choose a configured market with two distinct deployed tokens.'],
  UnsupportedTokenTransfer: ['TOKEN_TRANSFER', 'The token did not transfer the exact required amount.', 'This token may not be compatible with this market.'],
  SafeERC20FailedOperation: ['TOKEN_TRANSFER', 'The token contract refused the transfer.', 'Check token restrictions and approvals.'],
  NotFunded: ['UNAVAILABLE', 'The option is not funded.', 'Choose a funded offer from the verified market.'],
};
export function decodeProtocolError(error: unknown): ProtocolError {
  if (error instanceof ProtocolError) return error;
  const visited = new Set<unknown>(); let current: unknown = error; let name: string | undefined;
  for (let i = 0; i < 12 && current && typeof current === 'object' && !visited.has(current); i++) {
    visited.add(current);
    const e = current as { code?: number; name?: string; data?: unknown; cause?: unknown; message?: string };
    if (e.code === 4001 || e.name === 'UserRejectedRequestError') return new ProtocolError('WALLET_REJECTED', 'Wallet signature rejected. This step was not sent.', 'You can retry when ready. Any previously confirmed approval remains in place.');
    if (e.name?.includes('Timeout')) return new ProtocolError('PENDING', 'Confirmation has not arrived yet.', 'Check the transaction status before sending another operation.');
    if (current instanceof ContractFunctionRevertedError) name = current.data?.errorName;
    if (typeof e.data === 'string' && e.data.startsWith('0x')) {
      try { name = decodeErrorResult({ abi: [...optionAbi, ...optionFactoryAbi, ...optionMarketV4Abi, ...optionV4Abi, ...tokenErrorsAbi], data: e.data as `0x${string}` }).errorName; } catch { /* Unknown token errors retain their raw diagnostic. */ }
    }
    if (name && messages[name]) { const [code, message, next] = messages[name]; return new ProtocolError(code, message, next, { technical: name }); }
    current = e.cause;
  }
  const technical = error instanceof BaseError ? error.shortMessage : error instanceof Error ? error.message : 'Unknown RPC failure';
  return new ProtocolError('RPC_ERROR', 'The operation could not be completed.', 'Check the network and refresh before retrying.', { technical });
}
export function parseAmount(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value.trim()) || (value.trim().split('.')[1]?.length ?? 0) > decimals) throw new ProtocolError('INVALID_TERMS', `Enter a positive amount with at most ${decimals} decimals.`, 'Use decimal notation without commas.');
  const result = parseUnits(value.trim(), decimals);
  if (result <= 0n || result > 2n ** 256n - 1n) throw new ProtocolError('INVALID_TERMS', 'Amount is outside the supported range.', 'Use a positive amount within uint256.');
  return result;
}
export function quoteTotal(quantity: bigint, price: bigint, underlyingDecimals: number): bigint {
  const product = quantity * price, scale = 10n ** BigInt(underlyingDecimals);
  if (product % scale !== 0n) throw new ProtocolError('INVALID_TERMS', 'This quantity and price produce a total smaller than the payment token precision.', 'Adjust the quantity or price. Totals are never silently rounded.');
  const total = product / scale;
  if (total <= 0n || total > 2n ** 256n - 1n) throw new ProtocolError('INVALID_TERMS', 'The total is outside the supported range.', 'Adjust the quantity or price.');
  return total;
}
export function maximumQuantity(available: bigint, kind: number, strikePerToken: bigint, underlyingDecimals: number): bigint {
  if (kind === 0) return available;
  if (strikePerToken <= 0n) return 0n;
  const scale = 10n ** BigInt(underlyingDecimals);
  const gcd = (a: bigint, b: bigint): bigint => b === 0n ? a : gcd(b, a % b);
  const step = scale / gcd(scale, strikePerToken);
  return ((available * scale / strikePerToken) / step) * step;
}
const validations = new WeakMap<PublicClient, Map<string, Promise<void>>>();
async function validateMarketFresh(client: PublicClient, market: MarketConfig) {
  const [code, underlying, quote, ud, qd] = await Promise.all([
    client.getCode({ address: market.factory }),
    client.readContract({ address: market.factory, abi: optionFactoryAbi, functionName: 'underlying' }),
    client.readContract({ address: market.factory, abi: optionFactoryAbi, functionName: 'quote' }),
    client.readContract({ address: market.underlying.address, abi: erc20Abi, functionName: 'decimals' }),
    client.readContract({ address: market.quote.address, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  const version = market.version ?? 1;
  if (![1, 2, 3, 4].includes(version) || (version >= 2 && await client.readContract({ address: market.factory, abi: optionFactoryAbi, functionName: 'version' }) !== BigInt(version)) || !code || code === '0x' || underlying.toLowerCase() !== market.underlying.address.toLowerCase() || quote.toLowerCase() !== market.quote.address.toLowerCase() || ud !== market.underlying.decimals || qd !== market.quote.decimals) throw new ProtocolError('UNAVAILABLE', 'Deployment does not match the market configuration.', 'Check the network, factory, version and token metadata.');
}
export async function validateMarket(client: PublicClient, market: MarketConfig) {
  if (await client.getChainId() !== market.chainId) throw new ProtocolError('WRONG_NETWORK', 'The RPC is on another network.', 'Use the RPC configured for this market.');
  let cache = validations.get(client); if (!cache) { cache = new Map(); validations.set(client, cache); }
  const key = `${market.chainId}:${market.factory.toLowerCase()}:${market.version ?? 1}`;
  let validation = cache.get(key);
  if (!validation) {
    validation = validateMarketFresh(client, market);
    cache.set(key, validation);
    validation.catch(() => cache!.delete(key));
  }
  return validation;
}
async function parallelMap<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += 8) results.push(...await Promise.all(items.slice(i, i + 8).map(fn)));
  return results;
}
// Reorg-checked immutable terms only. Ownership, listing, state and balances share one snapshot block.
const registries = new WeakMap<PublicClient, Map<string, { block: bigint; hash: Hash; addresses: Address[]; terms: Map<Address, Partial<Option>> }>>();
async function readOption(client: PublicClient, address: Address, blockNumber: bigint, version: number, terms: Map<Address, Partial<Option>>): Promise<Option> {
  const fixed = ['writer', 'underlyingAmount', 'strikeTotal', 'premium', 'expiry', 'optionType'] as const;
  const names = [...(terms.has(address) ? [] : fixed), 'buyer', 'state', ...(version >= 2 ? ['resalePrice', 'listingNonce'] as const : [])] as const;
  const values = await Promise.all(names.map(functionName => client.readContract({ address, abi: optionAbi, functionName, blockNumber })));
  const option = { address, ...terms.get(address), ...Object.fromEntries(names.map((name, i) => [name, values[i]])) } as Option;
  terms.set(address, Object.fromEntries(fixed.map(name => [name, option[name]])));
  return option;
}
export async function getMarkets(client: PublicClient, markets: MarketConfig[], _account?: Address): Promise<MarketSnapshot[]> {
  if (markets.some(m => m.chainId !== markets[0]?.chainId)) throw new ProtocolError('WRONG_NETWORK', 'Use one chain per client snapshot.', 'Create a separate client for each chain.');
  await Promise.all(markets.map(m => validateMarket(client, m)));
  const block = await client.getBlock({ blockTag: 'latest' });
  if (!block.hash || block.number === null) throw new Error('A mined block is required.');
  let cache = registries.get(client); if (!cache) { cache = new Map(); registries.set(client, cache); }
  return parallelMap(markets, async market => {
    if (market.version === 4) return getSnapshotV4(client, market, {number:block.number!,hash:block.hash!,timestamp:block.timestamp});
    const key = `${market.chainId}:${market.factory.toLowerCase()}`;
    const total = await client.readContract({ address: market.factory, abi: optionFactoryAbi, functionName: 'optionCount', blockNumber: block.number });
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Registry exceeds supported client indexing range.');
    let previous = cache!.get(key);
    if (previous) {
      try { if ((await client.getBlock({ blockNumber: previous.block })).hash !== previous.hash || BigInt(previous.addresses.length) > total) previous = undefined; }
      catch { previous = undefined; }
    }
    const addresses = [...(previous?.addresses ?? [])];
    for (let start = addresses.length; start < Number(total); start += 40) {
      addresses.push(...await parallelMap(Array.from({ length: Math.min(40, Number(total) - start) }, (_, n) => BigInt(start + n)), index => client.readContract({ address: market.factory, abi: optionFactoryAbi, functionName: 'options', args: [index], blockNumber: block.number })));
    }
    const terms = previous?.terms ?? new Map<Address, Partial<Option>>();
    cache!.set(key, { block: block.number, hash: block.hash!, addresses, terms });
    const positions = await parallelMap([...addresses].reverse(), address => readOption(client, address, block.number, market.version ?? 1, terms));
    if ((market.version ?? 1) >= 2 && addresses.length) {
      const trades = new Map<string, OptionTrade[]>();
      for (let start = 0; start < addresses.length; start += 100) {
        const logs = await client.getLogs({ address: addresses.slice(start, start + 100), events: [parseAbiItem('event Bought(address indexed buyer, uint256 premium)'), parseAbiItem('event Resold(address indexed seller, address indexed buyer, uint256 price, uint256 nonce)')], fromBlock: market.deploymentBlock, toBlock: block.number, strict: true });
        for (const log of logs) {
          const key = log.address.toLowerCase(), p = positions.find(p => p.address.toLowerCase() === key)!;
          const trade: OptionTrade = { seller: log.eventName === 'Bought' ? p.writer : log.args.seller, buyer: log.args.buyer, price: log.eventName === 'Bought' ? log.args.premium : log.args.price, blockNumber: log.blockNumber, transactionHash: log.transactionHash };
          trades.set(key, [...(trades.get(key) ?? []), trade]);
        }
      }
      for (const p of positions) p.trades = trades.get(p.address.toLowerCase()) ?? [];
    }
    const requests: BuyRequest[] = [];
    if (market.version === 3) {
      const count = await client.readContract({ address: market.factory, abi: optionFactoryAbi, functionName: 'requestCount', blockNumber: block.number });
      if (count > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Request registry exceeds supported indexing range.');
      for (let start = 0; start < Number(count); start += 40) {
        requests.push(...await parallelMap(Array.from({ length: Math.min(40, Number(count) - start) }, (_, i) => BigInt(start + i)), async id => ({ id, ...await client.readContract({ address: market.factory, abi: optionFactoryAbi, functionName: 'getRequest', args: [id], blockNumber: block.number }) })));
      }
    }
    return { market, total, positions, requests, blockNumber: block.number, blockHash: block.hash!, timestamp: block.timestamp };
  });
}
export async function getOption(client: PublicClient, market: MarketConfig, address: Address): Promise<Option> {
  if (market.version === 4) return getOptionV4(client, market, address);
  const snapshots = await getMarkets(client, [market]);
  const option = snapshots[0].positions.find(p => p.address.toLowerCase() === address.toLowerCase());
  if (!option) throw new ProtocolError('UNAVAILABLE', 'This option is not in the verified market.', 'Select an option from the market registry.');
  return option;
}
export function summarizePortfolio(snapshots: MarketSnapshot[], account: Address, walletBalances: Map<string, bigint>): TokenBalance[] {
  const tokens = new Map<string, TokenBalance>(); const seenOptions = new Set<string>(); const seenRequests = new Set<string>();
  for (const { market, positions, timestamp, requests = [] } of snapshots) {
    for (const token of [market.underlying, market.quote]) {
      const key = `${market.chainId}:${token.address.toLowerCase()}`;
      if (!tokens.has(key)) {
        const available = walletBalances.get(key);
        if (available === undefined) throw new Error('Incomplete wallet balances.');
        tokens.set(key, { token, available, requestPremium: 0n, refundablePremium: 0n, openCollateral: 0n, activeCollateral: 0n, reclaimable: 0n, totalTracked: available });
      }
    }
    for (const r of requests) {
      const key = `${market.chainId}:${market.factory.toLowerCase()}:${r.id}`;
      if (seenRequests.has(key)) continue;
      seenRequests.add(key);
      if (r.state !== 0 || r.buyer.toLowerCase() !== account.toLowerCase()) continue;
      const row = tokens.get(`${market.chainId}:${market.quote.address.toLowerCase()}`)!;
      if (r.acceptUntil <= timestamp) row.refundablePremium += r.premium;
      else row.requestPremium += r.premium;
      row.totalTracked += r.premium;
    }
    for (const p of positions) {
      const optionKey = `${market.chainId}:${p.address.toLowerCase()}`;
      if (seenOptions.has(optionKey)) continue;
      seenOptions.add(optionKey);
      if (p.writer.toLowerCase() !== account.toLowerCase() || p.state > 1) continue;
      const token = p.optionType === 0 ? market.underlying : market.quote;
      const amount = p.optionType === 0 ? p.underlyingAmount : p.strikeTotal;
      const row = tokens.get(`${market.chainId}:${token.address.toLowerCase()}`)!;
      if (p.expiry <= timestamp) row.reclaimable += amount;
      else if (p.state === 0) row.openCollateral += amount;
      else row.activeCollateral += amount;
      row.totalTracked += amount;
    }
  }
  return [...tokens.values()];
}
export async function getPortfolio(client: PublicClient, markets: MarketConfig[], account: Address, snapshots?: MarketSnapshot[]): Promise<Portfolio> {
  let base = snapshots;
  if (!base) {
    await Promise.all(markets.map(market => validateMarket(client, market)));
    if (markets.some(market => market.version !== 4)) base = await getMarkets(client, markets);
    else {
      const block = await client.getBlock({ blockTag: 'latest' });
      if (!block.hash || block.number === null) throw new Error('A mined block is required.');
      base = markets.map(market => ({ market, total: 0n, positions: [], requests: [], blockNumber: block.number!, blockHash: block.hash!, timestamp: block.timestamp }));
    }
  }
  const reference = base[0];
  if (!reference) throw new Error('At least one market is required.');
  const block = { number: reference.blockNumber, hash: reference.blockHash, timestamp: reference.timestamp };
  const data = await parallelMap(base, snapshot => snapshot.market.version === 4 ? getPortfolioSnapshotV4(client, snapshot.market, account, block) : Promise.resolve(snapshot));
  if (!data.length || data.length !== markets.length || data.some((s, i) => s.market.factory.toLowerCase() !== markets[i].factory.toLowerCase() || s.market.chainId !== markets[i].chainId || s.blockHash !== data[0].blockHash)) throw new Error('A complete snapshot at one block is required.');
  const blockNumber = data[0].blockNumber;
  const balances = new Map<string, bigint>();
  for (const market of markets) for (const token of [market.underlying, market.quote]) {
    const key = `${market.chainId}:${token.address.toLowerCase()}`;
    if (!balances.has(key)) balances.set(key, await client.readContract({ address: token.address, abi: erc20Abi, functionName: 'balanceOf', args: [account], blockNumber }));
  }
  const gas = await client.getBalance({ address: account, blockNumber });
  const positions = data.flatMap(s => s.positions.filter(p => [p.writer, p.buyer, ...(p.trades ?? []).flatMap(t => [t.seller, t.buyer])].some(a => a.toLowerCase() === account.toLowerCase())).map(p => ({ ...p, marketId: s.market.id })));
  return { complete: true, blockNumber, timestamp: data[0].timestamp, gas, tokens: summarizePortfolio(data, account, balances), positions, requests: data.flatMap(s => (s.requests ?? []).filter(r => r.buyer.toLowerCase() === account.toLowerCase()).map(r => ({ ...r, marketId: s.market.id }))) };
}
export async function prepare(client: PublicClient, market: MarketConfig, account: Address, action: string, request: PreparedOperation['request'], spend?: Spend): Promise<PreparedOperation> {
  await validateMarket(client, market);
  const operation: PreparedOperation = { account, chainId: market.chainId, action, request, spend };
  if (spend) {
    const [balance, allowance] = await Promise.all([
      client.readContract({ address: spend.token.address, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
      client.readContract({ address: spend.token.address, abi: erc20Abi, functionName: 'allowance', args: [account, request.to] }),
    ]);
    if (balance < spend.amount) throw new ProtocolError('INSUFFICIENT_BALANCE', `Not enough ${spend.token.symbol}: ${formatUnits(spend.amount, spend.token.decimals)} required, ${formatUnits(balance, spend.token.decimals)} available.`, 'Reduce the amount, reclaim eligible collateral, or add tokens.', { token: spend.token.address, required: spend.amount.toString(), available: balance.toString() });
    if (allowance < spend.amount) operation.approval = { ...spend, spender: request.to };
  }
  if (!operation.approval) await simulatePrepared(client, operation);
  return operation;
}
export async function simulatePrepared(client: PublicClient, operation: PreparedOperation): Promise<bigint> {
  if (await client.getChainId() !== operation.chainId) throw new ProtocolError('WRONG_NETWORK', 'The RPC network changed.', 'Reconnect to the configured network.');
  try {
    await client.call({ ...operation.request, account: operation.account });
    const gas = await client.estimateGas({ ...operation.request, account: operation.account });
    const [price, balance] = await Promise.all([client.getGasPrice(), client.getBalance({ address: operation.account })]);
    if (balance < gas * price) throw new ProtocolError('INSUFFICIENT_BALANCE', 'Not enough native gas token for this transaction.', 'Add gas funds on the selected network.');
    return gas * price;
  } catch (error) { throw decodeProtocolError(error); }
}
export async function prepareCreateOffer(client: PublicClient, market: MarketConfig, account: Address, terms: { optionType: 0 | 1; quantity: bigint; strikeTotal: bigint; premium: bigint; expiry: bigint }): Promise<PreparedOperation> {
  if (market.version === 4) {
    if (terms.quantity !== 10n ** BigInt(market.underlying.decimals)) throw new ProtocolError('INVALID_TERMS','One order is exactly one token.','Post separate orders.');
    return prepareOrderV4(client,market,account,{...terms,buy:false});
  }
  const { optionType, quantity, strikeTotal, premium, expiry } = terms;
  if (market.version === 3) validateLotQuantity(quantity, market.underlying.decimals);
  if (![0, 1].includes(optionType) || [quantity, strikeTotal, premium].some(n => n <= 0n || n > 2n ** 256n - 1n) || expiry >= 2n ** 64n || expiry <= (await client.getBlock()).timestamp) throw new ProtocolError('INVALID_TERMS', 'Check positive amounts and a future expiration.', 'Update the offer terms before approval.');
  return prepare(client, market, account, 'create', { to: market.factory, data: encodeFunctionData({ abi: optionFactoryAbi, functionName: 'createOption', args: [optionType, quantity, strikeTotal, premium, expiry] }) }, { token: optionType === 0 ? market.underlying : market.quote, amount: optionType === 0 ? quantity : strikeTotal });
}
async function prepareAction(client: PublicClient, market: MarketConfig, account: Address, address: Address, action: 'buy' | 'exercise' | 'cancel' | 'reclaimExpired'): Promise<PreparedOperation> {
  const p = await getOption(client, market, address), now = (await client.getBlock()).timestamp;
  if (market.version === 4 && action === 'cancel') return prepareCancelV4(client,market,account,p.orderId!);
  if (market.version === 4 && action === 'buy') return prepareOrderV4(client,market,account,{optionType:p.optionType as 0|1,strikeTotal:p.strikeTotal,premium:p.resalePrice || p.premium,expiry:p.expiry,buy:true});
  const isWriter = p.writer.toLowerCase() === account.toLowerCase(), isBuyer = p.buyer.toLowerCase() === account.toLowerCase();
  const fail = (name: string): never => { const [code, message, next] = messages[name]; throw new ProtocolError(code, message, next); };
  if ((action === 'buy' && isWriter) || (action === 'exercise' && !isBuyer) || (['cancel', 'reclaimExpired'].includes(action) && !isWriter)) fail('Unauthorized');
  if ((['buy', 'cancel'].includes(action) && p.state !== 0) || (action === 'exercise' && p.state !== 1) || (action === 'reclaimExpired' && p.state > 1)) fail('InvalidState');
  if (['buy', 'exercise'].includes(action) && now >= p.expiry) fail('OptionExpired');
  if (action === 'reclaimExpired' && now < p.expiry) fail('NotExpired');
  const spend = action === 'buy' ? { token: market.quote, amount: p.premium } : action === 'exercise' ? { token: p.optionType === 0 ? market.quote : market.underlying, amount: p.optionType === 0 ? p.strikeTotal : p.underlyingAmount } : undefined;
  return prepare(client, market, account, action, { to: address, data: encodeFunctionData({ abi: optionAbi, functionName: action }) }, spend);
}
export const prepareBuy = (client: PublicClient, market: MarketConfig, account: Address, option: Address) => prepareAction(client, market, account, option, 'buy');
export const prepareExercise = (client: PublicClient, market: MarketConfig, account: Address, option: Address) => prepareAction(client, market, account, option, 'exercise');
export const prepareCancel = (client: PublicClient, market: MarketConfig, account: Address, option: Address) => prepareAction(client, market, account, option, 'cancel');
export const prepareReclaim = (client: PublicClient, market: MarketConfig, account: Address, option: Address) => prepareAction(client, market, account, option, 'reclaimExpired');
function requireResale(market: MarketConfig) {
  if ((market.version ?? 1) < 2) throw new ProtocolError('UNAVAILABLE', 'Resale is unavailable for this legacy contract.', 'Use a version 2 market. Existing positions are not migrated.');
}
export async function prepareListResale(client: PublicClient, market: MarketConfig, account: Address, address: Address, price: bigint) {
  if (market.version === 4) return prepareResaleV4(client,market,account,address,price);
  requireResale(market);
  await getOption(client, market, address);
  if (price <= 0n || price > 2n ** 256n - 1n) throw new ProtocolError('INVALID_TERMS', 'Enter a positive total resale price.', 'Use the payment token precision.');
  return prepare(client, market, account, 'listForResale', { to: address, data: encodeFunctionData({ abi: optionAbi, functionName: 'listForResale', args: [price] }) });
}
export async function prepareCancelResale(client: PublicClient, market: MarketConfig, account: Address, address: Address) {
  if (market.version === 4) return prepareCancelV4(client,market,account,(await getOptionV4(client,market,address)).orderId!);
  requireResale(market);
  await getOption(client, market, address);
  return prepare(client, market, account, 'cancelResale', { to: address, data: encodeFunctionData({ abi: optionAbi, functionName: 'cancelResale' }) });
}
export async function prepareBuyResale(client: PublicClient, market: MarketConfig, account: Address, address: Address, listing: { seller: Address; price: bigint; nonce: bigint }) {
  requireResale(market);
  const option = await getOption(client, market, address);
  if (option.buyer.toLowerCase() !== listing.seller.toLowerCase() || option.resalePrice !== listing.price || option.listingNonce !== listing.nonce) {
    const [code, message, next] = messages.StaleListing;
    throw new ProtocolError(code, message, next);
  }
  if (listing.price <= 0n) throw new ProtocolError('UNAVAILABLE', 'This option is not listed for resale.', 'Refresh the chain.');
  if (market.version === 4) return prepareOrderV4(client,market,account,{optionType:option.optionType as 0|1,strikeTotal:option.strikeTotal,premium:listing.price,expiry:option.expiry,buy:true});
  return prepare(client, market, account, 'buyResale', { to: address, data: encodeFunctionData({ abi: optionAbi, functionName: 'buyResale', args: [listing.seller, listing.price, listing.nonce] }) }, { token: market.quote, amount: listing.price });
}
export async function getTokenDisplayMetadata(client: PublicClient, token: TokenConfig): Promise<{ multiplier?: bigint; available: boolean }> {
  if (token.adapter !== 'robinhood') return { available: true };
  try {
    const multiplier = await client.readContract({ address: token.address, abi: [{ type: 'function', name: 'uiMultiplier', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }], functionName: 'uiMultiplier' });
    return { multiplier, available: true };
  } catch { return { available: false }; }
}

/** One economic lot is 0.1 token. An option can contain many whole lots. */
export function validateLotQuantity(quantity: bigint, decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 1 || decimals > 77 || quantity <= 0n || quantity > 2n ** 256n - 1n || quantity % (10n ** BigInt(decimals - 1)) !== 0n) {
    throw new ProtocolError('INVALID_TERMS', 'Quantity must be a positive multiple of 0.1 token.', 'Enter a whole number of lots; one option covers the complete quantity.');
  }
}
function requireRequests(market: MarketConfig) {
  if (market.version !== 3) throw new ProtocolError('UNAVAILABLE', 'Buy requests require a version 3 market.', 'Existing options remain available in their original markets.');
}
export async function getBuyRequest(client: PublicClient, market: MarketConfig, id: bigint): Promise<BuyRequest> {
  requireRequests(market);
  await validateMarket(client, market);
  if (id < 0n || id > 2n ** 256n - 1n) throw new ProtocolError('INVALID_TERMS', 'Invalid request identifier.', 'Choose a request from this market.');
  try { return { id, ...await client.readContract({ address: market.factory, abi: optionFactoryAbi, functionName: 'getRequest', args: [id] }) }; }
  catch (error) { throw decodeProtocolError(error); }
}
export async function prepareCreateRequest(client: PublicClient, market: MarketConfig, account: Address, terms: { optionType: 0 | 1; quantity: bigint; strikeTotal: bigint; premium: bigint; expiry: bigint; acceptUntil: bigint }) {
  requireRequests(market);
  validateLotQuantity(terms.quantity, market.underlying.decimals);
  const { optionType, quantity, strikeTotal, premium, expiry, acceptUntil } = terms;
  const now = (await client.getBlock()).timestamp;
  if (![0, 1].includes(optionType) || [strikeTotal, premium].some(n => n <= 0n || n > 2n ** 256n - 1n) || expiry >= 2n ** 64n || acceptUntil <= now || acceptUntil >= expiry) throw new ProtocolError('INVALID_TERMS', 'Check amounts and request deadlines.', 'Acceptance must end before option expiration and after the current chain time.');
  return prepare(client, market, account, 'Request option', { to: market.factory, data: encodeFunctionData({ abi: optionFactoryAbi, functionName: 'createRequest', args: [optionType, quantity, strikeTotal, premium, expiry, acceptUntil] }) }, { token: market.quote, amount: premium });
}
export async function prepareAcceptRequest(client: PublicClient, market: MarketConfig, account: Address, id: bigint) {
  const r = await getBuyRequest(client, market, id);
  if (r.state !== 0) throw new ProtocolError('UNAVAILABLE', 'This request is no longer open.', 'Refresh requests.');
  if (r.buyer.toLowerCase() === account.toLowerCase()) throw new ProtocolError('UNAUTHORIZED', 'You cannot write your own request.', 'Use another writer wallet.');
  if (r.acceptUntil <= (await client.getBlock()).timestamp) throw new ProtocolError('EXPIRED', 'The acceptance deadline has passed.', 'Choose an open request.');
  return prepare(client, market, account, 'Accept request & write option', { to: market.factory, data: encodeFunctionData({ abi: optionFactoryAbi, functionName: 'acceptRequest', args: [id] }) }, { token: r.optionType === 0 ? market.underlying : market.quote, amount: r.optionType === 0 ? r.underlyingAmount : r.strikeTotal });
}
export async function prepareCancelRequest(client: PublicClient, market: MarketConfig, account: Address, id: bigint) {
  if (market.version === 4) return prepareCancelV4(client,market,account,id);
  const r = await getBuyRequest(client, market, id);
  if (r.buyer.toLowerCase() !== account.toLowerCase()) throw new ProtocolError('UNAUTHORIZED', 'Only the requester can recover this premium.', 'Connect the requester wallet.');
  if (r.state !== 0) throw new ProtocolError('UNAVAILABLE', 'This request is no longer open.', 'Refresh requests.');
  return prepare(client, market, account, 'Cancel request & recover premium', { to: market.factory, data: encodeFunctionData({ abi: optionFactoryAbi, functionName: 'cancelRequest', args: [id] }) });
}
