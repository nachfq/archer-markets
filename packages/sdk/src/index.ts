import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  parseUnits,
  type Address,
  type Hash,
  type PublicClient,
} from 'viem';
import { erc20Abi as tokenErrorsAbi, optionMarketV4Abi, optionV4Abi } from './abis.js';
import { getOptionV4, getPortfolioSnapshotV4, getSnapshotV4 } from './v4.js';

export * from './v4.js';
export { erc20Abi as protocolErc20Abi, optionMarketV4Abi, optionV4Abi } from './abis.js';

export type ChainConfig = { chainId: number; name: string; rpcUrl: string; explorerUrl: string };
export type TokenConfig = { address: Address; symbol: string; decimals: number; isMock: boolean; adapter?: 'erc20' | 'robinhood' };
export type MarketConfig = { id: string; chainId: number; factory: Address; deploymentBlock: bigint; version: 4; underlying: TokenConfig; quote: TokenConfig; sandbox: boolean };
export type OptionTrade = { seller: Address; buyer: Address; price: bigint; blockNumber: bigint; transactionHash: Hash };
export type Option = { orderId?: bigint; bookSize?: bigint; seriesKey?: Hash; address: Address; writer: Address; buyer: Address; underlyingAmount: bigint; strikeTotal: bigint; premium: bigint; expiry: bigint; optionType: number; state: number; resalePrice?: bigint; listingNonce?: bigint; trades?: OptionTrade[] };
export type Bid = { id: bigint; bookSize?: bigint; seriesKey?: Hash; buyer: Address; optionType: number; underlyingAmount: bigint; strikeTotal: bigint; premium: bigint; expiry: bigint; state: number; option: Address };
export type MarketSnapshot = { orders?: import('./v4.js').OrderV4[]; market: MarketConfig; blockNumber: bigint; blockHash: Hash; timestamp: bigint; positions: Option[]; bids: Bid[]; total: bigint };
export type TokenBalance = { token: TokenConfig; available: bigint; openBidPremium: bigint; refundableBidPremium: bigint; openCollateral: bigint; activeCollateral: bigint; reclaimable: bigint; totalTracked: bigint };
export type Portfolio = { blockNumber: bigint; timestamp: bigint; gas: bigint; tokens: TokenBalance[]; positions: (Option & { marketId: string })[]; bids: (Bid & { marketId: string })[]; complete: true };
export type Spend = { token: TokenConfig; amount: bigint };
export type PreparedOperation = { action: string; account: Address; chainId: number; request: { to: Address; data: `0x${string}` }; approval?: Spend & { spender: Address }; spend?: Spend };
export type ErrorCode = 'INSUFFICIENT_BALANCE' | 'INSUFFICIENT_ALLOWANCE' | 'EXPIRED' | 'NOT_EXPIRED' | 'UNAUTHORIZED' | 'UNAVAILABLE' | 'INVALID_TERMS' | 'TOKEN_TRANSFER' | 'WALLET_REJECTED' | 'WRONG_NETWORK' | 'PENDING' | 'REVERTED' | 'RPC_ERROR';

export class ProtocolError extends Error {
  constructor(public code: ErrorCode, message: string, public nextAction: string, public details?: { token?: string; required?: string; available?: string; technical?: string; txHash?: Hash }) {
    super(message);
    this.name = 'ProtocolError';
  }
}

