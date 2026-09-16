# Stock Options Lab

Write a fully collateralized Stock Token option, or request the option you want to buy.
Each agreement becomes **one independent contract**, with manual American exercise and
physical token delivery. Built by agents under human coordination for an Arbitrum hackathon.

## Status: development, not a testnet launch

**The V3 product is implemented in this repository. It is not deployed to Robinhood
Chain Testnet and has not undergone a public testnet acceptance run.** The target chain
is Robinhood Chain Testnet (46630). Its checked-in frontend configuration has no factory
or payment-token deployment address, so trading there remains disabled.

A [previously hosted frontend](https://stock-options-lab.nachofq.chatgpt.site) is a website,
not evidence of deployed or funded protocol contracts. Do not assume that it runs this
revision. Local Anvil tests, optional RPC-fork tests and synthetic demo fixtures are
separate development evidence. None establishes a public deployment, an audit, human
usability validation or demand. See the dated [implementation record](docs/implementation.md).

## Two ways to create an agreement

| Action | Who deposits first? | What happens next? |
| --- | --- | --- |
| **Write option** | Writer deposits all collateral into a new option contract | A buyer pays the full premium directly to the writer and receives the exercise right |
| **Request option** | Buyer reserves the full premium in the factory, tracked by request ID | A writer accepts all terms and deposits all collateral; the factory creates one active option for the buyer and pays the writer |

Requests have an **acceptance deadline earlier than the option expiration**. An unaccepted
request can be canceled to recover its entire premium, including after the acceptance
deadline. Refunds require a transaction. A request does not grant an exercise right until
it is accepted. After acceptance, its premium is paid and cannot be refunded by canceling
the request.

V3 quantities must be positive multiples of **0.1 token**. This is the minimum lot, not
the size of a deployed contract: an agreement covering 10 tokens creates **one contract
for 100 lots**, not 100 contracts. Requests are accepted in full. There is no partial fill,
order matching engine, automatic crossing, margin or oracle settlement.

| Option | Writer collateral | Holder delivers at exercise | Holder receives |
| --- | --- | --- | --- |
| Call | Full Stock Token quantity | Total exercise payment | Full Stock Token quantity |
| Put | Total exercise payment | Full Stock Token quantity | Total exercise payment |

The UI asks for **total exercise payment** and **total premium**. Per-token strike is
exercise payment divided by quantity. The immutable agreed amounts are used at exercise;
no market-price lookup is required. Exercise must execute before the onchain expiration.
At or after expiration, the writer can reclaim unused collateral. Approval alone moves
no collateral or premium. Each actual exchange is atomic.

Existing V2 whole-option resale is retained in V3: the current holder may sell the entire
right at a fixed price. Collateral and exercise terms remain attached to the same option.
V1/V2 deployments are not upgraded; buy requests require a new V3 factory.

## Try it locally

Requirements: Node.js 22.13+, npm and Foundry (`forge`, `anvil`) on `PATH`.
Dependencies are pinned. Run from the repository root:

```sh
npm ci
npm run contracts:deps
npm --prefix web ci
npm run build
```

In terminal A, start a temporary local chain:

```sh
npm run anvil
```

In terminal B, deploy a small V3 practice setup, seed a few written options and start the UI:

```sh
npm run deploy:local
npm run seed:local
npm run dev:local
```

Open the URL printed by the server, normally <http://localhost:3000>. Use a disposable
local wallet on chain **31337**, RPC `http://127.0.0.1:8545`. Public Anvil development
accounts are only for local use. The wallet menu provides mock-token faucets.

**Anvil is temporary.** A saved manifest is not a running deployment. Starting a fresh
node requires fresh deployment. Deployment refuses to overwrite an existing live factory;
if preserving an older live demo, use a separate node/manifest for V3 validation rather
than resetting it. The [walkthrough](docs/demo.md) covers the two-wallet request demo.

The optional [five-market fixture](docs/local-demo-v2.md) creates 390 synthetic options.
New runs use V3 contracts; its historic filename is retained. These fixtures are not
users, volume or live quotes. They are unnecessary for the small request demo.

## SDK and portability

[`@stock-options-lab/sdk`](packages/sdk/README.md) provides version-aware reads, portfolio
accounting, request/create/buy/exercise/resale/cancel/reclaim preparation, approval amounts,
simulation and structured errors. It takes caller-supplied RPC clients and market configs;
it holds no keys and has no React dependency. ABIs are generated from the Solidity build.

Factories use a fixed pair of non-rebasing ERC-20 tokens with exact transfers. Market
configuration identifies chain, factory version, addresses, decimals and deployment block.
This supports modular EVM integration; it does not prove compatibility with every RWA or
another public chain. Quantities are raw token units, not guaranteed share equivalents.

## Run checks without touching your demo

```sh
npm test
npm run typecheck
npm --prefix web run lint
npm run build
```

For the complete isolated protocol, SDK and browser acceptance run:

```sh
npx playwright install chromium
npm run test:acceptance
```

Run `npm run build` first. The runner starts its own loopback Anvil and frontend on
available ports, deploys fresh V3 fixtures, and runs both option and request browser
workflows. It copies frontend source without `.env` files, keeps a private local
manifest, saves logs/receipts under an ignored `.qa-tmp-e2e-*` directory, and stops
its services afterward. It never resets your demo node or replaces the checked-in
browser manifest. The browser wallets are injected local fixtures.

For transaction checks, start **another** Anvil instance in its own terminal:

```sh
anvil --host 127.0.0.1 --port 8547 --chain-id 31337 --silent
```

In a separate terminal, deploy isolated fixtures without changing the browser manifest:

```sh
export ANVIL_RPC_URL=http://127.0.0.1:8547
export DEMO_MANIFEST=deployments/local-v3-check.json
export DEMO_LEDGER=deployments/local-v3-check-ledger.json
npm run demo:local -- --deploy-only --no-export
npm run test:e2e
```

Use fresh manifest/ledger filenames if restarting that temporary node. E2E tests send
local transactions and advance time. They cover writing, purchasing, resale, requests,
exercise, cancellation, refunds and recovery. Never run them against an active user demo.
`npm test` runs Solidity, script, SDK and frontend tests; the optional Robinhood RPC-fork
test only runs when `RH_RPC_URL` is set and still executes locally with synthetic balances.

## Before a Robinhood testnet launch

A launch remains separate work: fund a fresh disposable testnet wallet, verify the selected
Stock Token and gas balance, deploy V3 contracts, record receipts, run a two-wallet
acceptance exercise and publish the frontend with the verified manifest. Existing scripts
include `wallet:testnet`, `check:testnet`, `deploy:testnet`, `seed:testnet` and
`verify:testnet`; their existence is **not evidence those steps have been completed**.
Keep signing keys in ignored local `.env` files only. No mainnet is supported.

See [request architecture](docs/buy-requests.md), [product roadmap](docs/product-roadmap.md),
[research](docs/research/README.md), [Stylus assessment](docs/stylus-assessment.md) and
[repository coordination](AGENTS.md). Repository content is in English; human coordination
may be in Spanish.

See the [MVP security review](docs/security-review.md) and
[Open House Singapore submission path](docs/hackathon-readiness.md) for the latest
local acceptance results, release limits and proposed next steps.
