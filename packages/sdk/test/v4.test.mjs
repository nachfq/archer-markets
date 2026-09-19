import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceTicks, v4Tick, decodeProtocolError, optionMarketV4Abi } from '../dist/index.js';
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
