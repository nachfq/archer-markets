# Try Archer Markets locally

Use two disposable wallets in separate browser profiles. Start with **maker = writer**
and **taker = buyer**. All assets below are local mocks with no real value.

## 1. Start the app

Requirements: Node.js 22.13+ and a running Docker engine accessible to your user
([Linux permissions setup](https://docs.docker.com/engine/install/linux-postinstall/)).
Foundry runs in Docker; no native `forge`, `anvil` or `cast` installation is needed.
From the repository root:

```sh
docker version
npm ci
npm --prefix web ci
npm run contracts:deps
```

Terminal A — keep the local chain running:

```sh
npm run anvil
```

Terminal B — deploy the contracts and start the frontend:

```sh
npm run deploy:local
npm run dev:local
```

Open the printed URL, normally <http://localhost:3000>, in both profiles.
Select **Mock Stock** in both. The empty market is expected: you will create its first offer.

## 2. Prepare both wallets

Add the network to each wallet: **Local Anvil**, RPC **http://127.0.0.1:8545**,
chain ID **31337**, currency **ETH**, no explorer. Connect each wallet to the app.

Give each address 2 local ETH for gas, replacing the placeholders with its public address:

```sh
npm run wallet:fund:local -- YOUR_MAKER_ADDRESS YOUR_TAKER_ADDRESS
```

In **Wallet menu**, choose **Get MockUSD** and **Get MockSTOCK** for each wallet.
Confirm the faucet transactions. **Portfolio → Available** should show the tokens.
You need at least 0.2 MockSTOCK for the writer and 62 MockUSD for the buyer.

## 3. Maker: write a call

Go to **Trade → Write Options**. Choose **Call**, enter **0.2** tokens,
**60** total exercise payment, **2** total option price, and **Custom expiration…** set to tomorrow.
Review, approve the collateral if prompted, then confirm creation.

The writer's available stock decreases by **0.2**. That amount is now locked in the
option; no premium has arrived yet. Find the offer in **Portfolio** and **Buy Options**.

## 4. Taker: buy and exercise

In the other profile, open **Trade → Buy Options**, select the expiration and expand
the **300** strike row (60 ÷ 0.2). Select the maker's offer, review it and acknowledge
manual exercise. Approve the **2 MockUSD** premium if needed, then confirm purchase.

The buyer now holds the option. The writer receives **2 MockUSD** and cannot cancel it.
In the buyer's **Portfolio**, expand the position and choose **Review exercise**.
Approve **60 MockUSD** if needed, then exercise before expiration.

| Wallet | Final stock change | Final MockUSD change |
| --- | --- | --- |
| Maker / writer | −0.2 | +62 |
| Taker / buyer | +0.2 | −62 |

Compare against balances after the faucets. Gas affects ETH separately. The option
should show **Exercised** under **Portfolio → Closed & resold options**, with no
remaining collateral. Buying alone does not deliver stock.

## 5. Reverse the roles: request a put

The buyer is now the **maker**. In **Trade → Buy Requests → Request option**, choose
**Put**, quantity **0.2**, exercise payment **60**, premium **2**, expiration tomorrow,
and **Accept until** earlier than expiration. Approve and reserve the premium.
Portfolio now shows **2 MockUSD in request premiums**; there is no option yet.

The writer is now the **taker**. Open the request, review and **Accept & write option**.
The writer must have **60 MockUSD upfront**: the 2 premium cannot fund the deposit.
Acceptance locks 60, pays the writer 2 and gives the buyer one option.

The buyer exercises from Portfolio, delivering **0.2 MockSTOCK** to receive **60 MockUSD**.
Net for this put alone: buyer −0.2 stock / +58 MockUSD; writer +0.2 stock / −58 MockUSD.

## Where to check / retry

- **Portfolio:** available balances, locked collateral, reserved premiums and positions.
  Expand a position for **Contract details & exercise funding**, including its address.
- **Activity:** submitted transactions and confirmation status in this browser.
- **Cancellation:** publish a second offer or request, leave it unaccepted, then cancel.
  Its collateral or reserved premium should return in full.
- **After expiration:** exercise is unavailable. Writers reclaim unused collateral;
  requesters recover unaccepted premiums. Neither recovery happens automatically.

Ctrl+C stops Anvil and removes its container and state. After restarting it, redeploy
and repeat funding;
if your wallet reports a stale nonce, clear its local activity for this network.
If the app shows Robinhood Chain Testnet, restart with `npm run dev:local`.
If the first page load fails while Vite prepares dependencies, stop and restart
`npm run dev:local`, then reload. Never run time-advancing E2E tests against this node.

[How it works](how-it-works.md) · [Automated checks and evidence](research/security-review.md)
