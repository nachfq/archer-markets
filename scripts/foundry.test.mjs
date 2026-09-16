import assert from 'node:assert/strict';
import test from 'node:test';
import { dockerInvocation, foundryImage } from './foundry.mjs';

test('Anvil runs attached on loopback without host mounts', () => {
  const { command, args } = dockerInvocation('anvil', ['18545'], { name: 'owned-test', env: { DEPLOYER_PRIVATE_KEY: 'not-a-real-key' } });
  assert.equal(command, 'docker');
  assert(args.includes('127.0.0.1:18545:8545'));
  assert(args.includes('--rm'));
  assert(!args.includes('--silent'));
  assert(!args.includes('--detach'));
  assert(!args.includes('-d'));
  assert.equal(args[args.indexOf('--entrypoint') + 1], 'anvil');
  assert(!args.includes('--mount'));
  assert(!args.includes('--env'));
  assert(!args.includes('--network=host'));
  assert(args.includes(foundryImage));
  assert.equal(args[args.indexOf('--chain-id') + 1], '31337');
});

test('invalid ports and unsupported host tools fail before starting Docker', () => {
  for (const port of ['0', '80', '65536', '8545:8545', '8545; echo unsafe', '']) assert.throws(() => dockerInvocation('anvil', [port]));
  assert.throws(() => dockerInvocation('anvil', ['8545', '--host=0.0.0.0']));
  assert.throws(() => dockerInvocation('sh', []));
});

test('Forge receives only contract files and an explicit RPC environment allowlist', () => {
  const secret = 'https://provider.invalid/private-token';
  const { args } = dockerInvocation('forge', ['test'], { env: { RH_RPC_URL: secret, DEPLOYER_PRIVATE_KEY: 'not-a-real-key' } });
  const mount = args[args.indexOf('--mount') + 1];
  assert(mount.endsWith('/contracts,target=/workspace'));
  assert(!args.includes(secret));
  assert(!args.includes('DEPLOYER_PRIVATE_KEY'));
  assert(!args.includes('--env-file'));
  assert(args.includes('RH_RPC_URL'));
  assert(args.includes('HOME=/tmp'));
  assert(args.includes('--user'));
});
