import { existsSync } from 'node:fs';
import { runFoundry } from './foundry.mjs';
import { atRoot } from './config.mjs';
for (const [directory, dependency] of [
  ['openzeppelin-contracts', 'OpenZeppelin/openzeppelin-contracts@v5.0.2'],
  ['forge-std', 'foundry-rs/forge-std@v1.9.7'],
]) {
  if (existsSync(atRoot('contracts/lib', directory))) continue;
  try {
    const code = await runFoundry('forge', ['install', '--no-git', dependency]);
    if (code !== 0) process.exit(code);
  } catch (error) { console.error(error.message); process.exit(1); }
}
