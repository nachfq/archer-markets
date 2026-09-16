// Standalone SDK consumer. Uses only package exports, viem, and a public manifest.
// Public Anvil fixtures are strictly confined to a verified local Anvil node.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, defineChain, http, erc20Abi, parseAbi, parseEventLogs } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { getPortfolio, prepareCreateOffer, prepareBuy, prepareExercise, prepareCancel, prepareReclaim, simulatePrepared, optionFactoryAbi, optionAbi } from '@stock-options-lab/sdk';
const record=JSON.parse(await readFile(process.argv[2], 'utf8'));
assert.equal(record.chainId,31337);
assert(['localhost','127.0.0.1'].includes(new URL(record.rpcUrl).hostname));
const chain=defineChain({id:31337,name:'Local Anvil',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[record.rpcUrl]}}});
const client=createPublicClient({chain,transport:http(record.rpcUrl),cacheTime:0,pollingInterval:25});
assert.equal(await client.getChainId(),31337);
assert.match(await client.request({method:'web3_clientVersion'}),/anvil/i);
const account=i=>mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex:i});
const writer=account(2),buyer=account(3);
const wallet=account=>createWalletClient({chain,account,transport:http(record.rpcUrl)});
const market={id:'primary',chainId:31337,factory:record.factory,deploymentBlock:BigInt(record.deploymentBlock),version:record.version ?? 1,underlying:record.underlying,quote:record.quote,sandbox:true};
async function mined(hash){const result=await client.waitForTransactionReceipt({hash});assert.equal(result.status,'success');return result;}
for(const person of [writer,buyer]) for(const token of [market.underlying,market.quote]) await mined(await wallet(person).writeContract({address:token.address,abi:parseAbi(['function faucet()']),functionName:'faucet'}));
async function execute(person,operation){
  if(operation.approval){const {token,amount,spender}=operation.approval;await mined(await wallet(person).writeContract({address:token.address,abi:erc20Abi,functionName:'approve',args:[spender,amount]}));}
  await simulatePrepared(client,operation);
  return mined(await wallet(person).sendTransaction(operation.request));
}
async function create(kind,expiry){
  const result=await execute(writer,await prepareCreateOffer(client,market,writer.address,{optionType:kind,quantity:100000000000000000n,strikeTotal:3000000n,premium:80000n,expiry}));
  return parseEventLogs({abi:optionFactoryAbi,logs:result.logs,eventName:'OptionCreated'})[0].args.option;
}
async function totals(option){
  const values=[];
  for(const token of [market.underlying,market.quote]){
    let total=0n;for(const address of [writer.address,buyer.address,option])total+=await client.readContract({address:token.address,abi:erc20Abi,functionName:'balanceOf',args:[address]});values.push(total);
  }
  return values;
}
for(const kind of [0,1]){
  const option=await create(kind,(await client.getBlock()).timestamp+3600n);
  const before=await totals(option);
  const portfolio=await getPortfolio(client,[market],writer.address);
  assert(portfolio.tokens.some(t=>t.openCollateral>0n));
  await assert.rejects(()=>prepareBuy(client,market,writer.address,option),{code:'UNAUTHORIZED'});
  await execute(buyer,await prepareBuy(client,market,buyer.address,option));
  const active=await getPortfolio(client,[market],writer.address);
  assert(active.tokens.some(t=>t.activeCollateral>0n));
  await execute(buyer,await prepareExercise(client,market,buyer.address,option));
  assert.deepEqual(await totals(option),before);
  assert.equal(await client.readContract({address:option,abi:optionAbi,functionName:'state'}),2);
  console.log(`PASS standalone SDK ${kind===0?'call':'put'}: creation, purchase, exercise and conservation`);
}
const cancel=await create(0,(await client.getBlock()).timestamp+3600n);
const cancelTotal=await totals(cancel);
await execute(writer,await prepareCancel(client,market,writer.address,cancel));
assert.deepEqual(await totals(cancel),cancelTotal);
const expiry=(await client.getBlock()).timestamp+60n;
const expired=await create(1,expiry);
const expireTotal=await totals(expired);
await client.request({method:'evm_setNextBlockTimestamp',params:[Number(expiry)]});await client.request({method:'evm_mine',params:[]});
assert((await getPortfolio(client,[market],writer.address)).tokens.some(t=>t.reclaimable>0n));
await execute(writer,await prepareReclaim(client,market,writer.address,expired));
assert.deepEqual(await totals(expired),expireTotal);
console.log('PASS standalone SDK cancellation and expired collateral recovery. Local transactions only.');
