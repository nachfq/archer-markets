import { encodeAbiParameters, encodeFunctionData, keccak256, parseAbiItem, zeroAddress, type Address, type PublicClient, type Hash } from 'viem';
import { optionMarketV4Abi, optionV4Abi } from './abis.js';
import { prepare, ProtocolError, type MarketConfig, type MarketSnapshot, type Option, type Bid } from './index.js';
export type OrderV4 = {
    id: bigint;
    owner: Address;
    series: Hash;
    option: Address;
    price: number;
    buy: boolean;
    resale: boolean;
    state: number;
    previous: bigint;
    next: bigint;
};
export type SeriesV4 = {
    key: Hash;
    kind: number;
    strike: number;
    expiry: bigint;
};
export type LevelV4 = {
    price: number;
    count: bigint;
    firstOrder: bigint;
};
export type QuoteV4 = LevelV4 & {
    owner: Address;
    writer: Address;
    option: Address;
    resale: boolean;
};
export type BookRowV4 = {
    key: Hash;
    terms: { kind: number; strike: number; expiry: bigint };
    bid: QuoteV4;
    ask: QuoteV4;
};
export const v4Tick = (decimals: number) => {
    if (!Number.isInteger(decimals) || decimals < 2 || decimals > 18)
        throw new ProtocolError('INVALID_TERMS', 'Payment decimals must be between 2 and 18.', 'Use a compatible market.');
    return 10n ** BigInt(decimals - 2);
};
export const feeForV4 = (market: MarketConfig, payment: bigint) => market.baseFee + payment * BigInt(market.feeBps) / 10_000n;
export function priceTicks(amount: bigint, decimals: number): number {
    const tick = v4Tick(decimals), ticks = amount / tick;
    if (amount <= 0n || amount % tick !== 0n || ticks > 0xffffffffn)
        throw new ProtocolError('INVALID_TERMS', 'Prices must be 0.01–42,949,672.95 in steps of 0.01.', 'Enter a valid strike and premium.');
    return Number(ticks);
}
function requireV4(m: MarketConfig) { if (m.version !== 4)
    throw new ProtocolError('UNAVAILABLE', 'This operation requires V4.', 'Select a V4 market.'); }
export async function getOrderV4(c: PublicClient, m: MarketConfig, id: bigint, blockNumber?: bigint): Promise<OrderV4> {
    requireV4(m);
    return { id, ...await c.readContract({ address: m.factory, abi: optionMarketV4Abi, functionName: 'getOrder', args: [id], blockNumber }) };
}
export async function getSeriesV4(c: PublicClient, m: MarketConfig, offset = 0n, blockNumber?: bigint): Promise<SeriesV4[]> {
    const keys = await c.readContract({ address: m.factory, abi: optionMarketV4Abi, functionName: 'getSeries', args: [offset, 64], blockNumber });
    return Promise.all(keys.map(async (key) => {
        const [kind, strike, expiry] = await c.readContract({ address: m.factory, abi: optionMarketV4Abi, functionName: 'series', args: [key], blockNumber });
        return { key, kind, strike, expiry };
    }));
}
export async function getDepthV4(c: PublicClient, m: MarketConfig, key: Hash, buy: boolean, afterPrice = 0, blockNumber?: bigint): Promise<readonly LevelV4[]> {
    return c.readContract({ address: m.factory, abi: optionMarketV4Abi, functionName: 'getDepth', args: [key, buy, afterPrice, 64], blockNumber });
}
export async function getDepthPageV4(c: PublicClient, m: MarketConfig, key: Hash, buy: boolean, afterPrice = 0, blockNumber?: bigint): Promise<readonly QuoteV4[]> {
    requireV4(m);
    return c.readContract({ address: m.factory, abi: optionMarketV4Abi, functionName: 'getDepthPage', args: [key, buy, afterPrice, 32], blockNumber });
}
export async function getBookV4(c: PublicClient, m: MarketConfig, blockNumber?: bigint): Promise<BookRowV4[]> {
    requireV4(m);
    const result: BookRowV4[] = [];
    for (let offset = 0n;; offset += 32n) {
        const page = await c.readContract({ address: m.factory, abi: optionMarketV4Abi, functionName: 'getBookPage', args: [offset, 32], blockNumber });
        result.push(...page);
        if (page.length < 32) return result;
    }
}
export async function getOptionV4(c: PublicClient, m: MarketConfig, address: Address, blockNumber?: bigint): Promise<Option> {
    if (!await c.readContract({ address: m.factory, abi: optionMarketV4Abi, functionName: 'registeredOption', args: [address], blockNumber }))
        throw new ProtocolError('UNAVAILABLE', 'This option is not registered in the market.', 'Select a registered option.');
    const names = ['writer', 'buyer', 'underlyingAmount', 'strikeTotal', 'premium', 'expiry', 'optionType', 'state', 'resalePrice', 'listingNonce'] as const;
    const values = await Promise.all(names.map(functionName => c.readContract({ address, abi: optionV4Abi, functionName, blockNumber })));
    const orderId = await c.readContract({ address: m.factory, abi: optionMarketV4Abi, functionName: 'optionOrder', args: [address], blockNumber });
    return { address, ...Object.fromEntries(names.map((n, i) => [n, values[i]])), orderId } as Option;
}
const syntheticQuotes = (m: MarketConfig, series: SeriesV4, quotes: readonly QuoteV4[], buy: boolean) => {
    const tick = v4Tick(m.quote.decimals);
    const underlyingAmount = 10n ** BigInt(m.underlying.decimals);
    return quotes.filter(q => q.firstOrder !== 0n).map(q => buy ? ({
        id: q.firstOrder, bookSize: q.count, seriesKey: series.key, buyer: q.owner, optionType: series.kind,
        underlyingAmount, strikeTotal: BigInt(series.strike) * tick, premium: BigInt(q.price) * tick,
        expiry: series.expiry, state: 0, option: q.option,
    } satisfies Bid) : ({
        orderId: q.firstOrder, bookSize: q.count, seriesKey: series.key, address: q.option,
        writer: q.writer, buyer: q.resale ? q.owner : zeroAddress,
        underlyingAmount, strikeTotal: BigInt(series.strike) * tick, premium: BigInt(q.price) * tick,
        expiry: series.expiry, optionType: series.kind, state: q.resale ? 1 : 0,
        resalePrice: q.resale ? BigInt(q.price) * tick : 0n, listingNonce: 0n,
    } satisfies Option));
};

