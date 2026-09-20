import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeErrorResult } from 'viem';
import { parseAmount, quoteTotal, maximumQuantity, summarizePortfolio, getMarkets, getPortfolio, prepareCreateOffer, prepareBuy, prepareBuyResale, prepareListResale, decodeProtocolError, ProtocolError, optionAbi } from '../dist/index.js';
const addr = n => `0x${n.toString(16).padStart(40, '0')}`;
const writer = addr(1), buyer = addr(2);
const stock = { address: addr(3), symbol: 'STOCK', decimals: 18, isMock: true };
const usd = { address: addr(4), symbol: 'USD', decimals: 6, isMock: true };
const market = { id: 'one', chainId: 31337, factory: addr(5), deploymentBlock: 1n, version: 1, underlying: stock, quote: usd, sandbox: true };
const option = (n, overrides = {}) => ({ address: addr(100+n), writer, buyer, underlyingAmount: 2n, strikeTotal: 7n, premium: 1n, expiry: 100n, optionType: 0, state: 0, ...overrides });
const snapshot = (positions, m = market) => ({ market: m, positions, timestamp: 50n, blockNumber: 10n, blockHash: `0x${'a'.repeat(64)}`, total: BigInt(positions.length) });
test('per-token prices preserve exact fractional lots and reject sub-unit totals', () => {
  assert.equal(quoteTotal(parseAmount('0.01',18),parseAmount('300',6),18),3000000n);
  assert.equal(quoteTotal(parseAmount('1.25',18),parseAmount('249.876544',6),18),312345680n);
  assert.throws(()=>quoteTotal(1n,1n,18), { code: 'INVALID_TERMS' });
  assert.throws(()=>parseAmount('0.0000001',6));
  assert.throws(()=>quoteTotal(2n**256n-1n,2n,0));
  assert.equal(parseAmount('9007199254740993.000001',6),9007199254740993000001n);
});
test('Max put quantity fits collateral and produces an exactly representable total', () => {
  for (const price of [3n,300000001n,10n**6n]) {
    const q=maximumQuantity(10000000n,1,price,18);
    if (q > 0n) assert(quoteTotal(q,price,18)<=10000000n);
    else assert.equal(price,300000001n);
  }
  assert.equal(maximumQuantity(123n,0,0n,18),123n);
});
test('portfolio separates writer obligations, expired collateral and purchased rights', () => {
  const positions=[option(1),option(2,{state:1}),option(3,{expiry:50n}),option(4,{state:2}),option(5,{state:3}),option(6,{state:4}),option(7,{writer:buyer,buyer:writer,state:1}),option(8,{optionType:1})];
  const rows=summarizePortfolio([snapshot(positions)],writer,new Map([[`31337:${stock.address}`,11n],[`31337:${usd.address}`,19n]]));
  assert.deepEqual(rows[0],{token:stock,available:11n,requestPremium:0n,refundablePremium:0n,openCollateral:2n,activeCollateral:2n,reclaimable:2n,totalTracked:17n});
  assert.equal(rows[1].openCollateral,7n); assert.equal(rows[1].totalTracked,26n);
});
test('shared tokens and duplicate market entries are never counted twice', () => {
  const second={...market,id:'two',factory:addr(9),underlying:{...stock,address:addr(8)}};
  const first=snapshot([option(1,{optionType:1})]);
  const rows=summarizePortfolio([first,snapshot([option(2,{optionType:1})],second),first],writer,new Map([[`31337:${stock.address}`,0n],[`31337:${second.underlying.address}`,0n],[`31337:${usd.address}`,20n]]));
  assert.equal(rows.length,3); assert.equal(rows.find(r=>r.token.address===usd.address).totalTracked,34n);
  assert.throws(()=>summarizePortfolio([first],writer,new Map()),/Incomplete/);
});
function fakeClient(positions, balances = { stock: 10000000000000000000n, usd: 1000000000n }, allowance = 0n) {
  const reads=[]; let simulations=0;
  const client={
    getChainId:async()=>31337,
    getCode:async()=> '0x01',
    getBlock:async()=>({number:10n,hash:`0x${'a'.repeat(64)}`,timestamp:50n}),
    getBalance:async()=>1000000000000000000n,
    getGasPrice:async()=>1n,
    estimateGas:async()=>21000n,
    call:async()=>{ simulations++; return {}; },
    readContract:async ({address,functionName,args,blockNumber})=>{
      reads.push({functionName,blockNumber});
      if(functionName==='underlying')return stock.address;
      if(functionName==='quote')return usd.address;
      if(functionName==='decimals')return address===stock.address?18:6;
      if(functionName==='optionCount')return BigInt(positions.length);
      if(functionName==='options')return positions[Number(args[0])].address;
      if(functionName==='balanceOf')return address===stock.address?balances.stock:balances.usd;
      if(functionName==='allowance')return allowance;
      const position=positions.find(p=>p.address===address);
      if(!position)throw new Error('Unknown contract');
      return position[functionName];
    }
  };
  return {client,reads,simulations:()=>simulations};
}
test('registry includes older positions beyond 100 and all financial reads use one block', async()=>{
  const positions=Array.from({length:137},(_,i)=>option(i,{writer:i===0?writer:buyer}));
  const {client,reads}=fakeClient(positions);
  const data=await getMarkets(client,[market]);
  assert.equal(data[0].positions.length,137);
  const portfolio=await getPortfolio(client,[market],writer,data);
  assert.equal(portfolio.tokens[0].openCollateral,2n);
  assert.equal(portfolio.complete,true);
  for(const r of reads.filter(r=>['options','state','balanceOf','optionCount'].includes(r.functionName))) assert.equal(r.blockNumber,10n);
});
test('failed position reads cannot return a misleading complete total',async()=>{
  const {client}=fakeClient([option(0)]); const original=client.readContract;
  client.readContract=async r=>{if(r.functionName==='state')throw new Error('RPC unavailable');return original(r);};
  await assert.rejects(()=>getPortfolio(client,[market],writer),/RPC unavailable/);
});
test('create checks funds before requesting approval; approval is a separate required step',async()=>{
  const poor=fakeClient([],{stock:1n,usd:0n});
  await assert.rejects(()=>prepareCreateOffer(poor.client,market,writer,{optionType:0,quantity:2n,strikeTotal:2n,premium:1n,expiry:100n}),{code:'INSUFFICIENT_BALANCE'});
  const rich=fakeClient([]);
  const op=await prepareCreateOffer(rich.client,market,writer,{optionType:0,quantity:2n,strikeTotal:2n,premium:1n,expiry:100n});
  assert.equal(op.approval.amount,2n);assert.equal(op.approval.spender,market.factory);assert.equal(rich.simulations(),0);
});
test('wrong RPC and buying own option fail before signature',async()=>{
  const {client}=fakeClient([option(0)]);
  await assert.rejects(()=>prepareBuy(client,market,writer,addr(100)),{code:'UNAUTHORIZED'});
  client.getChainId=async()=>1;
  await assert.rejects(()=>getMarkets(client,[market]),{code:'WRONG_NETWORK'});
});
test('nested revert bytes, wallet rejection and unavailable diagnostics are distinguished',()=>{
  const data=encodeErrorResult({abi:optionAbi,errorName:'OptionExpired'});
  assert.equal(decodeProtocolError({cause:{data}}).code,'EXPIRED');
  assert.equal(decodeProtocolError({cause:{code:4001}}).code,'WALLET_REJECTED');
  const pending=new ProtocolError('PENDING','Pending','Check receipt');
  assert.equal(decodeProtocolError(pending),pending);
  assert.equal(decodeProtocolError(new Error('opaque RPC')).details.technical,'opaque RPC');
});
test('legacy markets default to V1, never read resale fields and refuse resale preparation', async () => {
  const { client, reads } = fakeClient([option(0)]);
  await getMarkets(client, [{ ...market, version: undefined }]);
  assert(!reads.some(r => ['version', 'resalePrice', 'listingNonce'].includes(r.functionName)));
  await assert.rejects(() => prepareListResale(client, market, buyer, addr(100), 2n), { code: 'UNAVAILABLE' });
  await assert.rejects(() => prepareBuyResale(client, market, buyer, addr(100), { seller: writer, price: 2n, nonce: 1n }), { code: 'UNAVAILABLE' });
});
test('cached terms never cache mutable ownership, state or resale quotes', async () => {
  const positions = [option(0, { state: 1, resalePrice: 2n, listingNonce: 1n })];
  const { client, reads } = fakeClient(positions);
  const read = client.readContract;
  client.readContract = async r => r.functionName === 'version' ? 2n : read(r);
  client.getLogs = async () => [];
  await getMarkets(client, [{ ...market, version: 2 }]);
  const fixedReads = reads.filter(r => r.functionName === 'strikeTotal').length;
  positions[0].buyer = addr(7); positions[0].resalePrice = 4n; positions[0].listingNonce = 3n;
  const [snapshot] = await getMarkets(client, [{ ...market, version: 2 }]);
  assert.equal(snapshot.positions[0].buyer, addr(7));
  assert.equal(snapshot.positions[0].resalePrice, 4n);
  assert.equal(snapshot.positions[0].listingNonce, 3n);
  assert.equal(reads.filter(r => r.functionName === 'strikeTotal').length, fixedReads);
  client.getBlock = async () => ({ number: 10n, hash: `0x${'b'.repeat(64)}`, timestamp: 50n });
  positions[0].strikeTotal = 20n;
  assert.equal((await getMarkets(client, [{ ...market, version: 2 }]))[0].positions[0].strikeTotal, 20n, 'A reorg invalidates cached immutable terms');
});