const messages: Record<string, [ErrorCode, string, string]> = {
  SelfTrade: ['UNAUTHORIZED', 'The best order is yours or would return an option to its writer.', 'Cancel the conflicting order or change your limit; priority cannot be skipped.'],
  OrderUnavailable: ['UNAVAILABLE', 'This order is no longer available.', 'Refresh the book.'],
  ERC20InsufficientBalance: ['INSUFFICIENT_BALANCE', 'The token balance is too low.', 'Reduce the amount or add the required tokens.'],
  ERC20InsufficientAllowance: ['INSUFFICIENT_ALLOWANCE', 'The token approval is insufficient.', 'Approve the required amount and try again.'],
  OptionExpired: ['EXPIRED', 'This option has expired.', 'Exercise is no longer possible. The writer can reclaim collateral.'],
  NotExpired: ['NOT_EXPIRED', 'This collateral is still committed.', 'Wait until expiration to reclaim it.'],
  Unauthorized: ['UNAUTHORIZED', 'This wallet cannot perform that action.', 'Use the current holder, writer, or order owner wallet.'],
  InvalidState: ['UNAVAILABLE', 'The option is no longer available for this action.', 'Refresh the position. Another transaction may have changed its state.'],
  InvalidTerms: ['INVALID_TERMS', 'The option terms are invalid.', 'Check positive amounts and a future expiration.'],
  InvalidPair: ['INVALID_TERMS', 'The market token pair is invalid.', 'Choose a configured market with two distinct deployed tokens.'],
  UnsupportedTokenTransfer: ['TOKEN_TRANSFER', 'The token did not transfer the exact required amount.', 'This token may not be compatible with this market.'],
  SafeERC20FailedOperation: ['TOKEN_TRANSFER', 'The token contract refused the transfer.', 'Check token restrictions and approvals.'],
  NotFunded: ['UNAVAILABLE', 'The option is not funded.', 'Choose a funded option from the verified market.'],
};

