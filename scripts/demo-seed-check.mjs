// Isolated integration checks for player grants, NPC fixtures, conservation and safe reruns.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPublicClient, http, erc20Abi, encodeFunctionData } from 'viem';
import { root, artifact } from './config.mjs';
import { dockerInvocation } from './foundry.mjs';
import { playerStockAmount, playerQuoteAmount } from './demo-config.mjs';

const directory = await mkdtemp(join(root, '.qa-tmp-demo-'));
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const invocation = dockerInvocation('anvil', [String(port)]);
// Automated checks do not retain Anvil's account credentials in logs.
invocation.args.splice(invocation.args.indexOf('--entrypoint'), 0, '--log-driver', 'none');
invocation.args.push('--silent');
const anvil = spawn(invocation.command, invocation.args, { stdio: 'ignore' });
const stopped = new Promise((resolve, reject) => { anvil.once('exit', resolve); anvil.once('error', reject); });
stopped.catch(() => {});
const env = { ...process.env, ANVIL_RPC_URL: `http://127.0.0.1:${port}`, DEMO_MANIFEST: join(directory, 'manifest.json'), DEMO_LEDGER: join(directory, 'ledger.json') };
const client = createPublicClient({ transport: http(env.ANVIL_RPC_URL), pollingInterval: 25, cacheTime: 0 });
const cleanup = () => spawnSync('docker', ['rm', '-f', invocation.name], { stdio: 'ignore', timeout: 10_000 });
process.once('SIGINT', () => { cleanup(); process.exit(130); });
process.once('SIGTERM', () => { cleanup(); process.exit(143); });
async function run(label, file, args = []) {
  const log = createWriteStream(join(directory, `${label}.log`));
  const child = spawn(process.execPath, [file, ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  log.end();
  assert.equal(code, 0, `${label} failed; see ${directory}/${label}.log`);
}
const read = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args });
const balance = (token, account) => read(token, erc20Abi, 'balanceOf', [account]);
async function send(from, to, abi, functionName, args, status = 'success') {
  const hash = await client.request({ method: 'eth_sendTransaction', params: [{ from, to, gas: '0x989680', data: encodeFunctionData({ abi, functionName, args }) }] });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, status);
  return receipt;
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (anvil.exitCode !== null) throw new Error('Docker Anvil failed to start.');
    try { ready = await client.getChainId() === 31337; if (ready) break; } catch { /* Own node only. */ }
    await delay(100);
  }
  assert(ready);
  const accounts = await client.request({ method: 'eth_accounts' });
  const playerNonces = await Promise.all(accounts.slice(0, 2).map(address => client.getTransactionCount({ address })));
  console.log('Seeding isolated market with accounts 0–1 reserved for players.');
  await run('seed', 'scripts/demo-local.mjs', ['--no-export']);
  const manifest = JSON.parse(await readFile(env.DEMO_MANIFEST, 'utf8'));
  const markets = [manifest, ...manifest.markets];
  const factoryAbi = (await artifact('OptionFactory')).abi, optionAbi = (await artifact('Option')).abi;
  let optionCount = 0, requestCount = 0;
  for (const m of markets) {
    const count = Number(await read(m.factory, factoryAbi, 'optionCount'));
    const requests = Number(await read(m.factory, factoryAbi, 'requestCount'));
    assert.equal(count, 78); assert.equal(requests, 30);
    optionCount += count; requestCount += requests;
    const options = await Promise.all(Array.from({ length: count }, (_, i) => read(m.factory, factoryAbi, 'options', [BigInt(i)])));
    for (const address of options) {
      const [writer, buyer] = await Promise.all(['writer', 'buyer'].map(fn => read(address, optionAbi, fn)));
      for (const player of accounts.slice(0, 2)) { assert.notEqual(writer.toLowerCase(), player.toLowerCase()); assert.notEqual(buyer.toLowerCase(), player.toLowerCase()); }
    }
    let reserved = 0n;
    for (let id = 0; id < requests; id++) {
      const r = await read(m.factory, factoryAbi, 'getRequest', [BigInt(id)]);
      assert.equal(r.state, 0); assert(r.acceptUntil < r.expiry); assert.equal(r.underlyingAmount % (10n ** 17n), 0n);
      assert(accounts.slice(2).some(a => a.toLowerCase() === r.buyer.toLowerCase()));
      reserved += r.premium;
    }
    assert.equal(await read(m.factory, factoryAbi, 'reservedPremium'), reserved);
    assert.equal(await balance(m.quote.address, m.factory), reserved);
    for (const address of accounts.slice(0, 2)) {
      assert.equal(await balance(m.underlying.address, address), playerStockAmount);
      assert.equal(await balance(m.quote.address, address), playerQuoteAmount);
      assert.equal(await read(m.underlying.address, erc20Abi, 'allowance', [address, m.factory]), 0n);
    }
  }
  assert.deepEqual(await Promise.all(accounts.slice(0, 2).map(address => client.getTransactionCount({ address }))), playerNonces);
  async function conserved() {
    const holders = new Set(accounts);
    for (const m of markets) {
      holders.add(m.factory);
      const count = Number(await read(m.factory, factoryAbi, 'optionCount'));
      for (let id = 0; id < count; id++) holders.add(await read(m.factory, factoryAbi, 'options', [BigInt(id)]));
    }
    for (const token of new Set([manifest.quote.address, ...markets.map(m => m.underlying.address)])) {
      const balances = await Promise.all([...holders].map(holder => balance(token, holder)));
      assert.equal(balances.reduce((a, b) => a + b, 0n), await read(token, erc20Abi, 'totalSupply'));
    }
  }
  await conserved();
  console.log('PASS: 390 NPC options, 150 funded requests; players hold tokens only; token supply conserved.');
  const m = manifest;
  const before = async () => ({ request: await read(m.factory, factoryAbi, 'getRequest', [0n]), reserved: await read(m.factory, factoryAbi, 'reservedPremium'), count: await read(m.factory, factoryAbi, 'optionCount'), balances: await Promise.all([accounts[0], m.factory].flatMap(a => [m.underlying.address, m.quote.address].map(t => balance(t, a)))) });
  const original = await before();
  await send(accounts[0], m.factory, factoryAbi, 'acceptRequest', [0n], 'reverted');
  assert.deepEqual(await before(), original, 'Failed acceptance without allowance must roll back collateral, premium and option creation.');
  const r = original.request;
  const token = r.optionType === 0 ? m.underlying.address : m.quote.address;
  await send(accounts[0], token, erc20Abi, 'approve', [m.factory, r.optionType === 0 ? r.underlyingAmount : r.strikeTotal]);
  await send(accounts[0], m.factory, factoryAbi, 'acceptRequest', [0n]);
  const accepted = await read(m.factory, factoryAbi, 'getRequest', [0n]);
  assert.equal(accepted.state, 1);
  assert.equal((await read(accepted.option, optionAbi, 'writer')).toLowerCase(), accounts[0].toLowerCase());
  const other = await read(m.factory, factoryAbi, 'getRequest', [1n]);
  await send(other.buyer, m.factory, factoryAbi, 'cancelRequest', [1n]);
  const checkpoint = await before(), block = await client.getBlockNumber();
  await run('resume', 'scripts/demo-resume-check.mjs');
  assert.equal(await client.getBlockNumber(), block, 'Reruns and interrupted-record recovery must send zero transactions.');
  assert.deepEqual(await before(), checkpoint, 'Reruns must preserve player balances and the accepted request.');
  assert.equal((await read(m.factory, factoryAbi, 'getRequest', [1n])).state, 2);
  await conserved();
  console.log('PASS: rollback, manual acceptance, cancellation and recovery/rerun preservation.');
  await writeFile(join(directory, 'summary.json'), JSON.stringify({ result: 'passed', publicTransactions: false, optionCount, requestCount, playerStock: '100 each', playerMockUSD: '10000 each' }, null, 2));
  console.log(`Evidence: ${directory}`);
} finally { cleanup(); await stopped; }
