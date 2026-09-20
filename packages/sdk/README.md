# Archer Markets SDK

TypeScript/viem SDK for V4 onchain limit orders and V1–V3 position management.
It prepares transactions; the caller supplies the wallet and signs. Test networks only.

From the repository root: `npm run sdk:build`. The workspace package is
`@stock-options-lab/sdk`; it has not been published to npm.

```ts
import { prepareOrderV4, simulatePrepared } from '@stock-options-lab/sdk';

const operation = await prepareOrderV4(client, market, account, {
  optionType: 0,           // Call; 1 = Put
  strikeTotal: 300_000_000n,
  premium: 10_000_000n,    // Limit: 10 quote tokens with 6 decimals
  expiry,                 // Unix seconds
  buy: true,
});
// Execute operation.approval if present; wait for its successful receipt.
// Check the wallet account and chain again before sending.
await simulatePrepared(client, operation);
const hash = await walletClient.sendTransaction(operation.request);
// Await the receipt: OrderExecuted gives the actual price; OrderPosted means open.
```

`market` needs `version: 4`, chain ID, factory, deployment block and token metadata.
Each order covers exactly **one token**. Strike and premium are bigint base units,
with 0.01 increments. A crossing limit fills one resting order at its price and FIFO
priority; otherwise funds remain reserved. A simulation does not guarantee execution.

- **Read:** `getMarkets(client, markets, account)`, `getPortfolio`, `getOption`.
  Include the account for holdings/history. Reads share a block and use bounded pages.
- **Book:** `getDepthV4`, `getOrderV4`, `getSeriesV4`.
- **Manage:** `prepareResaleV4`, `prepareCancelV4`, `prepareExercise`, `prepareReclaim`.
- **Errors:** `decodeProtocolError`; **amounts:** `parseAmount`, `priceTicks`.

V4 `prepareBuy`/`prepareBuyResale` compatibility helpers create limit orders: the book
may select another eligible option in the same series. To edit a price, cancel and
replace the order, losing FIFO priority. Fee/rebasing tokens are unsupported.

Run `npm run test:acceptance:v4` for isolated Docker protocol/SDK/browser checks.
[Legacy SDK reference](../../docs/research/sdk-v3.md) · [Product rules](../../docs/how-it-works.md)