export function decodeProtocolError(error: unknown): ProtocolError {
  if (error instanceof ProtocolError) return error;
  const visited = new Set<unknown>();
  let current: unknown = error;
  let name: string | undefined;
  for (let i = 0; i < 12 && current && typeof current === 'object' && !visited.has(current); i++) {
    visited.add(current);
    const candidate = current as { code?: number; name?: string; data?: unknown; cause?: unknown };
    if (candidate.code === 4001 || candidate.name === 'UserRejectedRequestError') return new ProtocolError('WALLET_REJECTED', 'Wallet signature rejected. This step was not sent.', 'You can retry when ready. Any previously confirmed approval remains in place.');
    if (candidate.name?.includes('Timeout')) return new ProtocolError('PENDING', 'Confirmation has not arrived yet.', 'Check the transaction status before sending another operation.');
    if (current instanceof ContractFunctionRevertedError) name = current.data?.errorName;
    if (typeof candidate.data === 'string' && candidate.data.startsWith('0x')) {
      try { name = decodeErrorResult({ abi: [...optionMarketV4Abi, ...optionV4Abi, ...tokenErrorsAbi], data: candidate.data as `0x${string}` }).errorName; }
      catch { /* Unknown token errors retain their raw diagnostic. */ }
    }
    if (name && messages[name]) {
      const [code, message, nextAction] = messages[name];
      return new ProtocolError(code, message, nextAction, { technical: name });
    }
    current = candidate.cause;
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

const validations = new WeakMap<PublicClient, Map<string, Promise<void>>>();
async function validateMarketFresh(client: PublicClient, market: MarketConfig) {
  const [code, version, underlying, quote, underlyingDecimals, quoteDecimals] = await Promise.all([
    client.getCode({ address: market.factory }),
    client.readContract({ address: market.factory, abi: optionMarketV4Abi, functionName: 'version' }),
    client.readContract({ address: market.factory, abi: optionMarketV4Abi, functionName: 'underlying' }),
    client.readContract({ address: market.factory, abi: optionMarketV4Abi, functionName: 'quote' }),
    client.readContract({ address: market.underlying.address, abi: erc20Abi, functionName: 'decimals' }),
    client.readContract({ address: market.quote.address, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  if (market.version !== 4 || version !== 4n || !code || code === '0x' || underlying.toLowerCase() !== market.underlying.address.toLowerCase() || quote.toLowerCase() !== market.quote.address.toLowerCase() || underlyingDecimals !== market.underlying.decimals || quoteDecimals !== market.quote.decimals) {
    throw new ProtocolError('UNAVAILABLE', 'Deployment does not match the V4 market configuration.', 'Check the network, market address and token metadata.');
  }
}

export async function validateMarket(client: PublicClient, market: MarketConfig) {
  if (await client.getChainId() !== market.chainId) throw new ProtocolError('WRONG_NETWORK', 'The RPC is on another network.', 'Use the RPC configured for this market.');
  let cache = validations.get(client);
  if (!cache) {
    cache = new Map();
    validations.set(client, cache);
  }
  const key = `${market.chainId}:${market.factory.toLowerCase()}`;
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

export async function getMarkets(client: PublicClient, markets: MarketConfig[]): Promise<MarketSnapshot[]> {
  if (!markets.length) return [];
  if (markets.some(market => market.chainId !== markets[0].chainId)) throw new ProtocolError('WRONG_NETWORK', 'Use one chain per client snapshot.', 'Create a separate client for each chain.');
  await Promise.all(markets.map(market => validateMarket(client, market)));
  const block = await client.getBlock({ blockTag: 'latest' });
  if (!block.hash || block.number === null) throw new Error('A mined block is required.');
  return parallelMap(markets, market => getSnapshotV4(client, market, { number: block.number!, hash: block.hash!, timestamp: block.timestamp }));
}

export const getOption = (client: PublicClient, market: MarketConfig, address: Address) => getOptionV4(client, market, address);

export function summarizePortfolio(snapshots: MarketSnapshot[], account: Address, walletBalances: Map<string, bigint>): TokenBalance[] {
  const tokens = new Map<string, TokenBalance>();
  const seenOptions = new Set<string>();
  const seenBids = new Set<string>();
  for (const { market, positions, timestamp, bids } of snapshots) {
    for (const token of [market.underlying, market.quote]) {
      const key = `${market.chainId}:${token.address.toLowerCase()}`;
      if (!tokens.has(key)) {
        const available = walletBalances.get(key);
        if (available === undefined) throw new Error('Incomplete wallet balances.');
        tokens.set(key, { token, available, openBidPremium: 0n, refundableBidPremium: 0n, openCollateral: 0n, activeCollateral: 0n, reclaimable: 0n, totalTracked: available });
      }
    }
    for (const bid of bids) {
      const key = `${market.chainId}:${market.factory.toLowerCase()}:${bid.id}`;
      if (seenBids.has(key)) continue;
      seenBids.add(key);
      if (bid.state !== 0 || bid.buyer.toLowerCase() !== account.toLowerCase()) continue;
      const row = tokens.get(`${market.chainId}:${market.quote.address.toLowerCase()}`)!;
      if (bid.expiry <= timestamp) row.refundableBidPremium += bid.premium;
      else row.openBidPremium += bid.premium;
      row.totalTracked += bid.premium;
    }
    for (const position of positions) {
      const key = `${market.chainId}:${position.address.toLowerCase()}`;
      if (seenOptions.has(key)) continue;
      seenOptions.add(key);
      if (position.writer.toLowerCase() !== account.toLowerCase() || position.state > 1) continue;
      const token = position.optionType === 0 ? market.underlying : market.quote;
      const amount = position.optionType === 0 ? position.underlyingAmount : position.strikeTotal;
      const row = tokens.get(`${market.chainId}:${token.address.toLowerCase()}`)!;
      if (position.expiry <= timestamp) row.reclaimable += amount;
      else if (position.state === 0) row.openCollateral += amount;
      else row.activeCollateral += amount;
      row.totalTracked += amount;
    }
  }
  return [...tokens.values()];
}

export async function getPortfolio(client: PublicClient, markets: MarketConfig[], account: Address, snapshots?: MarketSnapshot[]): Promise<Portfolio> {
  if (!markets.length) throw new Error('At least one market is required.');
  let base = snapshots;
  if (!base) {
    await Promise.all(markets.map(market => validateMarket(client, market)));
    const block = await client.getBlock({ blockTag: 'latest' });
    if (!block.hash || block.number === null) throw new Error('A mined block is required.');
    base = markets.map(market => ({ market, total: 0n, positions: [], bids: [], blockNumber: block.number!, blockHash: block.hash!, timestamp: block.timestamp }));
  }
  const reference = base[0];
  if (!reference) throw new Error('At least one market is required.');
  const block = { number: reference.blockNumber, hash: reference.blockHash, timestamp: reference.timestamp };
  const data = await parallelMap(base, snapshot => getPortfolioSnapshotV4(client, snapshot.market, account, block));
  if (data.length !== markets.length || data.some((snapshot, index) => snapshot.market.factory.toLowerCase() !== markets[index].factory.toLowerCase() || snapshot.market.chainId !== markets[index].chainId || snapshot.blockHash !== data[0].blockHash)) throw new Error('A complete snapshot at one block is required.');
  const blockNumber = data[0].blockNumber;
  const balances = new Map<string, bigint>();
  for (const market of markets) for (const token of [market.underlying, market.quote]) {
    const key = `${market.chainId}:${token.address.toLowerCase()}`;
    if (!balances.has(key)) balances.set(key, await client.readContract({ address: token.address, abi: erc20Abi, functionName: 'balanceOf', args: [account], blockNumber }));
  }
  const gas = await client.getBalance({ address: account, blockNumber });
  const positions = data.flatMap(snapshot => snapshot.positions.filter(position => [position.writer, position.buyer, ...(position.trades ?? []).flatMap(trade => [trade.seller, trade.buyer])].some(address => address.toLowerCase() === account.toLowerCase())).map(position => ({ ...position, marketId: snapshot.market.id })));
  const bids = data.flatMap(snapshot => snapshot.bids.filter(bid => bid.buyer.toLowerCase() === account.toLowerCase()).map(bid => ({ ...bid, marketId: snapshot.market.id })));
  return { complete: true, blockNumber, timestamp: data[0].timestamp, gas, tokens: summarizePortfolio(data, account, balances), positions, bids };
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
  } catch (error) {
    throw decodeProtocolError(error);
  }
}

async function prepareOptionAction(client: PublicClient, market: MarketConfig, account: Address, address: Address, action: 'exercise' | 'reclaimExpired'): Promise<PreparedOperation> {
  const option = await getOption(client, market, address);
  const now = (await client.getBlock()).timestamp;
  const isWriter = option.writer.toLowerCase() === account.toLowerCase();
  const isHolder = option.buyer.toLowerCase() === account.toLowerCase();
  const fail = (name: string): never => {
    const [code, message, nextAction] = messages[name];
    throw new ProtocolError(code, message, nextAction);
  };
  if ((action === 'exercise' && !isHolder) || (action === 'reclaimExpired' && !isWriter)) fail('Unauthorized');
  if ((action === 'exercise' && option.state !== 1) || (action === 'reclaimExpired' && option.state > 1)) fail('InvalidState');
  if (action === 'exercise' && now >= option.expiry) fail('OptionExpired');
  if (action === 'reclaimExpired' && now < option.expiry) fail('NotExpired');
  const spend = action === 'exercise' ? { token: option.optionType === 0 ? market.quote : market.underlying, amount: option.optionType === 0 ? option.strikeTotal : option.underlyingAmount } : undefined;
  return prepare(client, market, account, action, { to: address, data: encodeFunctionData({ abi: optionV4Abi, functionName: action }) }, spend);
}

export const prepareExercise = (client: PublicClient, market: MarketConfig, account: Address, option: Address) => prepareOptionAction(client, market, account, option, 'exercise');
export const prepareReclaim = (client: PublicClient, market: MarketConfig, account: Address, option: Address) => prepareOptionAction(client, market, account, option, 'reclaimExpired');

export async function getTokenDisplayMetadata(client: PublicClient, token: TokenConfig): Promise<{ multiplier?: bigint; available: boolean }> {
  if (token.adapter !== 'robinhood') return { available: true };
  try {
    const multiplier = await client.readContract({ address: token.address, abi: [{ type: 'function', name: 'uiMultiplier', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }], functionName: 'uiMultiplier' });
    return { multiplier, available: true };
  } catch {
    return { available: false };
  }
}
