# Stock Options Lab

[Open the private frontend](https://stock-options-lab.nachofq.chatgpt.site) ·
[Local demo walkthrough](docs/demo.md)

A factory for **fully collateralized calls and puts with physical Stock Token delivery**,
implemented as a Robinhood Chain Testnet proof of concept. The repository is explicitly
built by agents under human coordination to explore a product for Arbitrum Open House Singapore.

The writer sets the token quantity, total exercise payment, premium, and expiration.
Another wallet buys the entire lot and can exercise manually before expiration.
Exercise exchanges both assets atomically. The premium goes to the writer at purchase.

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

## Run locally before using testnet

Requirements: Node.js 22.13+ (developed with Node 24), npm, and Foundry (`forge`, `anvil`).
Solidity dependencies are pinned to OpenZeppelin 5.0.2 and forge-std 1.9.7.

Install once from the repository root:

```sh
npm ci
npm run contracts:deps
npm --prefix web ci
```

In terminal A, start and keep the local blockchain running:

```sh
npm run anvil
```

In terminal B, deploy contracts, create funded demo offers, and start the local frontend:

```sh
npm run deploy:local
npm run seed:local
npm run dev:local
```

Open the URL printed by the server, normally `http://localhost:3000`.
Use two disposable Anvil development accounts in an EVM browser wallet with chain
**31337** and RPC `http://127.0.0.1:8545`. The seed script creates four collateralized
offers across the first two Anvil accounts. [Wallet setup and buy/exercise steps](docs/demo.md)
cover the manual test. Anvil credentials are public and must only be used locally;
the application does not embed them in its browser bundle.

Deployment scripts export compiled ABIs, addresses, and the initial block to the app.
After restarting Anvil, rerun `deploy:local` and `seed:local` before testing.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e   # requires Anvil and deploy:local
```

The end-to-end smoke test sends local transactions from two other accounts and checks
balance conservation, permissions, atomic rollback, and expiration. **It advances
Anvil time**: run it before `seed:local` when preparing fresh demo offers. Evidence is
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
npm run test:browser
```

This uses two test wallet providers backed by unlocked Anvil accounts, interacts with
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

`deploy:testnet` deploys MockUSD and the factory, using the existing Stock Token.
`verify:testnet` verifies the factory, MockUSD, and an existing instance of each
option type in the explorer. `seed:testnet` requires at least one test TSLA per wallet
and creates offers at arbitrary demonstration prices. Configure an optional second
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
- Only the configured pair of non-rebasing ERC-20s without transfer fees.
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
