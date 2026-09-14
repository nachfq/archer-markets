# Stock Options Lab

[Open the private frontend](https://stock-options-lab.nachofq.chatgpt.site) ·
[Local demo walkthrough](docs/demo.md)

A factory for **fully collateralized calls and puts with physical Stock Token delivery**,
implemented as a Robinhood Chain Testnet proof of concept. The repository is explicitly
built by agents under human coordination to explore a product for Arbitrum Open House Singapore.

The writer sets the token quantity, total exercise payment, premium, and expiration.
Another wallet buys the entire lot and can exercise manually before expiration.
Exercise exchanges both assets atomically. The premium goes to the writer at purchase.
Local V2 markets also let the current holder resell the whole exercise right for a
new total price. Collateral and original exercise terms do not change; existing V1
contracts are not upgraded. See the [five-market demo and resale guide](docs/local-demo-v2.md).

| Option | Collateral at creation | Buyer delivers on exercise | Buyer receives |
|---|---|---|---|
| Call | Full Stock Token quantity | Agreed MockUSD payment | Stock Tokens |
| Put | Agreed MockUSD payment | Agreed Stock Token quantity | MockUSD |

## What is deployed?

| Environment | Current state | What you can test |
|---|---|---|
| [Published private website](https://stock-options-lab.nachofq.chatgpt.site) | Hosted frontend configured for Robinhood testnet, chain **46630**; `factory: null` and MockUSD address unset | Inspect the interface and deployment status. It is not a funded live-contract demo. |
| Local Anvil, chain **31337** | Factory, options, MockUSD, and MockSTOCK were deployed and tested locally | The complete two-wallet workflow after starting Anvil and deploying afresh. |
| Robinhood RPC fork | Local simulation using the existing TSLA contract implementation and synthetic balances | Actual token-code compatibility, without public transactions or a testnet deployment. |

**Anvil sessions are temporary.** The saved local manifest does not start a node
or preserve contracts across a fresh Anvil session. Follow the local setup below
whenever the local services are not already running.
Publishing the website did not deploy contracts to Robinhood. A public contract deployment
still requires a funded testnet wallet. MockUSD and MockSTOCK have no real value.

## Product roadmap and SDK

The [product roadmap](docs/product-roadmap.md) records the pilot direction; local V2 resale
is now implemented as described in the [current demo guide](docs/local-demo-v2.md).
EVM portability remains a separate roadmap item. The [standalone SDK](packages/sdk/README.md) is shared by the web
and seed scripts; it exports reads, portfolio snapshots, transaction preparation and
structured errors without React. Package it with `npm pack --workspace @stock-options-lab/sdk`.

## Run the complete five-market demo locally

The commands in this section install and compile the contracts, start a temporary
Anvil blockchain, deploy five V2 markets, seed 390 options, and start the frontend.
Run every command from the repository root. Nothing in this workflow sends a public
transaction.

### 1. Install the toolchain and dependencies once

Requirements: Node.js 22.13+ (developed with Node 24), npm, and
[Foundry](https://book.getfoundry.sh/getting-started/installation) with `forge` and
`anvil` available on `PATH`. Solidity dependencies are pinned to OpenZeppelin 5.0.2
and forge-std 1.9.7.

```sh
npm ci
npm run contracts:deps
npm --prefix web ci
```

`npm run contracts:deps` installs the pinned Solidity libraries under `contracts/lib`.
It only needs to be repeated after deleting that directory or changing a pinned
contract dependency.

### 2. Terminal A: start the local blockchain

```sh
npm run anvil
```

Keep this terminal running. Anvil listens at `http://127.0.0.1:8545` with chain ID
**31337**. Stopping Anvil destroys the deployed contracts and balances for that session.

### 3. Terminal B: compile, deploy, and seed 390 options

Open a second terminal in the repository root. First compile the contracts, export
their ABIs, and build the SDK used by the deployment script:

```sh
npm run contracts:build
npm run abi
npm run sdk:build
```

Create unique local evidence files for this Anvil session, inspect the write-free plan,
then deploy and seed it:

```sh
export DEMO_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
export DEMO_MANIFEST="deployments/31337-${DEMO_RUN_ID}.json"
export DEMO_LEDGER="deployments/local-demo-v2-${DEMO_RUN_ID}.json"

npm run demo:local -- --dry-run
npm run demo:local
```

Keep the three exported values in the same terminal until seeding finishes. The first
command reports the planned 390 options and performs no writes. The second command:

- deploys MockUSD, five Mock Equity tokens, and five V2 option factories;
- creates 78 options each for Mock Tesla, NVIDIA, Apple, Amazon, and Microsoft;
- records 360 open primary offers, 10 purchased rights, 10 resale listings, and
  10 canceled options; and
- updates the local browser manifest used by the frontend.

It only sends transactions from Anvil accounts 1–9. Account 0 is deliberately reserved
for the person testing through their wallet. Wait for `Complete: 390 recorded options`
before starting the frontend.

Do not run `npm run deploy:local` or `npm run seed:local` for this workflow.
`demo:local` already performs the required V2 deployments. `seed:local` is the older
four-offer V1 fixture and uses account 0.

### 4. Terminal C: start the frontend

After seeding completes, open a third terminal in the repository root:

```sh
npm run dev:local
```

Open the URL printed by the server, normally <http://localhost:3000>. Configure an EVM
browser wallet with chain ID **31337** and RPC `http://127.0.0.1:8545`, then import only
a disposable local Anvil account. [Wallet setup and buy/exercise steps](docs/demo.md)
cover the manual workflow. Anvil credentials are public and must only be used locally;
the application does not embed them in its browser bundle.

### Restart and resume rules

- If `demo:local` is interrupted while the same Anvil process is still running, keep
  Terminal A alive and rerun `npm run demo:local` from the same Terminal B. The saved
  ledger resumes completed transactions instead of duplicating them.
- If Anvil stops or the computer restarts, start again at step 2 and generate a new
  `DEMO_RUN_ID`, manifest, and ledger in step 3. A new Anvil process is an empty chain,
  even though its default account addresses look identical.
- Do not delete a ledger and reseed while its original Anvil session is still active;
  that would create a second set of fixtures.
- Stop the frontend and Anvil with `Ctrl+C` in terminals C and A when finished.

The local manifest and ledger are ignored evidence files. They distinguish this
synthetic chain-31337 run from the hosted chain-46630 frontend, which still has no
factory address. See the [detailed V2 demo and resale guide](docs/local-demo-v2.md).

## Verification

```sh
npm test
npm run typecheck
npm run build
ANVIL_RPC_URL=http://127.0.0.1:8546 npm run test:e2e   # isolated fork of the deployed local demo
npm run test:sdk:e2e  # standalone SDK consumer; local transactions
```

The end-to-end smoke test sends local transactions from two other accounts and checks
balance conservation, permissions, atomic rollback, and expiration. **It advances
Anvil time**: use an isolated fork on port 8546, never the active demo node. Evidence is
written to the ignored `deployments/local-smoke.json`.

Optional integration with the existing TSLA implementation, without public transactions:

```sh
RH_RPC_URL=https://rpc.testnet.chain.robinhood.com forge test --root contracts --match-contract RobinhoodForkTest -vv
```

The fork requires an accessible RPC; test balances are created only in the local copy.
See the [validation and contribution record](docs/implementation.md).

For functional browser testing, keep Anvil and `dev:local` running after deployment:

```sh
npx playwright install chromium
ANVIL_RPC_URL=http://127.0.0.1:8546 npm run test:browser
```

This uses three test wallet providers backed by unlocked Anvil accounts 1, 8 and 9, interacts with
buttons, and checks transactions and balances. It only accepts loopback hosts and
chain 31337. It does not automate a real wallet extension or send private keys to the
browser. Its final scenario advances local chain time.

## Robinhood Chain Testnet

For the Solidity-versus-Stylus tradeoff and the read-only CacheManager checks, see
the [Stylus assessment](docs/stylus-assessment.md). The current options remain Solidity.

Chain **46630**, with ETH for gas. [Official configuration](https://docs.robinhood.com/chain/connecting/),
[faucet](https://faucet.testnet.chain.robinhood.com/),
and [explorer](https://explorer.testnet.chain.robinhood.com).

```sh
npm run wallet:testnet  # creates ignored .env with mode 600; never overwrites an existing file
npm run check:testnet   # reads chain, bytecode, decimals, and balances; sends no transfers
```

Fund the printed address with test ETH and test TSLA, and verify that the received
token matches the configured address. The TSLA integration contract is
`0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` (18 decimals).
If `.env` already exists, preserve it and use the address printed by `check:testnet`.

```sh
npm run deploy:testnet
npm run seed:testnet
npm run verify:testnet
npm run dev
```

`deploy:testnet` deploys MockUSD and a factory using the existing Stock Token, plus
a separate MockSTOCK practice market sharing the same MockUSD payment token.
`verify:testnet` verifies the factory, MockUSD, and an existing instance of each
option type in the explorer. `seed:testnet` defaults to 0.01 test TSLA per wallet
and creates offers at arbitrary demonstration prices. Override the quantity with
`SEED_QUANTITY=0.02 npm run seed:testnet`; totals scale with the lot. Configure an optional second
testnet wallet in `BUYER_PRIVATE_KEY` to create offers from both participants.
Keep private keys only in `.env`, never in code, manifests, or messages.

Deployment rejects other networks and public Anvil development accounts on testnet.
Browser manifests use public RPC endpoints; private endpoints remain in ignored local
records. Rerunning deployment preserves an existing factory. If a partial deployment
fails, inspect its record before retrying. A later contract deployment updates local
frontend configuration; publishing that updated frontend is a separate operation.

## First-iteration limits

- **Manual American exercise:** buying and exercising require `timestamp < expiry`.
  From `expiry`, the writer can reclaim unexercised collateral.
- Quantities use raw ERC-20 token units. They do not adjust for stock splits or
  represent exchange-traded options over a fixed number of equity shares.
- One offer, one buyer, the entire lot; fixed positive premium and total exercise
  payment. No oracle, AMM, cash-settled difference, or secondary market.
- Each factory uses a configured pair of non-rebasing ERC-20s without transfer fees.
  Transfers check exact balance changes at both ends.
- No administrator, upgrades, or rescue function. Unsolicited transfers outside
  the agreed collateral cannot be recovered. A regression test ensures advance
  donations cannot block the creation of new offers.
- Local and fork tests do not replace review for real funds. The PoC does not
  establish demand or the availability of counterparties.

## Repository organization

- `contracts/`: factory, options, test tokens, and Foundry tests.
- `web/`: React and TypeScript on Vite/vinext, wagmi, and viem; Sites integration.
- `scripts/`: deployment, manifests, ABIs, verification, and wallet workflows.
- [Demo walkthrough](docs/demo.md) and [implementation record](docs/implementation.md).
- [Seven-vertical research](docs/research/README.md) and
  [Arbitrum signals and hackathon](docs/research/arbitrum-signals.md).

The human coordinator selected the idea and physical token delivery. Agents implemented,
tested, and reviewed the code. The product does not require runtime AI agents to operate.
See the [collaboration rules](AGENTS.md). Repository content is maintained in English;
conversation with the coordinator may remain in Spanish.