// The trade screen reads only aggregate onchain quotes, never option registries or logs.
export async function getSnapshotV4(c: PublicClient, m: MarketConfig, block: {
    number: bigint;
    hash: Hash;
    timestamp: bigint;
}): Promise<MarketSnapshot> {
    const rows = await getBookV4(c, m, block.number);
    const positions: Option[] = [], bids: Bid[] = [];
    for (const row of rows) {
        const s: SeriesV4 = { key: row.key, ...row.terms };
        bids.push(...syntheticQuotes(m, s, [row.bid], true) as Bid[]);
        positions.push(...syntheticQuotes(m, s, [row.ask], false) as Option[]);
    }
    return { market: m, ...block, blockNumber: block.number, blockHash: block.hash, positions, bids, total: BigInt(rows.length) };
}

export async function getBookDepthV4(c: PublicClient, m: MarketConfig, terms: { optionType: 0 | 1; strikeTotal: bigint; expiry: bigint }, blockNumber?: bigint) {
    const snapshotBlock = blockNumber ?? (await c.getBlock({ blockTag: 'latest' })).number;
    if (snapshotBlock === null) throw new Error('A mined block is required.');
    const strike = priceTicks(terms.strikeTotal, m.quote.decimals);
    const key = keccak256(encodeAbiParameters([{ type: 'uint8' }, { type: 'uint32' }, { type: 'uint64' }], [terms.optionType, strike, terms.expiry]));
    const series: SeriesV4 = { key, kind: terms.optionType, strike, expiry: terms.expiry };
    const read = async (buy: boolean) => {
        const quotes: QuoteV4[] = [];
        let afterPrice = 0;
        for (;;) {
            const page = await getDepthPageV4(c, m, key, buy, afterPrice, snapshotBlock);
            quotes.push(...page);
            if (page.length < 32) return quotes;
            afterPrice = page[page.length - 1].price;
        }
    };
    const [bids, asks] = await Promise.all([read(true), read(false)]);
    return { positions: syntheticQuotes(m, series, asks, false) as Option[], bids: syntheticQuotes(m, series, bids, true) as Bid[] };
}

