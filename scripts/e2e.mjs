// Select the protocol suite from the supplied deployment manifest.
import { spawn } from 'node:child_process';
import { readJson, reportError } from './config.mjs';
try {
  const manifest = await readJson(process.env.DEMO_MANIFEST ?? 'deployments/31337.json');
  const files = manifest.version === 4 ? ['smoke-v4.mjs'] : ['smoke.mjs', 'smoke-resale.mjs', 'smoke-requests.mjs'];
  if (manifest.version === 4 && !process.env.EVIDENCE_DIR) throw new Error('Use npm run test:acceptance:v4 for an isolated V4 deployment and evidence directory.');
  for (const file of files) {
    const child = spawn(process.execPath, [`scripts/${file}`], { stdio: 'inherit', env: process.env });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    if (code !== 0) throw new Error(`${file} failed.`);
  }
} catch (error) { reportError(error); }
