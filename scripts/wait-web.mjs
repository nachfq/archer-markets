import { setTimeout } from 'node:timers/promises';
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch('http://localhost:3000', { signal: AbortSignal.timeout(2000) });
    if (response.ok) process.exit(0);
  } catch { /* The first compile may take a few seconds. */ }
  await setTimeout(500);
}
throw new Error('Frontend did not become ready at http://localhost:3000.');