test('V3 lots reject fractional lots while preserving exact 0.1-token multiples', async () => {
  const { validateLotQuantity } = await import('../dist/index.js');
  for (const quantity of ['0.1', '1.2', '10']) validateLotQuantity(parseAmount(quantity, 18), 18);
  for (const quantity of ['0.01', '0.15', '1.25']) assert.throws(() => validateLotQuantity(parseAmount(quantity, 18), 18), { code: 'INVALID_TERMS' });
  assert.throws(() => validateLotQuantity(0n, 18));
  assert.throws(() => validateLotQuantity(1n, 0));
});

test('request premiums are counted once across markets and never become writer collateral', () => {
  const request = { id: 0n, buyer: writer, optionType: 0, underlyingAmount: 100n, strikeTotal: 200n, premium: 7n, expiry: 100n, acceptUntil: 75n, state: 0, option: addr(0) };
  const first = { ...snapshot([]), requests: [request, { ...request, id: 1n, premium: 5n, acceptUntil: 50n }, { ...request, id: 2n, state: 1 }, { ...request, id: 3n, state: 2 }, { ...request, id: 4n, buyer }] };
  const second = { ...snapshot([], { ...market, id: 'two', factory: addr(9) }), requests: [request] };
  const rows = summarizePortfolio([first, first, second], writer, new Map([[`31337:${stock.address}`, 11n], [`31337:${usd.address}`, 19n]]));
  const row = rows.find(r => r.token.address === usd.address);
  assert.equal(row.requestPremium, 14n);
  assert.equal(row.refundablePremium, 5n);
  assert.equal(row.openCollateral, 0n);
  assert.equal(row.totalTracked, 38n);
});

