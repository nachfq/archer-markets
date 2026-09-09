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

The default **Markets** screen contains the options chain. Choose a listed expiration, then select a
call or put in the strike table. The **Review your option** panel shows the exact whole-lot terms
and the available action for the connected wallet. The chain initially shows three
expiration timestamps and five strikes; additional listings can be expanded.
Only funded open offers appear, with no invented bids, trade history, or volume.
Bought options remain under **Portfolio** and cannot be resold or transferred
in this contract version.

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
or use them on a public network. Anvil supplies local ETH. Expand **Wallet & test funds** to access the faucet buttons, which provide
MockUSD and the selected practice market’s MockSTOCK. The seed step already funds both accounts with mocks.
The amounts below are fictional terms, **not TSLA market quotes**.

## Covered call

The creation form offers suggested Friday/monthly deadlines and a separate
**Custom expiration** selector. Suggested dates use 16:00 New York time, with an
explicit UTC preview, and are not adjusted for exchange holidays. The **0.01 token**, **1 token**, and **Max** shortcuts help size affordable offers.
Max uses available wallet collateral, not funds already committed to other options.

1. Account A opens **Write option** and chooses Call, quantity 1, strike per token
   300 MockUSD, premium per token 8 MockUSD, and a future expiration.
2. Approve 1 MockSTOCK to the factory, then create the offer. The stock moves from A
   into the option contract. Approval and creation are separate wallet transactions.
3. Expand **Contract details**, copy the offer link, and open it with account B connected. Acknowledge the manual
   exercise deadline. Approve the premium to
   that option, then buy. A receives 8 MockUSD; the stock remains in escrow.
4. B approves 300 MockUSD to the option and exercises. B receives 1 MockSTOCK and
   A receives 300 MockUSD in the same exercise transaction.
5. Check the Exercised state and balances. The option no longer holds its agreed collateral.

To test buying first, B can instead open one of A's seeded calls and start at step 3.

## Cash-secured put

1. A creates a Put for 1 token, strike per token 250 MockUSD, and premium per token 6 MockUSD.
2. A approves 250 MockUSD to the factory and creates the offer. The test cash is escrowed.
3. B acknowledges the manual exercise deadline, approves and pays the 6 MockUSD
   premium to buy. A receives the premium.
4. B approves 1 MockSTOCK to the option and exercises. A receives the token and
   B receives 250 MockUSD in the same transaction.

## Cancellation and expiration

- The writer can cancel an open offer and recover its collateral.
- A purchased offer cannot be cancelled. Its buyer decides whether to exercise.
- Exercise must be included in a block before expiration. The browser countdown is
  informational; the blockchain timestamp is authoritative.
- At or after expiration, **Portfolio** lets the writer reclaim collateral if the
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

For visual and usability checks against a running local demo, run
`node scripts/ux-browser-review.mjs`. The script writes screenshots and a JSON report
to `/tmp/options-ux-review` by default; `UX_REVIEW_OUTPUT` overrides that directory.
It checks desktop/tablet/mobile layouts, keyboard focus, displayed text contrast,
empty/offline states, and viewport reflow equivalent to 200% desktop zoom.

## Capital, activity, and fractional offers

Markets lists written options awaiting buyers. Connect a wallet to filter between
all listings, options available to buy from other writers, and your own written
options. Your listings show the premium you would receive and a management action;
other writers' listings show the purchase cost. At each strike, the cheapest option
from each writer group stays visible and additional quotes can be expanded.

Use **Write option** to deposit collateral in a newly created, separate option
contract. Approval alone does not deposit tokens. The review panel shows the
collateral amount, contract address, and whether it is held, recoverable, delivered,
or returned. Portfolio's **Closed options** reads final contract states onchain;
**Activity** records this browser's transactions and reconciles their receipts.

Connect a wallet to see available tokens, open-order collateral, active collateral,
and expired collateral ready to reclaim. Portfolio includes every configured market
on the selected chain and lists all owned positions. Markets reads all registered
options, then groups open listings by expiration and strike. Total tracked is not
net portfolio value.
Distinct tokens with the same symbol include their market label and shortened address.

Try quantity 0.01, strike 300, premium 8: the exact exercise total is 3 MockUSD and
premium is 0.08 MockUSD. A call deposits 0.01 stock tokens; a put deposits 3 MockUSD.
The creation summary shows the required deposit and remaining wallet balance. An
unaffordable or unrepresentable lot disables creation and explains the reason.

Activity distinguishes approval from operation and tracks pending hashes across reloads.
Pending transactions pause new actions for that wallet/network until a receipt is known.
A timeout is not treated as a revert. Browser history is not a complete wallet history;
confirmed option positions are independently reconstructed from the onchain registry.
Calendar export adds a review reminder one hour before expiration, not an automatic executor.

Use the Market selector for the separate practice factory. Its MockSTOCK is a different
contract from the primary asset; MockUSD is intentionally shared and counted once.
The practice market starts empty and provides a faucet after connecting.
