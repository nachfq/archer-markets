import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { clients, network, publicDeployment } from './config.mjs';

test('deployment tooling rejects unsupported networks including mainnet', () => {
  for (const mode of ['mainnet', '4663', '', undefined]) assert.throws(() => network(mode), /Mainnet is not supported/);
});

test('an endpoint returning mainnet is rejected before obtaining a signing account', async () => {
  const calls = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    calls.push(request.method);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: '0x1237' })); // 4663
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const saved = process.env.RH_RPC_URL;
  process.env.RH_RPC_URL = `http://127.0.0.1:${server.address().port}`;
  try {
    await assert.rejects(clients('testnet'), /Wrong RPC network: expected 46630, received 4663/);
    assert.deepEqual(calls, ['eth_chainId']);
  } finally {
    if (saved === undefined) delete process.env.RH_RPC_URL;
    else process.env.RH_RPC_URL = saved;
    await new Promise(resolve => server.close(resolve));
  }
});

test('browser manifests cannot accidentally include private provider URLs or signing fields', () => {
  const result = publicDeployment({ chainId: 46630, name: 'testnet', explorerUrl: '', underlying: { address: 'public' }, quote: { address: 'public' }, factory: 'public', deploymentBlock: '5', rpcUrl: 'https://private-provider.invalid/secret', account: { privateKey: 'sensitive' }, receipts: [] });
  assert.equal(result.rpcUrl, 'https://rpc.testnet.chain.robinhood.com');
  assert.equal('account' in result, false);
  assert.equal('receipts' in result, false);
  assert.doesNotMatch(JSON.stringify(result), /secret|sensitive/);
});


test('additional markets preserve identity and exclude private deployment fields', () => {
  const result = publicDeployment({ chainId: 46630, markets: [{ marketId: 'practice', label: 'Practice', sandbox: true, factory: 'public', deploymentBlock: '12', underlying: { address: 'public-stock' }, quote: { address: 'public-quote' }, rpcUrl: 'https://private.invalid/secret', signing: 'sensitive' }] });
  assert.equal(result.markets[0].marketId, 'practice');
  assert.equal(result.markets[0].sandbox, true);
  assert.doesNotMatch(JSON.stringify(result), /secret|sensitive/);
});