function requestClient(request, allowance = 0n) {
  const fake = fakeClient([], undefined, allowance), original = fake.client.readContract;
  fake.client.readContract = async args => {
    if (args.functionName === 'version') return 3n;
    if (args.functionName === 'requestCount') return 1n;
    if (args.functionName === 'getRequest') { fake.reads.push({functionName: args.functionName, blockNumber: args.blockNumber}); return request; }
    return original(args);
  };
  return fake;
}
const requestTerms = { optionType: 0, quantity: 10n ** 17n, strikeTotal: 30_000000n, premium: 1_000000n, expiry: 100n, acceptUntil: 75n };
const requestRecord = { ...requestTerms, underlyingAmount: requestTerms.quantity, buyer, state: 0, option: addr(0) };

test('V3 SDK prepares exact premium and collateral approvals with distinct requester and writer', async () => {
  const { prepareCreateRequest, prepareAcceptRequest, prepareCancelRequest } = await import('../dist/index.js');
  const m = { ...market, version: 3 }, {client} = requestClient(requestRecord);
  const create = await prepareCreateRequest(client, m, buyer, requestTerms);
  assert.equal(create.approval.token.address, usd.address);
  assert.equal(create.approval.amount, requestTerms.premium);
  assert.equal(create.approval.spender, m.factory);
  const accept = await prepareAcceptRequest(client, m, writer, 0n);
  assert.equal(accept.approval.token.address, stock.address);
  assert.equal(accept.approval.amount, requestTerms.quantity);
  const cancel = await prepareCancelRequest(client, m, buyer, 0n);
  assert.equal(cancel.approval, undefined);
  await assert.rejects(prepareAcceptRequest(client, m, buyer, 0n), {code: 'UNAUTHORIZED'});
  await assert.rejects(prepareCancelRequest(client, m, writer, 0n), {code: 'UNAUTHORIZED'});
  await assert.rejects(prepareCreateRequest(client, market, buyer, requestTerms), {code: 'UNAVAILABLE'});
  await assert.rejects(prepareCreateRequest(client, m, buyer, {...requestTerms, acceptUntil: 100n}), {code: 'INVALID_TERMS'});
});

