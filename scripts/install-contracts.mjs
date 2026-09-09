import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { atRoot } from './config.mjs';
for (const [directory, dependency] of [
  ['openzeppelin-contracts', 'OpenZeppelin/openzeppelin-contracts@v5.0.2'],
  ['forge-std', 'foundry-rs/forge-std@v1.9.7'],
]) {
  if (existsSync(atRoot('contracts/lib', directory))) continue;
  const result = spawnSync('forge', ['install', '--root', atRoot('contracts'), '--no-git', dependency], { cwd: atRoot('contracts'), stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
