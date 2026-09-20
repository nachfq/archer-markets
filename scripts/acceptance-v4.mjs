// Own disposable nodes, manifests and browser source. Never reuse a live demo.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { dockerInvocation } from './foundry.mjs';
import { createServer } from 'node:net';
import { cp, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join, basename } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { createPublicClient, http, encodeFunctionData, parseAbi } from 'viem';
import { root, publicDeployment } from './config.mjs';

const directory = await mkdtemp(join(root, '.qa-tmp-e2e-'));
const children = [];

let anvilContainer;
const evidence = { startedAt: new Date().toISOString(), publicTransactions: false, directory, steps: [], result: 'running' };
const serialize = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n';
const env = { ...process.env, EVIDENCE_DIR: directory };
async function port() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const result = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return result;
}
function start(command, args, label, cwd = root) {
  const log = createWriteStream(join(directory, `${label}.log`));
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  child.once('close', () => log.end());
  child.completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${label} exited ${code ?? signal}; see ${directory}/${label}.log`)));
  });
  // Services are checked by readiness and stopped in finally.
  child.completion.catch(() => {});
  children.push(child);
  return child;
}
async function run(command, args, label) {
  console.log(`Running ${label}`);
  await start(command, args, label).completion;
  evidence.steps.push(label);
}
async function ready(url, child, rpc = false) {
  const deadline=Date.now()+120_000;
  while (Date.now()<deadline) {
    if (child.exitCode !== null || child.signalCode) await child.completion;
    try {
      const response = await fetch(url, { ...(rpc ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) } : {}), signal: AbortSignal.timeout(rpc ? 2000 : 30_000) });
      if (response.ok && (!rpc || (await response.json()).result === '0x7a69')) return;
    } catch { /* Wait for this owned service only. */ }
    await setTimeout(500);
  }
  throw new Error(`Service did not become ready: ${url}`);
}
async function stopChildren() {
  if (anvilContainer) spawnSync("docker", ["rm", "-f", anvilContainer], { stdio: "ignore", timeout: 10_000 });
  for (const child of children) if (child.exitCode === null && !child.signalCode) child.kill('SIGTERM');
  // Give Docker wrappers time to remove their owned containers before exiting.
  const timeout = setTimeout(15_000, undefined, { ref: false });
  await Promise.race([Promise.allSettled(children.map(child => child.completion)), timeout]);
}
process.once('SIGTERM', async () => { await stopChildren(); process.exit(143); });
process.once('SIGINT', async () => { await stopChildren(); process.exit(130); });
console.log(`Isolated acceptance evidence: ${directory}`);
try {
  const rpcPort = await port();
  env.ANVIL_RPC_URL = `http://127.0.0.1:${rpcPort}`;
  env.DEMO_MANIFEST = join(directory, 'manifest.json');
  env.DEMO_LEDGER = join(directory, 'ledger.json');
  evidence.rpcUrl = env.ANVIL_RPC_URL;
  const invocation = dockerInvocation('anvil', [String(rpcPort)]);
  invocation.args.splice(invocation.args.indexOf('--entrypoint'), 0, '--log-driver', 'none');
  invocation.args.push('--silent'); // Keep development credentials out of automated evidence.
  anvilContainer = invocation.name;
  const anvil = start(invocation.command, invocation.args, 'anvil');
  await ready(env.ANVIL_RPC_URL, anvil, true);
  await run('node', ['scripts/demo-v4.mjs', '--deploy-only', '--no-export'], 'deploy');
  const client = createPublicClient({ transport: http(env.ANVIL_RPC_URL), cacheTime: 0, pollingInterval: 25 });
  const cleanDeployment = await client.request({ method: 'evm_snapshot' });
  await run('npm', ['run', 'test:e2e'], 'protocol-sdk-v4');
  // Remove test time travel and historical fixtures before browser acceptance.
  // This node belongs exclusively to this runner; no reset is sent to a supplied RPC.
  assert.equal(await client.request({ method: 'evm_revert', params: [cleanDeployment] }), true);
  const manifest = JSON.parse(await readFile(env.DEMO_MANIFEST, 'utf8'));
  const accounts = await client.request({ method: 'eth_accounts' });
  await run('node', ['scripts/fund-local-wallets.mjs', accounts[8], accounts[9]], 'fund-wallets');
  for (const address of [accounts[8], accounts[9]]) assert.equal(await client.getBalance({ address }), 2n * 10n ** 18n);
  const faucet = parseAbi(['function faucet()']);
  const tokens = new Set([manifest.quote.address, manifest.underlying.address, ...manifest.markets.map(m => m.underlying.address)]);
  for (const from of [accounts[1], accounts[6], accounts[7], accounts[8], accounts[9]]) for (const to of tokens) {
    const hash = await client.request({ method: 'eth_sendTransaction', params: [{ from, to, data: encodeFunctionData({ abi: faucet, functionName: 'faucet' }) }] });
    assert.equal((await client.waitForTransactionReceipt({ hash })).status, 'success');
  }
  const web = join(directory, 'web');
  const excluded = new Set(['node_modules', 'dist', '.next', '.wrangler', '.vinext', 'outputs', 'work']);
  await cp(join(root, 'web'), web, { recursive: true, filter: path => !excluded.has(basename(path)) && !basename(path).startsWith('.env') && !path.endsWith('.tsbuildinfo') });
  await mkdir(join(web, 'node_modules'));
  for (const name of await readdir(join(root, 'web/node_modules'))) {
    if (!name.startsWith('.')) await symlink(join(root, 'web/node_modules', name), join(web, 'node_modules', name));
  }
  const records = JSON.parse(await readFile(join(web, 'lib/generated/deployments.json'), 'utf8'));
  records['31337'] = { ...publicDeployment(manifest), rpcUrl: env.ANVIL_RPC_URL };
  await writeFile(join(web, 'lib/generated/deployments.json'), serialize(records));
  env.VITE_CHAIN_ID = '31337';
  env.WRANGLER_LOG_PATH = join(web, '.wrangler/logs');
  const webPort = await port();
  env.BROWSER_BASE_URL = `http://127.0.0.1:${webPort}`;
  evidence.browserUrl = env.BROWSER_BASE_URL;
  let preview = start('node', [join(root, 'web/node_modules/vinext/dist/cli.js'), 'dev', '--hostname', '127.0.0.1', '--port', String(webPort)], 'web', web);
  try { await ready(env.BROWSER_BASE_URL, preview); }
  catch {
    preview.kill('SIGTERM'); await preview.completion.catch(()=>{});
    preview=start('node',[join(root,'web/node_modules/vinext/dist/cli.js'),'dev','--hostname','127.0.0.1','--port',String(webPort)],'web-restart',web);
    await ready(env.BROWSER_BASE_URL,preview);
  }
  await run('node', ['scripts/browser-v4.mjs'], 'browser-v4');
  await run('node', ['scripts/demo-v4.mjs', '--no-export'], 'seed-v4');
  await run('node', ['scripts/seed-check-v4.mjs'], 'seed-check-v4');
  evidence.result = 'passed';
  if(process.env.V4_BROWSER_REVIEW==='1') {
    console.log(`Browser review ready: ${env.BROWSER_BASE_URL}; create ${directory}/review-done to finish.`);
    while(true) {try {await readFile(join(directory,'review-done'));break;} catch(error) {if(error.code!=='ENOENT') throw error;} await setTimeout(1000);}
  }
} catch (error) {
  evidence.result = 'failed'; evidence.error = error.message;
  console.error(error.message); process.exitCode = 1;
} finally {
  await stopChildren();
  evidence.finishedAt = new Date().toISOString();
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'summary.json'), serialize(evidence));
  console.log(`Acceptance ${evidence.result}: ${directory}/summary.json`);
}
