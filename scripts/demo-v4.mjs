#!/usr/bin/env node
// Local-only fixture generator. Accounts 0 and 1 receive tokens but never sign seed transactions.
import { setTimeout as delay } from 'node:timers/promises';
import { createPublicClient, createWalletClient, decodeEventLog, encodeDeployData, encodeFunctionData, erc20Abi, http } from 'viem';
import { artifact, network, readJson, saveJson, publicDeployment, reportError } from './config.mjs';
import { assertLocalDemo, demoStocks, demoOffers, demoRequests, playerStockAmount, playerQuoteAmount, priceSnapshotDate } from './demo-config.mjs';
try {
    const args = new Set(process.argv.slice(2));
    for (const arg of args)
        if (!['--dry-run', '--deploy-only', '--seed-only', '--no-export'].includes(arg))
            throw new Error(`Unknown argument: ${arg}`);
    if (args.has('--deploy-only') && args.has('--seed-only'))
        throw new Error('Choose only one stage.');
    const chain = network('local'), url = chain.rpcUrls.default.http[0];
    const client = createPublicClient({ chain, transport: http(url), pollingInterval: 25, cacheTime: 0 });
    const accounts = await client.request({ method: 'eth_accounts' });
    const actors = assertLocalDemo(url, await client.getChainId(), await client.request({ method: 'web3_clientVersion' }), accounts);
    const manifestFile = process.env.DEMO_MANIFEST ?? 'deployments/31337.json';
    let manifest;
    try {
        manifest = await readJson(manifestFile);
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
        manifest = { chainId: 31337, name: 'Local Anvil', rpcUrl: url, explorerUrl: '', factory: null, markets: [] };
    }
    if (manifest.chainId !== 31337)
        throw new Error('Local manifest required.');
    const genesis = await client.getBlock({ blockNumber: 0n });
    const ledgerFile = process.env.DEMO_LEDGER ?? `deployments/local-demo-v4-${genesis.hash}.json`;
    let ledger;
    try {
        ledger = await readJson(ledgerFile);
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
    if (ledger && (ledger.schema !== 4 || ledger.genesis !== genesis.hash || ledger.rpcUrl !== url || ledger.actors.join().toLowerCase() !== actors.join().toLowerCase()))
        throw new Error('The saved run belongs to a different node or actor set. Choose a separate DEMO_LEDGER; do not overwrite it.');
    ledger ??= { schema: 4, genesis: genesis.hash, rpcUrl: url, actors, referenceDate: priceSnapshotDate, referenceStocks: demoStocks, timestamp: (await client.getBlock()).timestamp.toString(), transactions: {}, markets: [], offers: {}, requests: {} };
    const normalize = offer => ({ ...offer, quantity: 10n ** 18n,
        strikeTotal: (offer.strikeTotal * 10n ** 18n / offer.quantity / 10000n) * 10000n,
        premium: ((offer.premium * 10n ** 18n / offer.quantity + 9999n) / 10000n) * 10000n });
    const plans = demoStocks.flatMap(stock => demoOffers(stock, BigInt(ledger.timestamp))).map(normalize);
    for (const p of plans)
        if (p.referenceStep === 0)
            p.premium = plans.find(q => q.id.split('-')[0] === p.id.split('-')[0] && q.expiry === p.expiry && q.optionType === p.optionType && q.referenceStep === 0).premium;
    const requests = demoStocks.flatMap(stock => demoRequests(stock, BigInt(ledger.timestamp))).map(r => {
        const offer = plans.find(p => p.id === r.id.replace('-request', ''));
        return { ...r, ...normalize(r), premium: (offer.premium / 10000n * 90n / 100n || 1n) * 10000n, acceptUntil: r.expiry };
    });
    console.log(`Local demo: ${plans.length} options and ${requests.length} buy requests across five markets. Accounts 0–1 are players; accounts 2–9 populate the market. Synthetic prices (${priceSnapshotDate}).`);
    if (args.has('--dry-run')) {
        console.log(JSON.stringify({ stages: ['deploy', 'fund players', 'seed offers and requests'], markets: demoStocks, offers: plans.length, requests: requests.length, alreadyRecorded: Object.keys(ledger.offers).length, expirations: [...new Set(plans.map(p => p.expiry.toString()))], writes: 0 }, null, 2));
        process.exit(0);
    }
    // Reuse only previously recorded grants to the same tokens on this genesis.
    let previousLedger;
    try {
        previousLedger = await readJson(`deployments/local-demo-${genesis.hash}.json`);
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
    await saveJson(ledgerFile, ledger);
    const wallet = account => {
        if (!actors.some(a => a.toLowerCase() === account.toLowerCase()))
            throw new Error('Seed sender is outside accounts 2–9.');
        return createWalletClient({ account, chain, transport: http(url, { retryCount: 0 }) });
    };
    async function receiptFor(hash) {
        const deadline = Date.now() + 120000;
        while (Date.now() < deadline) {
            try {
                return await client.getTransactionReceipt({ hash });
            }
            catch (error) {
                if (error.name !== 'TransactionReceiptNotFoundError')
                    throw error;
            }
            await delay(100);
        }
        throw new Error('Receipt is still pending. Rerun to recover this transaction from the ledger.');
    }
    // Save the nonce BEFORE broadcasting. On interruption recover the exact transaction, never send a duplicate.
    async function transaction(key, account, request) {
        let saved = ledger.transactions[key];
        if (saved?.hash) {
            const receipt = await receiptFor(saved.hash);
            if (receipt.status !== 'success')
                throw new Error(`Saved transaction reverted: ${key}. Inspect the ledger before retrying.`);
            return receipt;
        }
        if (saved) {
            for (let block = BigInt(saved.startBlock); block <= (await client.getBlockNumber()); block++) {
                const full = await client.getBlock({ blockNumber: block, includeTransactions: true });
                const found = full.transactions.find(tx => tx.from.toLowerCase() === account.toLowerCase() && tx.nonce === saved.nonce);
                if (found) {
                    if (found.to?.toLowerCase() !== request.to?.toLowerCase() || found.input !== request.data)
                        throw new Error(`Nonce was used by another transaction: ${key}. Nothing was replayed.`);
                    saved.hash = found.hash;
                    await saveJson(ledgerFile, ledger);
                    return transaction(key, account, request);
                }
            }
            if (await client.getTransactionCount({ address: account, blockTag: 'pending' }) !== saved.nonce)
                throw new Error(`Unresolved pending nonce for ${key}; wait for its receipt before resuming.`);
        }
        else {
            saved = ledger.transactions[key] = { account, nonce: await client.getTransactionCount({ address: account, blockTag: 'pending' }), startBlock: (await client.getBlockNumber()).toString() };
            await saveJson(ledgerFile, ledger);
        }
        saved.hash = await wallet(account).sendTransaction({ ...request, nonce: saved.nonce });
        await saveJson(ledgerFile, ledger);
        const receipt = await receiptFor(saved.hash);
        if (receipt.status !== 'success')
            throw new Error(`Transaction reverted: ${key}`);
        saved.blockNumber = receipt.blockNumber.toString();
        await saveJson(ledgerFile, ledger);
        return receipt;
    }
    const write = (key, account, address, abi, functionName, values = []) => transaction(key, account, { to: address, data: encodeFunctionData({ abi, functionName, args: values }) });
    async function deploy(key, name, values = []) {
        const { abi, bytecode } = await artifact(name);
        return transaction(key, actors[0], { data: encodeDeployData({ abi, bytecode: bytecode.object, args: values }) });
    }
    const factoryAbi = (await artifact('OptionMarketV4')).abi, optionAbi = (await artifact('OptionV4')).abi;
    const faucetAbi = [{ type: 'function', name: 'faucet', stateMutability: 'nonpayable', inputs: [], outputs: [] }];
    const previousMarkets = [manifest, ...(manifest.markets ?? [])];
    let quote = manifest.quote;
    if (!quote?.isMock || !quote.address || ((await client.getCode({ address: quote.address }))?.length ?? 0) <= 2) {
        if (args.has('--seed-only'))
            throw new Error('Run deployment first.');
        const r = await deploy('shared:quote', 'MockUSD');
        quote = { address: r.contractAddress, symbol: 'MockUSD', decimals: 6, isMock: true };
    }
    if (!args.has('--seed-only'))
        for (const stock of demoStocks) {
            const existing = previousMarkets.find(m => m.marketId === stock.id && m.underlying?.isMock);
            let token = existing?.underlying;
            if (!token?.address || ((await client.getCode({ address: token.address }))?.length ?? 0) <= 2) {
                const r = await deploy(`${stock.id}:token`, 'MockEquity', [stock.name, stock.symbol]);
                token = { address: r.contractAddress, symbol: stock.symbol, decimals: 18, isMock: true };
            }
            const r = await deploy(`${stock.id}:factory`, 'OptionMarketV4', [token.address, quote.address]);
            const market = { marketId: stock.id, label: `${stock.name} / MockUSD`, sandbox: true, version: 4, legacy: false, tickSize: '10000', factory: r.contractAddress, deploymentBlock: r.blockNumber.toString(), underlying: token, quote };
            const index = ledger.markets.findIndex(m => m.marketId === stock.id);
            if (index < 0)
                ledger.markets.push(market);
            else
                ledger.markets[index] = market;
            await saveJson(ledgerFile, ledger);
            console.log(`Ready V4: ${stock.name} · ${market.factory}`);
        }
    if (ledger.markets.length !== 5)
        throw new Error('Run deployment first.');
    for (const m of ledger.markets)
        if (await client.readContract({ address: m.factory, abi: factoryAbi, functionName: 'version' }) !== 4n)
            throw new Error('V4 deployment mismatch.');
    const legacy = [];
    for (const m of previousMarkets)
        if (m.factory && !ledger.markets.some(n => n.factory.toLowerCase() === m.factory.toLowerCase()) && ((await client.getCode({ address: m.factory }))?.length ?? 0) > 2 && !legacy.some(n => n.factory.toLowerCase() === m.factory.toLowerCase())) {
            legacy.push({ ...m, markets: undefined, marketId: m.legacy ? m.marketId : `${m.marketId ?? 'primary'}-v${m.version ?? 1}`, version: m.version ?? 1, legacy: true });
        }
    const record = { chainId: 31337, name: 'Local Anvil', rpcUrl: url, explorerUrl: '', ...ledger.markets[0], markets: [...ledger.markets.slice(1), ...legacy] };
    await saveJson(manifestFile, record);
    if (!args.has('--no-export')) {
        const browser = await readJson('web/lib/generated/deployments.json');
        browser['31337'] = publicDeployment(record);
        await saveJson('web/lib/generated/deployments.json', browser);
    }
    if (args.has('--deploy-only'))
        process.exit(0);
    for (const [id, token, amount] of [['quote', quote.address, playerQuoteAmount], ...ledger.markets.map(m => [m.marketId, m.underlying.address, playerStockAmount])])
        for (const index of [0, 1]) {
            const key = `player:${index}:${id}`;
            const sameToken = id === 'quote' ? previousLedger?.markets?.[0]?.quote?.address === token : previousLedger?.markets?.some(m => m.marketId === id && m.underlying.address === token);
            if (previousLedger?.genesis === genesis.hash && sameToken && previousLedger.transactions?.[`${key}:grant`]?.hash)
                continue;
            await write(`${key}:mint`, actors[0], token, faucetAbi, 'faucet');
            await write(`${key}:grant`, actors[0], token, erc20Abi, 'transfer', [accounts[index], amount]);
        }
    const ensureFunds = async (key, actor, token, amount) => {
        let n = 0;
        while (await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [actor] }) < amount)
            await write(`${key}:fund:${n++}`, actor, token, faucetAbi, 'faucet');
    };
    const event = (receipt, name) => receipt.logs.map(l => { try {
        return decodeEventLog({ abi: factoryAbi, ...l });
    }
    catch {
        return null;
    } }).find(l => l?.eventName === name);
    for (const market of ledger.markets)
        for (const offer of plans.filter(p => p.id.startsWith(`${market.marketId}-`))) {
            const writer = accounts[offer.writerIndex], buyer = accounts[offer.buyerIndex];
            let entry = ledger.offers[offer.id];
            if (!entry) {
                if (offer.expiry <= (await client.getBlock()).timestamp)
                    throw new Error('Fixture expiration passed. Existing orders were preserved.');
                const token = offer.optionType === 0 ? market.underlying.address : quote.address;
                const collateral = offer.optionType === 0 ? offer.quantity : offer.strikeTotal;
                if (!ledger.transactions[`${offer.id}:create`]) {
                    await ensureFunds(offer.id, writer, token, collateral);
                    await write(`${offer.id}:approve`, writer, token, erc20Abi, 'approve', [market.factory, collateral]);
                }
                const r = await write(`${offer.id}:create`, writer, market.factory, factoryAbi, 'placeOrder', [offer.optionType, Number(offer.strikeTotal / 10000n), offer.expiry, false, Number(offer.premium / 10000n)]);
                const posted = event(r, 'OrderPosted');
                if (!posted)
                    throw new Error('Seed ask unexpectedly crossed.');
                entry = ledger.offers[offer.id] = { address: posted.args.option, orderId: String(posted.args.id), complete: false };
                await saveJson(ledgerFile, ledger);
            }
            if (entry.complete)
                continue;
            const read = fn => client.readContract({ address: entry.address, abi: optionAbi, functionName: fn });
            if (await read('state') === 0 && offer.disposition === 'cancelled')
                await write(`${offer.id}:cancel`, writer, market.factory, factoryAbi, 'cancelOrder', [BigInt(entry.orderId)]);
            if ((await read('state') === 0 || ledger.transactions[`${offer.id}:buy`]) && ['held', 'resale'].includes(offer.disposition) && !entry.acquired) {
                if (!ledger.transactions[`${offer.id}:buy`]) {
                    await ensureFunds(`${offer.id}:buyer`, buyer, quote.address, offer.premium);
                    await write(`${offer.id}:buyer-approve`, buyer, quote.address, erc20Abi, 'approve', [market.factory, offer.premium]);
                }
                const r = await write(`${offer.id}:buy`, buyer, market.factory, factoryAbi, 'placeOrder', [offer.optionType, Number(offer.strikeTotal / 10000n), offer.expiry, true, Number(offer.premium / 10000n)]);
                entry.acquired = event(r, 'OrderExecuted')?.args.option;
                await saveJson(ledgerFile, ledger);
            }
            if (offer.disposition === 'resale' && entry.acquired) {
                const holder = await client.readContract({ address: entry.acquired, abi: optionAbi, functionName: 'buyer' });
                const listing = await client.readContract({ address: entry.acquired, abi: optionAbi, functionName: 'listingNonce' });
                if (holder.toLowerCase() === buyer.toLowerCase() && listing === 1n)
                    await write(`${offer.id}:list`, buyer, market.factory, factoryAbi, 'placeResale', [entry.acquired, Number(offer.premium / 10000n * 115n / 100n)]);
            }
            entry.complete = true;
            await saveJson(ledgerFile, ledger);
            if (Object.keys(ledger.offers).length % 26 === 0)
                console.log(`Seeded ${Object.keys(ledger.offers).length}/${plans.length} V4 asks.`);
        }
    for (const market of ledger.markets)
        for (const r of requests.filter(r => r.id.startsWith(`${market.marketId}-`))) {
            if (ledger.requests[r.id])
                continue;
            const buyer = accounts[r.buyerIndex];
            if (!ledger.transactions[`${r.id}:create`]) {
                await ensureFunds(r.id, buyer, quote.address, r.premium);
                await write(`${r.id}:approve`, buyer, quote.address, erc20Abi, 'approve', [market.factory, r.premium]);
            }
            const receipt = await write(`${r.id}:create`, buyer, market.factory, factoryAbi, 'placeOrder', [r.optionType, Number(r.strikeTotal / 10000n), r.expiry, true, Number(r.premium / 10000n)]);
            const posted = event(receipt, 'OrderPosted');
            if (!posted)
                throw new Error('Seed bid unexpectedly crossed.');
            ledger.requests[r.id] = { marketId: market.marketId, requestId: String(posted.args.id), buyer };
            await saveJson(ledgerFile, ledger);
        }
    console.log(`V4 ready: ${plans.length} ask fixtures and ${requests.length} bids. Player wallets and previous trades preserved.`);
}
catch (error) {
    reportError(error);
}
