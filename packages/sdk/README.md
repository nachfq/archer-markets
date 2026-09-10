# Stock Options Lab SDK

A framework-independent TypeScript SDK for fully collateralized, physically delivered
American options. It uses public manifests and caller-supplied viem clients. It never
stores keys or signs on behalf of an integration. It supports legacy protocol v1 and
protocol v2 whole-option resale. There is no automatic exercise, oracle settlement,
or mainnet configuration. Omitted market versions default to 1; version 2 factories
must report `version() == 2`.

## Install and build

From the repository root:

```sh
npm install
npm run sdk:build
npm pack --workspace @stock-options-lab/sdk
```

Install the resulting `.tgz` in another project using `npm install /path/to/package.tgz`.
The package exports compiled ESM and TypeScript declarations; Node and browser consumers
need no React or application imports. It has not been published to the npm registry.

## Read and prepare

```ts
import { createPublicClient, http } from 'viem';
import { getPortfolio, prepareBuy, simulatePrepared } from '@stock-options-lab/sdk';

const client = createPublicClient({ transport: http(chainConfig.rpcUrl) });
const portfolio = await getPortfolio(client, [marketConfig], walletAddress);
const operation = await prepareBuy(client, marketConfig, walletAddress, optionAddress);

// If operation.approval exists, approve its exact token/amount/spender and await
// the successful receipt. An approval is not a purchase or collateral deposit.
// Check that the wallet account AND network still match the prepared operation.
await simulatePrepared(client, operation);
const hash = await walletClient.sendTransaction(operation.request);
// Wait for a successful receipt before reporting success or refreshing balances.
```

`ChainConfig` contains chain ID, RPC and explorer configuration. `MarketConfig` contains
an ID, chain ID, factory, deployment block, protocol version, two `TokenConfig` entries,
and a sandbox flag. Token identity is chain ID plus address, never ticker alone.
Use a separate client per chain. Market factories and decimals are checked against RPC.

Exports include `getMarkets`, `getOption`, `getPortfolio`, `prepareCreateOffer`,
`prepareBuy`, `prepareExercise`, `prepareCancel`, `prepareReclaim`, `simulatePrepared`,
`decodeProtocolError`, `parseAmount`, `quoteTotal`, `maximumQuantity`, and generated ABIs.
Version 2 also exports `prepareListResale`, `prepareCancelResale`, and
`prepareBuyResale`. The last takes the reviewed `{ seller, price, nonce }` quote;
do not silently replace it with a refreshed price before sending. The contract
validates the quote atomically. Listing can be edited by listing again; it never
locks exercise. Self-purchases and original-writer buybacks are forbidden.
All amounts use bigint base units. `quoteTotal` converts quantity and per-token price
into an exact whole-lot payment, rejecting unrepresentable totals rather than rounding.
Max put quantity may be zero when no positive exact lot fits the balance at that price.

Portfolio snapshots read every option at one mined block. Shared token balances and
collateral are not double-counted. `totalTracked` is a token quantity, not net asset
value: the writer still has obligations against active collateral. A failed registry
or token read rejects the snapshot rather than returning a misleading complete total.
Immutable registry addresses and terms are cached after checking the prior block hash;
position states, holders and listings are always read again at one snapshot block.
V2 purchase/resale events retain past holders and actual payment history. V1 reads
never call resale getters. Initial reads and state refresh scale linearly with
option count. This is appropriate for a small pilot, not a production indexer.

`ProtocolError` supplies a stable code, message, next action, and optional structured
amounts or diagnostics. Simulations are advisory; a later transaction may still revert.
Receipts do not necessarily contain revert bytes. Unknown causes must remain unknown.

The Robinhood display adapter reads `uiMultiplier()` only for display. Exact token
amounts remain the settlement units. Fee-on-transfer and rebasing tokens are not
supported; restricted tokens require issuer-specific compatibility tests.

## Executable integration example

With a deployed local Anvil manifest:

```sh
node packages/sdk/examples/lifecycle.mjs deployments/31337.json
```

The example uses only SDK exports, viem, Node built-ins, and the manifest. It exercises
call, put, cancel, and recovery paths with conservation checks. It verifies loopback,
chain 31337, and Anvil before using public development accounts. It advances local time
by one minute. Never adapt these development accounts for a public chain.