export async function getPortfolioSnapshotV4(c: PublicClient, m: MarketConfig, account: Address, block: { number: bigint; hash: Hash; timestamp: bigint }): Promise<MarketSnapshot> {
    const orderMap = new Map<bigint, OrderV4>();
    for (let offset = 0n;; offset += 64n) {
        const ids = await c.readContract({ address: m.factory, abi: optionMarketV4Abi, functionName: 'getUserOrders', args: [account, offset, 64], blockNumber: block.number });
        for (let i = 0; i < ids.length; i += 8) await Promise.all(ids.slice(i, i + 8).map(async id => orderMap.set(id, await getOrderV4(c, m, id, block.number))));
        if (ids.length < 64) break;
    }
    const addresses = new Set<Address>();
    for (let offset = 0n;; offset += 64n) {
        const page = await c.readContract({ address: m.factory, abi: optionMarketV4Abi, functionName: 'getUserOptions', args: [account, offset, 64], blockNumber: block.number });
        page.forEach(address => addresses.add(address));
        if (page.length < 64) break;
    }
    const positions: Option[] = [], list = [...addresses];
    for (let i = 0; i < list.length; i += 8) positions.push(...await Promise.all(list.slice(i, i + 8).map(address => getOptionV4(c, m, address, block.number))));
    for (let i = 0; i < list.length; i += 64) {
        const logs = await c.getLogs({ address: list.slice(i, i + 64), events: [parseAbiItem('event Bought(address indexed buyer, uint256 premium)'), parseAbiItem('event Resold(address indexed seller, address indexed buyer, uint256 price, uint256 nonce)')], fromBlock: m.deploymentBlock, toBlock: block.number, strict: true });
        for (const log of logs) {
            const p = positions.find(position => position.address.toLowerCase() === log.address.toLowerCase())!;
            (p.trades ??= []).push({ seller: log.eventName === 'Bought' ? p.writer : log.args.seller, buyer: log.args.buyer, price: log.eventName === 'Bought' ? log.args.premium : log.args.price, blockNumber: log.blockNumber, transactionHash: log.transactionHash });
        }
    }
    const series = new Map<Hash, SeriesV4>();
    for (const key of new Set([...orderMap.values()].map(order => order.series))) {
        const [kind, strike, expiry] = await c.readContract({ address: m.factory, abi: optionMarketV4Abi, functionName: 'series', args: [key], blockNumber: block.number });
        series.set(key, { key, kind, strike, expiry });
    }
    const paid = new Map<bigint, number>();
    const executed = [...orderMap.values()].filter(order => order.buy && order.state === 2).map(order => order.id);
    const event = parseAbiItem('event OrderExecuted(uint64 indexed incoming, uint64 indexed resting, address indexed option, address buyer, address seller, uint32 price, uint256 fee)');
    for (let i = 0; i < executed.length; i += 64) for (const args of [{ incoming: executed.slice(i, i + 64) }, { resting: executed.slice(i, i + 64) }]) {
        const logs = await c.getLogs({ address: m.factory, event, args, fromBlock: m.deploymentBlock, toBlock: block.number, strict: true });
        for (const log of logs) { paid.set(log.args.incoming, log.args.price); paid.set(log.args.resting, log.args.price); }
    }
    if (executed.some(id => !paid.has(id))) throw new Error('Execution history is incomplete for this market snapshot.');
    const tick = v4Tick(m.quote.decimals), bids: Bid[] = [];
    for (const order of orderMap.values()) if (order.buy) {
        const s = series.get(order.series)!;
        bids.push({ id: order.id, buyer: order.owner, optionType: s.kind, underlyingAmount: 10n ** BigInt(m.underlying.decimals), strikeTotal: BigInt(s.strike) * tick, premium: BigInt(paid.get(order.id) ?? order.price) * tick, expiry: s.expiry, state: order.state === 1 ? 0 : order.state === 2 ? 1 : 2, option: order.option });
    }
    return { market: m, ...block, blockNumber: block.number, blockHash: block.hash, positions, bids, orders: [...orderMap.values()], total: await c.readContract({ address: m.factory, abi: optionMarketV4Abi, functionName: 'optionCount', blockNumber: block.number }) };
}
export async function prepareOrderV4(c: PublicClient, m: MarketConfig, account: Address, terms: {
    optionType: 0 | 1;
    strikeTotal: bigint;
    premium: bigint;
    expiry: bigint;
    buy: boolean;
}) {
    requireV4(m);
    const strike = priceTicks(terms.strikeTotal, m.quote.decimals), price = priceTicks(terms.premium, m.quote.decimals);
    if (![0, 1].includes(terms.optionType) || terms.expiry <= (await c.getBlock()).timestamp || terms.expiry >= 2n ** 64n)
        throw new ProtocolError('INVALID_TERMS', 'Choose a future expiration.', 'Check order terms.');
    return prepare(c, m, account, 'Limit order', { to: m.factory, data: encodeFunctionData({ abi: optionMarketV4Abi, functionName: 'placeOrder', args: [terms.optionType, strike, terms.expiry, terms.buy, price] }) }, { token: terms.buy || terms.optionType === 1 ? m.quote : m.underlying, amount: terms.buy ? terms.premium + feeForV4(m, terms.premium) : terms.optionType === 0 ? 10n ** BigInt(m.underlying.decimals) : terms.strikeTotal });
}
export async function prepareResaleV4(c: PublicClient, m: MarketConfig, account: Address, option: Address, price: bigint) {
    requireV4(m);
    const p = await getOptionV4(c, m, option);
    if (p.buyer.toLowerCase() !== account.toLowerCase())
        throw new ProtocolError('UNAUTHORIZED', 'Only the holder can sell this option.', 'Use the holder wallet.');
    return prepare(c, m, account, 'Resale order', { to: m.factory, data: encodeFunctionData({ abi: optionMarketV4Abi, functionName: 'placeResale', args: [option, priceTicks(price, m.quote.decimals)] }) });
}
export async function prepareCancelV4(c: PublicClient, m: MarketConfig, account: Address, id: bigint) {
    const o = await getOrderV4(c, m, id);
    if (o.owner.toLowerCase() !== account.toLowerCase())
        throw new ProtocolError('UNAUTHORIZED', 'Only the owner can cancel this order.', 'Use the owner wallet.');
    if (o.state !== 1)
        throw new ProtocolError('UNAVAILABLE', 'This order is no longer open.', 'Refresh the portfolio.');
    return prepare(c, m, account, 'Cancel order', { to: m.factory, data: encodeFunctionData({ abi: optionMarketV4Abi, functionName: 'cancelOrder', args: [id] }) });
}
