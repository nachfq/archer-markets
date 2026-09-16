// Foundry runs only in disposable Docker containers. No host binary fallback.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const foundryImage = 'ghcr.io/foundry-rs/foundry:v1.3.1@sha256:2dbf3d0fc58593ad9d01ef57677f93f83f4987acd295d17f303448d82e3a3ae7';
const contracts = fileURLToPath(new URL('../contracts', import.meta.url));

export function dockerInvocation(tool, args = [], { name = `archer-foundry-${randomUUID()}`, env = process.env } = {}) {
  const flags = ['run', '--rm', '--init', '--name', name];
  if (tool === 'anvil') {
    const port = args[0] ?? '8545';
    if (args.length > 1 || !/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error('Expected one local port between 1024 and 65535.');
    flags.push('--publish', `127.0.0.1:${port}:8545`);
    args = ['--host', '0.0.0.0', '--port', '8545', '--chain-id', '31337', '--silent'];
  } else if (tool === 'forge') {
    // Mount contract sources/artifacts only: no wallet files or repository .env.
    flags.push('--mount', `type=bind,source=${contracts},target=/workspace`, '--workdir', '/workspace', '--env', 'HOME=/tmp');
    if (process.getuid) flags.push('--user', `${process.getuid()}:${process.getgid()}`);
    if (env.RH_RPC_URL) flags.push('--env', 'RH_RPC_URL');
  } else {
    throw new Error('Expected forge or anvil.');
  }
  return { command: 'docker', args: [...flags, '--entrypoint', tool, foundryImage, ...args], name };
}

export async function runFoundry(tool, args = []) {
  const invocation = dockerInvocation(tool, args);
  const child = spawn(invocation.command, invocation.args, { stdio: 'inherit' });
  const remove = () => spawnSync(invocation.command, ['rm', '--force', invocation.name], { stdio: 'ignore', timeout: 10_000 });
  let interrupted = false;
  const stop = () => {
    interrupted = true;
    // Stop only this invocation's container, even when the Docker client is interrupted.
    remove();
    child.kill('SIGTERM');
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 130 : 1)));
    });
    if (code !== 0 && !interrupted) throw new Error(`Docker ${tool} exited ${code}. Check that Docker is running and accessible to this user.`);
    return interrupted ? 130 : code;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    // --rm handles successful runs; explicit cleanup also covers startup failures.
    remove();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await runFoundry(process.argv[2], process.argv.slice(3)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
