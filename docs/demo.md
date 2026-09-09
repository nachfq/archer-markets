# Reproducible demo: physical token delivery

## Choose the local demo

The [published private website](https://stock-options-lab.nachofq.chatgpt.site) hosts the
frontend with Robinhood testnet configuration, chain **46630**, and `factory: null`.
It does not currently provide a funded public options market. To test real transactions
before funding a testnet wallet, run the local app against Anvil, chain **31337**.

Anvil sessions are temporary. Start a fresh session when the local services are not
running; saved addresses alone do not provide a running blockchain or deployed contracts.

## Start the local blockchain and application

From the repository root, install dependencies once:

```sh
npm ci
npm run contracts:deps
npm --prefix web ci
```

Keep terminal A running:

```sh
npm run anvil
```

In terminal B:

```sh
npm run deploy:local
npm run seed:local
npm run dev:local
```

Open the server URL, normally `http://localhost:3000`. The seed script creates one call
and one put from each of the first two Anvil accounts, with deposited test collateral.
After every Anvil restart, repeat deployment and seeding.

## Set up two browser wallet accounts

Use a disposable development wallet, separate from any wallet holding real assets.
For the default Anvil configuration, import its **public local-development mnemonic**:

```text
test test test test test test test test test test test junk
```

Create or select the first two accounts derived from that mnemonic:

| Role | Default Anvil address |
|---|---|
| Account A | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Account B | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |

Add a custom network with chain ID **31337**, RPC `http://127.0.0.1:8545`, currency
symbol **ETH**, and no explorer. Connect the local app to account A. Switch the connected
account to B when buying or exercising; separate browser profiles are also suitable.
The writer cannot buy their own offer.

These credentials are public test fixtures, not secrets: never send real assets to them
or use them on a public network. Anvil supplies local ETH. The app's faucet buttons provide
MockUSD and, locally only, MockSTOCK. The seed step already funds both accounts with mocks.
The amounts below are fictional terms, **not TSLA market quotes**.

## Covered call

1. Account A opens **Create offer** and chooses Call, quantity 1, total exercise payment
   300 MockUSD, premium 8 MockUSD, and a future expiration.
2. Approve 1 MockSTOCK to the factory, then create the offer. The stock moves from A
   into the option contract. Approval and creation are separate wallet transactions.
3. Copy the offer link and open it with account B connected. Approve the premium to
   that option, then buy. A receives 8 MockUSD; the stock remains in escrow.
4. B approves 300 MockUSD to the option and exercises. B receives 1 MockSTOCK and
   A receives 300 MockUSD in the same exercise transaction.
5. Check the Exercised state and balances. The option no longer holds its agreed collateral.

To test buying first, B can instead open one of A's seeded calls and start at step 3.

## Cash-secured put

1. A creates a Put for 1 token, total exercise payment 250 MockUSD, and premium 6 MockUSD.
2. A approves 250 MockUSD to the factory and creates the offer. The test cash is escrowed.
3. B approves and pays the 6 MockUSD premium to buy. A receives the premium.
4. B approves 1 MockSTOCK to the option and exercises. A receives the token and
   B receives 250 MockUSD in the same transaction.

## Cancellation and expiration

- The writer can cancel an open offer and recover its collateral.
- A purchased offer cannot be cancelled. Its buyer decides whether to exercise.
- Exercise must be included in a block before expiration. The browser countdown is
  informational; the blockchain timestamp is authoritative.
- At or after expiration, **My positions** lets the writer reclaim collateral if the
  option was not exercised. The writer keeps any premium already paid.
- `npm run test:e2e` checks the exact expiration boundary using controlled Anvil time;
  no manual waiting is required for that test.

## Optional automated checks

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e
```

The end-to-end test requires the deployed local contracts and running Anvil. It advances
local time. For a fresh manual demo afterward, restart Anvil, then repeat `deploy:local`
and `seed:local` so the chain clock matches the browser clock again.

With Anvil and the local frontend running, test the browser workflow:

```sh
npx playwright install chromium
npm run test:browser
```

Browser tests use local EIP-1193 wallet fixtures backed by Anvil, not real wallet
extensions. They check UI transactions, option states, and balances. The last test
advances Anvil time; restart Anvil and repeat deployment and seeding before a manual
demo. Evidence files are ignored under `deployments/`.

The optional `RobinhoodForkTest` command in the [README](../README.md) exercises the
existing TSLA implementation on a local RPC fork with synthetic balances. It sends
no public transactions and does not replace a funded testnet demo.

## Move the demo to testnet later

Follow `deploy:testnet`, `seed:testnet`, and `verify:testnet` in the README with funded
testnet wallets. On that network, the underlying is the existing TSLA token obtained
from Robinhood's faucet; the app only mints our MockUSD. Explorer transaction links
become public evidence only after those transactions actually occur.

Deploying contracts and publishing a website are separate steps. The existing hosted
frontend remains configured without a factory until an updated frontend configuration
is published.