test('request registry uses the portfolio snapshot block; expired requests permit only refunds', async () => {
  const { prepareAcceptRequest, prepareCancelRequest } = await import('../dist/index.js');
  const m = { ...market, version: 3 }, {client, reads} = requestClient({...requestRecord, acceptUntil: 50n});
  const snapshots = await getMarkets(client, [m]);
  assert.equal(snapshots[0].requests.length, 1);
  assert.equal(reads.find(r => r.functionName === 'getRequest').blockNumber, 10n);
  const portfolio = await getPortfolio(client, [m], buyer, snapshots);
  assert.equal(portfolio.requests.length, 1);
  assert.equal(portfolio.tokens.find(t => t.token.address === usd.address).refundablePremium, requestTerms.premium);
  await assert.rejects(prepareAcceptRequest(client, m, writer, 0n), {code: 'EXPIRED'});
  await prepareCancelRequest(client, m, buyer, 0n);
});

test('invalid deployment code, pair, decimals and version never prepare an approval', async () => {
  for (const invalid of ['code', 'underlying', 'quote', 'decimals', 'version']) {
    const { client, reads } = fakeClient([]);
    const read = client.readContract;
    client.readContract = async r => {
      if (r.functionName === 'version') return invalid === 'version' ? 2n : 3n;
      if (r.functionName === invalid) return invalid === 'decimals' ? 5 : addr(999);
      return read(r);
    };
    if (invalid === 'code') client.getCode = async () => '0x';
    await assert.rejects(() => prepareCreateOffer(client, { ...market, version: 3 }, writer,
      { optionType: 0, quantity: 10n ** 17n, strikeTotal: 2n, premium: 1n, expiry: 100n }), { code: 'UNAVAILABLE' });
    assert.equal(reads.some(r => r.functionName === 'allowance'), false, invalid);
  }
});

test('an option outside the authenticated factory registry cannot request token approval', async () => {
  const { client, reads } = fakeClient([option(0)]);
  await assert.rejects(() => prepareBuy(client, market, buyer, addr(999)), { code: 'UNAVAILABLE' });
  assert.equal(reads.some(r => r.functionName === 'allowance'), false);
});
