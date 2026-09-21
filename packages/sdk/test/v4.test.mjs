import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceTicks, v4Tick, feeForV4, decodeProtocolError, getMarkets, optionMarketV4Abi } from '../dist/index.js';
import { encodeErrorResult } from 'viem';
test('V4 cent ticks preserve integer prices at each supported precision',()=>{
  for(let d=2;d<=18;d++) {
    assert.equal(priceTicks(v4Tick(d),d),1);
    assert.equal(priceTicks(0xffffffffn*v4Tick(d),d),0xffffffff);
    for(const p of [0n,-1n,0x100000000n*v4Tick(d)]) assert.throws(()=>priceTicks(p,d));
    if(d>2) assert.throws(()=>priceTicks(v4Tick(d)+1n,d));
  }
  for(const d of [0,1,19,1.5]) assert.throws(()=>v4Tick(d));
});
test('V4 self trade and stale order reverts are actionable',()=>{
  for(const name of ['SelfTrade','OrderUnavailable']) {
    const e=decodeProtocolError({data:encodeErrorResult({abi:optionMarketV4Abi,errorName:name})});
    assert.equal(e.code,name==='SelfTrade'?'UNAUTHORIZED':'UNAVAILABLE');
  }
});
test('V4 fee uses exact integer quote units',()=>{
  const market={baseFee:10_000n,feeBps:10};
  assert.equal(feeForV4(market,9_000_000n),19_000n);
  assert.equal(feeForV4(market,1n),10_000n);
});
test('V4 trade snapshots use one aggregate book read and preserve quoted size', async()=>{
  const address=n=>`0x${n.toString(16).padStart(40,'0')}`;
  const stock={address:address(1),symbol:'STOCK',decimals:18,isMock:true};
  const usd={address:address(2),symbol:'USD',decimals:6,isMock:true};
  const market={id:'v4',chainId:31337,factory:address(3),deploymentBlock:1n,version:4,feeRecipient:address(4),baseFee:10_000n,feeBps:10,underlying:stock,quote:usd,sandbox:true};
  const calls=[];
  const client={
    getChainId:async()=>{calls.push('chainId');return 31337;},
    getCode:async()=>{calls.push('code');return '0x01';},
    getBlock:async()=>{calls.push('block');return {number:10n,hash:`0x${'a'.repeat(64)}`,timestamp:50n};},
    readContract:async({address:target,functionName})=>{
      calls.push(functionName);
      if(functionName==='underlying')return stock.address;
      if(functionName==='quote')return usd.address;
      if(functionName==='feeRecipient')return market.feeRecipient;
      if(functionName==='baseFee')return market.baseFee;
      if(functionName==='feeBps')return market.feeBps;
      if(functionName==='decimals')return target===stock.address?18:6;
      if(functionName==='version')return 4n;
      if(functionName==='getBookPage')return [{
        key:`0x${'b'.repeat(64)}`,terms:{kind:0,strike:30000,expiry:100n},
        bid:{price:900,count:3n,firstOrder:7n,owner:address(7),writer:address(0),option:address(0),resale:false},
        ask:{price:1000,count:2n,firstOrder:8n,owner:address(8),writer:address(8),option:address(9),resale:false},
      }];
      throw new Error(`Unexpected ${functionName}`);
    },
  };
  const [snapshot]=await getMarkets(client,[market]);
  assert.equal(snapshot.bids[0].bookSize,3n);
  assert.equal(snapshot.positions[0].bookSize,2n);
  assert.equal(snapshot.positions[0].premium,10_000_000n);
  assert.equal(calls.filter(name=>name==='getBookPage').length,1);
  assert(!calls.some(name=>['getOrder','getLevelOrders','optionCount','registeredOption'].includes(name)));
  const before=calls.length;
  await getMarkets(client,[market]);
  assert.deepEqual(calls.slice(before),['chainId','block','getBookPage']);
});
